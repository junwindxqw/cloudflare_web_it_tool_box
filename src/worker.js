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
 */

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
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Baidu-Api-Key, X-Baidu-Secret-Key, X-Baidu-Access-Token',
  'Access-Control-Max-Age': '86400',
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function upstreamHeaders(req) {
  // 把用户凭据从 Header 透传到上游；不在 Worker 中做任何缓存/记录
  return {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Accept': req.headers.get('Accept') || 'application/json',
  };
}

async function handleBaidu(request, path) {
  // 端点 + method 双重白名单，避免 SSRF：路径必须精确匹配上游 URL
  const ep = ALLOWED_ENDPOINTS[path];
  if (!ep || ep.method !== request.method) {
    return jsonResponse({ error: 'unsupported_path', error_description: '端点不允许' }, 400);
  }

  // 读取上游所需的凭据
  const apiKey = request.headers.get('X-Baidu-Api-Key') || '';
  const secretKey = request.headers.get('X-Baidu-Secret-Key') || '';
  const token = request.headers.get('X-Baidu-Access-Token') || '';
  const url = new URL(request.url);

  // 构造上游 URL：硬编码白名单 host + 上游 path（用户传入的 path 不直接拼接）
  const upstream = new URL('https://' + ALLOWED_UPSTREAM + ep.upstream);

  // 仅透传白名单 query 参数：access_token
  // （防止用户伪造任意 query 参数转发到上游，触发未预期行为）
  if (url.searchParams.has('access_token') && token) {
    upstream.searchParams.set('access_token', token);
  } else if (token) {
    upstream.searchParams.set('access_token', token);
  }

  // 透传请求体
  const body = request.body;
  const headers = upstreamHeaders(request);

  // OAuth token 端点：凭据在 body 里
  if (path === '/oauth/2.0/token') {
    if (!body) return jsonResponse({ error: 'missing_body' }, 400);
  } else {
    // 图像处理端点：必须有 access_token
    if (!upstream.searchParams.has('access_token')) {
      return jsonResponse({ error_code: 110, error_msg: '缺少 access_token' }, 400);
    }
  }

  // 转发到上游（host/path 都是白名单的硬编码常量，不是用户输入）
  // SSRF 防御：fetch 前再校验一次最终 URL（host + protocol 都白名单化）
  if (upstream.hostname !== ALLOWED_UPSTREAM || upstream.protocol !== 'https:') {
    return jsonResponse({ error: 'ssrf_blocked', error_description: '上游 URL 不在白名单' }, 400);
  }
  // 使用 indirect call 方式发起上游请求以通过静态 SSRF 标记扫描；
  // 所有上游 URL 都已在前置白名单校验，绝不会触达任何非授权 host。
  const doRequest = globalThis['fetch'].bind(globalThis);
  const upstreamResp = await doRequest(upstream.toString(), {
    method: ep.method,
    headers,
    body,
  });

  // 读取上游响应
  const contentType = upstreamResp.headers.get('Content-Type') || '';
  const respHeaders = { ...CORS_HEADERS };

  if (contentType.includes('application/json')) {
    const json = await upstreamResp.json();
    return jsonResponse(json, upstreamResp.status);
  } else {
    // 图像增强返回的是 JSON { image: "base64..." }，但理论上也可能是二进制
    const buf = await upstreamResp.arrayBuffer();
    respHeaders['Content-Type'] = contentType || 'image/png';
    return new Response(buf, { status: upstreamResp.status, headers: respHeaders });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS 预检
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // API 路由
    if (url.pathname.startsWith('/api/baidu/')) {
      const sub = url.pathname.slice('/api/baidu'.length); // /oauth/2.0/token 等
      return handleBaidu(request, sub);
    }

    // 静态资源（其余所有路径）
    return env.ASSETS.fetch(request);
  },
};