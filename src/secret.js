/**
 * 私密内容分享 API —— 端到端加密（E2EE）
 *
 * 安全模型：
 * - 明文永远不上行。浏览器本地用 AES-256-GCM 加密，密钥由「密钥串」经
 *   PBKDF2-SHA256(salt, 150k) 派生，密钥串只存在于 URL 的 fragment（# 之后）。
 * - 浏览器请求时不会携带 fragment，因此服务端/网络链路在技术上拿不到密钥。
 * - 服务端（KV）只持久化：密文 ct、派生盐 salt、初始向量 iv、过期时间。
 * - 过期由 KV 的 expirationTtl 兜底 + value 内 expiresAt 二次校验（双保险）。
 * - 不记录 IP / UA / 任何访问日志，无痕。
 *
 * 端点：
 *   POST   /api/secret            创建（返回 id 与管理令牌）
 *   GET    /api/secret/:id        读取（不销毁；阅后即焚由客户端解密成功后确认）
 *   POST   /api/secret/:id/burn   确认销毁（仅针对「阅后即焚」内容，幂等）
 *   DELETE /api/secret/:id        撤销（需 X-Manage-Token）
 */

/* ---------- 常量 ---------- */

const KV_PREFIX = 'sec:';
const ID_BYTES = 16;            // → base64url 22 字符
const TOKEN_BYTES = 24;         // 管理令牌
const MIN_TTL = 60;             // KV 最小过期精度
const MAX_TTL = 30 * 24 * 3600; // 最长 30 天
const MAX_CT_CHARS = 200 * 1024; // base64 密文字符上限（明文约 150 KB）
const MAX_SALT_CHARS = 128;
const MAX_IV_CHARS = 64;

/** 安全响应头：禁止任何形式的缓存与引用泄漏 */
const SECURITY_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  'Pragma': 'no-cache',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
};

const SECRET_CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Manage-Token',
  'Access-Control-Max-Age': '86400',
};

/* ---------- 工具函数 ---------- */

function b64urlEncode(bytes) {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomId(nBytes) {
  return b64urlEncode(crypto.getRandomValues(new Uint8Array(nBytes)));
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...SECRET_CORS,
      ...SECURITY_HEADERS,
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

/** 宽松的 base64 / base64url 字符校验（服务端不解码，只做传输层合法性把关） */
function isTransportSafeB64(s, maxLen) {
  return typeof s === 'string'
    && s.length > 0
    && s.length <= maxLen
    && /^[A-Za-z0-9+/=_-]+$/.test(s);
}

function normalizeTtl(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  const ttl = Math.floor(n);
  if (ttl < MIN_TTL || ttl > MAX_TTL) return null;
  return ttl;
}

/* ---------- 创建 ---------- */

async function handleSecretCreate(request, env) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: 'invalid_json', message: '请求体不是合法 JSON' }, 400);
  }

  const { v, salt, iv, ct, ttl: rawTtl, burn } = payload || {};

  if (v !== 1) {
    return jsonResponse({ error: 'unsupported_version', message: '不支持的加密协议版本' }, 400);
  }
  if (!isTransportSafeB64(salt, MAX_SALT_CHARS)) {
    return jsonResponse({ error: 'invalid_salt', message: 'salt 非法' }, 400);
  }
  if (!isTransportSafeB64(iv, MAX_IV_CHARS)) {
    return jsonResponse({ error: 'invalid_iv', message: 'iv 非法' }, 400);
  }
  if (!isTransportSafeB64(ct, MAX_CT_CHARS)) {
    return jsonResponse({
      error: 'invalid_ciphertext',
      message: `密文非法或过大（上限 ${Math.floor(MAX_CT_CHARS / 1024)} KB）`,
    }, 400);
  }

  const ttl = normalizeTtl(rawTtl);
  if (ttl === null) {
    return jsonResponse({
      error: 'invalid_ttl',
      message: `有效期需在 ${MIN_TTL} 秒 ~ 30 天之间`,
    }, 400);
  }

  const now = Date.now();
  const id = randomId(ID_BYTES);
  const manageToken = randomId(TOKEN_BYTES);
  const expiresAt = now + ttl * 1000;

  const record = {
    v: 1,
    salt,
    iv,
    ct,
    burn: burn === true,
    createdAt: now,
    expiresAt,
    manageToken,
  };

  await env.SECRETS.put(KV_PREFIX + id, JSON.stringify(record), {
    // KV 要求 >= 60s；不足 60s 的靠 expiresAt 二次校验兜底
    expirationTtl: Math.max(ttl, MIN_TTL),
  });

  return jsonResponse({
    ok: true,
    id,
    manageToken,
    expiresAt,
    burn: record.burn,
  });
}

/* ---------- 读取 ---------- */

