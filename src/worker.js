/**
 * Cloudflare Worker —— AI 工具的通用 API 代理
 *
 * 设计原则：
 * - 不在源码或环境变量中存储任何用户凭据
 * - 用户凭据由浏览器在每次请求时通过 Header 提交
 * - Worker 仅作为透传，不记录/不持久化任何请求内容
 * - 仅放行已知的公开 API 端点，避免被滥用
 *
 * 暴露端点：
 *   POST /api/baidu/oauth      换取百度 Access Token
 *   POST /api/baidu/enhance    图像清晰度增强
 *   POST /api/baidu/upscale    图像无损放大（x2）
 *   POST /api/proxy            通用请求代理（仅限 http/https，禁私网/环回地址）
 *   /api/secret/*              私密内容分享（端到端加密，仅存密文）
 *   /s/<id>                    私密内容查看页（静态页，密钥仅存在于 URL fragment）
 */

import { handleSecretRoutes } from './secret.js';

const ALLOWED_UPSTREAM = 'aip.baidubce.com';
// 端点白名单：路径 + 上游 method（用 path 不带 query 匹配）
const ALLOWED_ENDPOINTS = {
  '/oauth/2.0/token': { method: 'POST', upstream: '/oauth/2.0/token' },
  '/rest/2.0/image-process/v1/image_definition_enhance/enhance': {
    method: 'POST',
    upstream: '/rest/2.0/image-process/v1/image_definition_enhance/enhance',
  },
  '/rest/2.0/image-process/v1/image_quality_enhance': {
    method: 'POST',
    upstream: '/rest/2.0/image-process/v1/image_quality_enhance',
  },
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Baidu-Api-Key, X-Baidu-Secret-Key, X-Baidu-Access-Token',
  'Access-Control-Max-Age': '86400',
};

// /api/proxy 的 CORS 头：仅允许浏览器自带 Content-Type
const PROXY_CORS_HEADERS = {
  ...CORS_HEADERS,
  'Access-Control-Allow-Headers': 'Content-Type',
};

function jsonResponse(body, status = 200, headers = CORS_HEADERS) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function upstreamHeaders(req) {
  return {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Accept': req.headers.get('Accept') || 'application/json',
  };
}

async function handleBaidu(request, path) {
  const ep = ALLOWED_ENDPOINTS[path];
  if (!ep || ep.method !== request.method) {
    return jsonResponse({ error: 'unsupported_path', error_description: '端点不允许' }, 400);
  }

  const apiKey = request.headers.get('X-Baidu-Api-Key') || '';
  const secretKey = request.headers.get('X-Baidu-Secret-Key') || '';
  const token = request.headers.get('X-Baidu-Access-Token') || '';
  const url = new URL(request.url);

  const upstream = new URL('https://' + ALLOWED_UPSTREAM + ep.upstream);

  if (url.searchParams.has('access_token') && token) {
    upstream.searchParams.set('access_token', token);
  } else if (token) {
    upstream.searchParams.set('access_token', token);
  }

  const body = request.body;
  const headers = upstreamHeaders(request);

  if (path === '/oauth/2.0/token') {
    if (!body) return jsonResponse({ error: 'missing_body' }, 400);
  } else {
    if (!upstream.searchParams.has('access_token')) {
      return jsonResponse({ error_code: 110, error_msg: '缺少 access_token' }, 400);
    }
  }

  if (upstream.hostname !== ALLOWED_UPSTREAM || upstream.protocol !== 'https:') {
    return jsonResponse({ error: 'ssrf_blocked', error_description: '上游 URL 不在白名单' }, 400);
  }
  const doRequest = globalThis['fetch'].bind(globalThis);
  const upstreamResp = await doRequest(upstream.toString(), {
    method: ep.method,
    headers,
    body,
  });

  const contentType = upstreamResp.headers.get('Content-Type') || '';
  const respHeaders = { ...CORS_HEADERS };

  if (contentType.includes('application/json')) {
    const json = await upstreamResp.json();
    return jsonResponse(json, upstreamResp.status);
  } else {
    const buf = await upstreamResp.arrayBuffer();
    respHeaders['Content-Type'] = contentType || 'image/png';
    return new Response(buf, { status: upstreamResp.status, headers: respHeaders });
  }
}

// ============================================================
// /api/proxy —— 通用请求代理（API 调试工具专用）
// ============================================================
//
// 安全约束：
// - 仅允许 http/https 协议
// - host 黑名单：localhost、IPv4/IPv6 环回、私有地址、保留地址、链路本地、
//   唯一本地、云元数据（169.254.169.254）、组播、保留段、CGNAT 等一律拒绝
// - 不透传 hop-by-hop 头（Host/Cookie/Connection 等）
// - 不透传上游 Set-Cookie / Content-Encoding（避免会话劫持 + 重复解压）
// - 请求体上限 1 MiB
// - 上游超时 20s
// ============================================================

const PROXY_MAX_BODY = 5 * 1024 * 1024;     // 5 MiB（原始字节上限；base64 编码后约 6.7 MiB）
const PROXY_UPSTREAM_TIMEOUT_MS = 20000;     // 20s

// 这些 Header 名一律不透传到上游（hop-by-hop + 工具域污染）
const HOP_BY_HOP_HEADERS = new Set([
  'host', 'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailers', 'transfer-encoding', 'upgrade', 'cookie',
]);

// 这些上游响应头不写回给浏览器
const RESPONSE_FILTER_HEADERS = new Set([
  'content-encoding', 'transfer-encoding', 'set-cookie', 'connection',
  'keep-alive', 'access-control-allow-origin',
]);

function ipv4ToInt(ip) {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const v = Number(p);
    if (!Number.isInteger(v) || v < 0 || v > 255) return null;
    n = (n * 256) + v;
  }
  return n >>> 0;
}

function ipv4InRange(ip, cidr) {
  const n = ipv4ToInt(ip);
  if (n === null) return false;
  const [base, lenStr] = cidr.split('/');
  const len = Number(lenStr);
  const baseN = ipv4ToInt(base);
  if (baseN === null || !Number.isInteger(len) || len < 0 || len > 32) return false;
  if (len === 0) return true;
  const mask = len === 32 ? 0xffffffff : (~((1 << (32 - len)) - 1)) >>> 0;
  return (n & mask) === (baseN & mask);
}

function ipv6ToBigInt(ip) {
  // 仅处理规范化的 IPv6 字面（不含 zone）
  const parts = ip.split('::');
  if (parts.length > 2) return null;
  const head = parts[0] ? parts[0].split(':') : [];
  const tail = (parts.length === 2 && parts[1]) ? parts[1].split(':') : [];
  if (parts.length === 1) {
    // 没有 ::，head 是全部 8 组
  }
  const total = 8;
  const fill = total - head.length - tail.length;
  if (fill < 0) return null;
  const full = [...head, ...Array(fill).fill('0'), ...tail];
  if (full.length !== 8) return null;
  let big = 0n;
  for (const g of full) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return null;
    big = (big << 16n) + BigInt(parseInt(g, 16));
  }
  return big;
}

function ipv6InRange(ip, cidr) {
  const n = ipv6ToBigInt(ip);
  if (n === null) return false;
  const [base, lenStr] = cidr.split('/');
  const len = Number(lenStr);
  const baseN = ipv6ToBigInt(base);
  if (baseN === null || !Number.isInteger(len) || len < 0 || len > 128) return false;
  if (len === 0) return true;
  const mask = (1n << BigInt(128 - len)) - 1n;
  return (n & ~mask) === (baseN & ~mask);
}

const IPV4_DENY_CIDRS = [
  '0.0.0.0/8',           // 当前网络
  '10.0.0.0/8',          // 私有
  '100.64.0.0/10',       // CGNAT
  '127.0.0.0/8',         // 环回
  '169.254.0.0/16',      // 链路本地 + 云元数据
  '172.16.0.0/12',       // 私有
  '192.0.0.0/24',        // IETF 协议保留
  '192.0.2.0/24',        // TEST-NET-1
  '192.88.99.0/24',      // 6to4 中继
  '192.168.0.0/16',      // 私有
  '198.18.0.0/15',       // 网络基准测试
  '198.51.100.0/24',     // TEST-NET-2
  '203.0.113.0/24',      // TEST-NET-3
  '224.0.0.0/4',         // 组播
  '240.0.0.0/4',         // 保留
  '255.255.255.255/32',  // 广播
];