async function handleSecretGet(env, id) {
  if (!/^[A-Za-z0-9_-]{16,32}$/.test(id)) {
    return jsonResponse({ error: 'not_found', message: '内容不存在或已过期' }, 404);
  }

  const key = KV_PREFIX + id;
  const record = await env.SECRETS.get(key, { type: 'json' });
  if (!record) {
    return jsonResponse({ error: 'not_found', message: '内容不存在或已过期' }, 404);
  }

  // 双保险：KV 过期有延迟，这里按 expiresAt 再判一次
  if (typeof record.expiresAt !== 'number' || record.expiresAt <= Date.now()) {
    await env.SECRETS.delete(key);
    return jsonResponse({ error: 'expired', message: '内容已过期' }, 410);
  }

  // 注意：这里刻意不销毁「阅后即焚」内容。
  // 若读取即删，密钥填错 / 预览机器人抓取都会白白烧掉内容。
  // 改为由客户端在「解密成功」后调用 POST /:id/burn 确认销毁。
  return jsonResponse({
    ok: true,
    v: record.v,
    salt: record.salt,
    iv: record.iv,
    ct: record.ct,
    burn: record.burn === true,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
  });
}

/* ---------- 阅后即焚确认（解密成功后调用） ---------- */

async function handleSecretBurn(env, id) {
  if (!/^[A-Za-z0-9_-]{16,32}$/.test(id)) {
    return jsonResponse({ error: 'not_found', message: '内容不存在或已过期' }, 404);
  }

  const key = KV_PREFIX + id;
  const record = await env.SECRETS.get(key, { type: 'json' });
  if (!record) {
    return jsonResponse({ ok: true, alreadyGone: true });
  }
  // 只允许销毁「阅后即焚」内容，普通内容的销毁必须走管理令牌
  if (record.burn !== true) {
    return jsonResponse({ error: 'not_burnable', message: '该内容未开启阅后即焚' }, 400);
  }

  await env.SECRETS.delete(key);
  return jsonResponse({ ok: true });
}

/* ---------- 撤销 ---------- */

async function handleSecretDelete(request, env, id) {
  if (!/^[A-Za-z0-9_-]{16,32}$/.test(id)) {
    return jsonResponse({ error: 'not_found', message: '内容不存在或已过期' }, 404);
  }

  const token = request.headers.get('X-Manage-Token') || '';
  if (!token) {
    return jsonResponse({ error: 'forbidden', message: '缺少管理令牌' }, 403);
  }

  const key = KV_PREFIX + id;
  const record = await env.SECRETS.get(key, { type: 'json' });
  if (!record) {
    return jsonResponse({ error: 'not_found', message: '内容不存在或已过期' }, 404);
  }
  if (record.manageToken !== token) {
    return jsonResponse({ error: 'forbidden', message: '管理令牌不正确' }, 403);
  }

  await env.SECRETS.delete(key);
  return jsonResponse({ ok: true });
}

/* ---------- 路由入口 ---------- */

/**
 * 处理 /api/secret 与 /api/secret/:id
 * @returns {Promise<Response|null>} null 表示不是该路由
 */
export async function handleSecretRoutes(request, env, pathname) {
  if (pathname === '/api/secret' || pathname === '/api/secret/') {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { ...SECRET_CORS, ...SECURITY_HEADERS } });
    }
    if (request.method !== 'POST') {
      return jsonResponse({ error: 'method_not_allowed' }, 405);
    }
    if (!env.SECRETS) {
      return jsonResponse({ error: 'storage_unavailable', message: '服务端存储未配置' }, 503);
    }
    return handleSecretCreate(request, env);
  }

  const burnMatch = pathname.match(/^\/api\/secret\/([A-Za-z0-9_-]{16,32})\/burn\/?$/);
  if (burnMatch) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { ...SECRET_CORS, ...SECURITY_HEADERS } });
    }
    if (!env.SECRETS) {
      return jsonResponse({ error: 'storage_unavailable', message: '服务端存储未配置' }, 503);
    }
    if (request.method !== 'POST') {
      return jsonResponse({ error: 'method_not_allowed' }, 405);
    }
    return handleSecretBurn(env, burnMatch[1]);
  }

  const m = pathname.match(/^\/api\/secret\/([A-Za-z0-9_-]{16,32})\/?$/);
  if (m) {
    const id = m[1];
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { ...SECRET_CORS, ...SECURITY_HEADERS } });
    }
    if (!env.SECRETS) {
      return jsonResponse({ error: 'storage_unavailable', message: '服务端存储未配置' }, 503);
    }
    if (request.method === 'GET') return handleSecretGet(env, id);
    if (request.method === 'DELETE') return handleSecretDelete(request, env, id);
    return jsonResponse({ error: 'method_not_allowed' }, 405);
  }

  return null;
}

export { SECURITY_HEADERS };