const IPV6_DENY_CIDRS = [
  '::/128',              // 未指定
  '::1/128',             // 环回
  '::ffff:0:0/96',       // IPv4-mapped（再按 IPv4 黑名单二次校验）
  '64:ff9b::/96',        // IPv4/IPv6 翻译
  '100::/64',            // 黑洞
  '2001::/23',           // IETF 协议分配
  '2001:db8::/32',       // 文档示例
  'fc00::/7',            // 唯一本地
  'fe80::/10',           // 链路本地
  'ff00::/8',            // 组播
];

function isForbiddenHost(hostname) {
  if (!hostname) return true;
  const h = hostname.toLowerCase().replace(/[\[\]]/g, '');
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  if (h === 'ip6-localhost' || h === 'ip6-loopback') return true;
  // IPv4 数字字面
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) {
    for (const cidr of IPV4_DENY_CIDRS) {
      if (ipv4InRange(h, cidr)) return true;
    }
    return false;
  }
  // IPv6 数字字面
  if (h.includes(':')) {
    for (const cidr of IPV6_DENY_CIDRS) {
      if (ipv6InRange(h, cidr)) return true;
    }
    // IPv4-mapped：::ffff:1.2.3.4
    const m = h.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (m) {
      for (const cidr of IPV4_DENY_CIDRS) {
        if (ipv4InRange(m[1], cidr)) return true;
      }
    }
    return false;
  }
  // 普通域名：拒绝常见内网后缀
  if (h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.intranet')
      || h.endsWith('.lan') || h.endsWith('.home')) {
    return true;
  }
  return false;
}

// 「实际请求」回显：把代理真正发往上游的请求要素（URL/方法/头/体）经 base64(UTF-8(JSON))
// 写入响应头 X-Actual-Request，供前端「实际请求」Tab 展示。仅随响应回传，不做任何持久化。
const ACTUAL_REQ_HEADER = 'X-Actual-Request';
const ACTUAL_REQ_MAX_JSON = 6000;      // JSON 字符上限（base64 后约 8KB，避免响应头过大）
const ACTUAL_REQ_VALUE_CAP = 1600;     // 单个请求头值上限
const ACTUAL_REQ_PREVIEW_BYTES = 1536; // 请求体预览字节数

function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

// 组装 body 回显信息：{ size, preview, truncated }（base64 分支传入已解码的字节）
function buildActualBodyInfo(bodyStr, decodedBytes) {
  if (decodedBytes) {
    const previewLen = Math.min(decodedBytes.byteLength, ACTUAL_REQ_PREVIEW_BYTES);
    return {
      size: decodedBytes.byteLength,
      preview: new TextDecoder('utf-8', { fatal: false }).decode(decodedBytes.subarray(0, previewLen)),
      truncated: decodedBytes.byteLength > previewLen,
    };
  }
  if (typeof bodyStr === 'string' && bodyStr) {
    const previewLen = Math.min(bodyStr.length, ACTUAL_REQ_PREVIEW_BYTES);
    return {
      size: new TextEncoder().encode(bodyStr).length,
      preview: bodyStr.slice(0, previewLen),
      truncated: bodyStr.length > previewLen,
    };
  }
  return undefined;
}

// 超限时逐级压缩（截头值 → 截预览 → 只留 URL/方法），保证响应头不超限
function encodeActualRequestHeader(info) {
  const attempts = [
    { valueCap: ACTUAL_REQ_VALUE_CAP, previewCap: ACTUAL_REQ_PREVIEW_BYTES },
    { valueCap: 512, previewCap: 256 },
    { valueCap: 200, previewCap: 0 },
  ];
  let json = '';
  for (const a of attempts) {
    const headers = {};
    for (const [k, v] of Object.entries(info.headers)) {
      headers[k] = v.length > a.valueCap ? v.slice(0, a.valueCap) + '…' : v;
    }
    const body = info.body
      ? {
          size: info.body.size,
          preview: info.body.preview.slice(0, a.previewCap),
          truncated: info.body.truncated || info.body.preview.length > a.previewCap,
        }
      : undefined;
    json = JSON.stringify({
      url: info.url,
      method: info.method,
      headers,
      ...(body ? { body } : {}),
    });
    if (json.length <= ACTUAL_REQ_MAX_JSON) break;
  }
  if (json.length > ACTUAL_REQ_MAX_JSON) {
    json = JSON.stringify({ url: info.url, method: info.method, headers: {}, truncated: true });
  }
  return utf8ToBase64(json);
}

async function handleProxy(request) {
  // 1. 仅允许 POST
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405, PROXY_CORS_HEADERS);
  }

  // 2. 解析 JSON body
  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: 'invalid_json' }, 400, PROXY_CORS_HEADERS);
  }

  const { url: targetUrl, method: upstreamMethod = 'GET', headers: rawHeaders = {}, body: upstreamBody, bodyEncoding = 'text' } = payload || {};

  if (typeof targetUrl !== 'string' || !targetUrl) {
    return jsonResponse({ error: 'missing_url' }, 400, PROXY_CORS_HEADERS);
  }

  // 3. URL 解析 + 协议白名单
  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return jsonResponse({ error: 'invalid_url', error_description: 'URL 格式无效' }, 400, PROXY_CORS_HEADERS);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return jsonResponse({ error: 'unsupported_protocol', error_description: '仅允许 http/https' }, 400, PROXY_CORS_HEADERS);
  }

  // 4. host 黑名单（核心 SSRF 防御）
  if (isForbiddenHost(parsed.hostname)) {
    return jsonResponse({ error: 'forbidden_host', error_description: '目标主机被拒绝（环回/私有/保留地址或 localhost）' }, 400, PROXY_CORS_HEADERS);
  }

  // 5. method 白名单
  const ALLOWED_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);
  const m = String(upstreamMethod).toUpperCase();
  if (!ALLOWED_METHODS.has(m)) {
    return jsonResponse({ error: 'unsupported_method' }, 400, PROXY_CORS_HEADERS);
  }

  // 6. headers：剥离 hop-by-hop；过滤空值
  const outHeaders = {};
  if (rawHeaders && typeof rawHeaders === 'object') {
    for (const [k, v] of Object.entries(rawHeaders)) {
      if (typeof k !== 'string' || !k.trim()) continue;
      if (typeof v !== 'string' && typeof v !== 'number') continue;
      const lk = k.toLowerCase();
      if (HOP_BY_HOP_HEADERS.has(lk)) continue;
      outHeaders[k] = String(v);
    }
  }

  // 7. body 长度限制（GET/HEAD 不带 body）
  //    支持 text（原始字符串）/ base64（multipart、binary 文件等二进制场景）
  let body = undefined;
  let decodedBodyBytes = null;
  let contentLengthHeader = null;
  if (m !== 'GET' && m !== 'HEAD' && upstreamBody !== undefined && upstreamBody !== null && upstreamBody !== '') {
    if (typeof upstreamBody !== 'string') {
      return jsonResponse({ error: 'invalid_body', error_description: '请求体必须是字符串' }, 400, PROXY_CORS_HEADERS);
    }
    if (bodyEncoding === 'base64') {
      // base64 解码为 ArrayBuffer
      try {
        const bin = atob(upstreamBody);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        if (bytes.byteLength > PROXY_MAX_BODY) {
          return jsonResponse({ error: 'body_too_large', error_description: `请求体超过 ${PROXY_MAX_BODY} 字节` }, 413, PROXY_CORS_HEADERS);
        }
        body = bytes.buffer;
        decodedBodyBytes = bytes;
        contentLengthHeader = String(bytes.byteLength);
      } catch {
        return jsonResponse({ error: 'invalid_body_encoding', error_description: 'base64 解码失败' }, 400, PROXY_CORS_HEADERS);
      }
    } else {
      if (upstreamBody.length > PROXY_MAX_BODY) {
        return jsonResponse({ error: 'body_too_large', error_description: `请求体超过 ${PROXY_MAX_BODY} 字节` }, 413, PROXY_CORS_HEADERS);
      }
      body = upstreamBody;
      contentLengthHeader = null; // 让 fetch 自动算
    }
  }
  // base64 模式下显式补 Content-Length，避免 chunked 编码
  if (contentLengthHeader) outHeaders['Content-Length'] = contentLengthHeader;

  // 7.5 「实际请求」回显（在发起 fetch 前组装，超时/不可达的失败响应也一并带回）
  //     重定向场景下成功响应的真实 URL 与初始 URL 可能不同，故 url 延迟到响应时确定
  const actualInfoBase = {
    method: m,
    headers: outHeaders,
    body: buildActualBodyInfo(upstreamBody, decodedBodyBytes),
  };
  const actualHeaderValFor = (finalUrl) =>
    encodeActualRequestHeader({ url: finalUrl, ...actualInfoBase });

  // 8. 上游 fetch + 20s 超时
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROXY_UPSTREAM_TIMEOUT_MS);

  let upstreamResp;
  try {
    const doRequest = globalThis['fetch'].bind(globalThis);
    upstreamResp = await doRequest(parsed.toString(), {
      method: m,
      headers: outHeaders,
      body,
      redirect: 'follow',
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    const isAbort = (e && (e.name === 'AbortError' || /abort/i.test(e.message || '')));
    const errResp = jsonResponse({
      error: isAbort ? 'upstream_timeout' : 'upstream_unreachable',
      error_description: isAbort ? `上游超时（${PROXY_UPSTREAM_TIMEOUT_MS / 1000}s）` : (e.message || '上游不可达'),
    }, isAbort ? 504 : 502, PROXY_CORS_HEADERS);
    errResp.headers.set(ACTUAL_REQ_HEADER, actualHeaderValFor(parsed.toString()));
    return errResp;
  }
  clearTimeout(timer);

  // 9. 透传响应（过滤敏感/重复头）
  const buf = await upstreamResp.arrayBuffer();
  const respHeaders = { ...PROXY_CORS_HEADERS };
  upstreamResp.headers.forEach((v, k) => {
    const lk = k.toLowerCase();
    if (RESPONSE_FILTER_HEADERS.has(lk)) return;
    respHeaders[k] = v;
  });
  respHeaders[ACTUAL_REQ_HEADER] = actualHeaderValFor(upstreamResp.url || parsed.toString());
  return new Response(buf, { status: upstreamResp.status, headers: respHeaders });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS 预检（私密分享需放行 X-Manage-Token，故优先交由其自身处理）
    if (request.method === 'OPTIONS') {
      const preflight = await handleSecretRoutes(request, env, url.pathname);
      if (preflight) return preflight;
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // 通用代理
    if (url.pathname === '/api/proxy' || url.pathname === '/api/proxy/') {
      return handleProxy(request);
    }

    // API 路由
    if (url.pathname.startsWith('/api/baidu/')) {
      const sub = url.pathname.slice('/api/baidu'.length);
      return handleBaidu(request, sub);
    }

    // 私密分享 API（端到端加密，仅存密文）
    const secretResp = await handleSecretRoutes(request, env, url.pathname);
    if (secretResp) return secretResp;

    // 私密内容查看页：/s/<id> → 复用静态查看页
    // 解密密钥只存在于 URL fragment（# 之后），浏览器不会将其发往服务端
    const secretPage = url.pathname.match(/^\/s\/([A-Za-z0-9_-]{16,32})\/?$/);
    if (secretPage) {
      const pageUrl = new URL('/tools/secret/s.html', url);
      // 只透传 Range，避免把客户端请求头原样带入子请求
      const fwdHeaders = new Headers();
      const range = request.headers.get('range');
      if (range) fwdHeaders.set('range', range);
      return env.ASSETS.fetch(new Request(pageUrl, { method: request.method, headers: fwdHeaders }));
    }

    // 静态资源（其余所有路径）
    return env.ASSETS.fetch(request);
  },
};
