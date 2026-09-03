/**
 * 私密分享 —— 浏览器端加密核心（无第三方依赖，基于 WebCrypto）
 *
 * 算法：AES-256-GCM
 * 密钥派生：PBKDF2-HMAC-SHA256，salt 16 字节随机，迭代 150000 次
 *
 * 关键性质：明文与密钥串都不离开浏览器。
 * 服务端只经手 salt / iv / ciphertext 三个二进制串。
 */

(function (global) {
  'use strict';

  const PBKDF2_ITERATIONS = 150000;
  const SALT_BYTES = 16;
  const IV_BYTES = 12;

  /* ---------- base64url 编解码 ---------- */

  function bytesToB64url(bytes) {
    let bin = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function b64urlToBytes(str) {
    const norm = String(str).trim().replace(/-/g, '+').replace(/_/g, '/').replace(/\s+/g, '');
    const pad = norm + '='.repeat((4 - (norm.length % 4)) % 4);
    const bin = atob(pad);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  /* ---------- 密钥串 ---------- */

  /** 随机生成 32 字节密钥串 → base64url（约 43 字符，256 bit 熵） */
  function generateKeyString() {
    return bytesToB64url(crypto.getRandomValues(new Uint8Array(32)));
  }

  /** 由密钥串 + salt 派生 AES-GCM 密钥 */
  async function deriveKey(keyString, saltBytes) {
    const baseKey = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(keyString),
      'PBKDF2',
      false,
      ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: saltBytes, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  /* ---------- 加解密 ---------- */

  /**
   * 加密明文
   * @param {string} plainText
   * @param {string} keyString 密钥串（自动生成或用户自定义口令）
   * @returns {Promise<{salt:string, iv:string, ct:string}>} 全部为 base64url
   */
  async function encryptString(plainText, keyString) {
    const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
    const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
    const key = await deriveKey(keyString, salt);
    const cipherBuf = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, tagLength: 128 },
      key,
      new TextEncoder().encode(plainText)
    );
    return {
      salt: bytesToB64url(salt),
      iv: bytesToB64url(iv),
      ct: bytesToB64url(new Uint8Array(cipherBuf)),
    };
  }

  /**
   * 解密密文。密钥错误 / 数据被篡改时抛出 Error（GCM 认证失败）
   * @param {{salt:string, iv:string, ct:string}} payload
   * @param {string} keyString
   * @returns {Promise<string>}
   */
  async function decryptToString(payload, keyString) {
    const salt = b64urlToBytes(payload.salt);
    const iv = b64urlToBytes(payload.iv);
    const data = b64urlToBytes(payload.ct);
    const key = await deriveKey(keyString, salt);
    const plainBuf = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, tagLength: 128 },
      key,
      data
    );
    return new TextDecoder('utf-8').decode(plainBuf);
  }

  /* ---------- 格式化 ---------- */

  /** 剩余有效期的人类可读描述 */
  function formatRemaining(ms) {
    if (ms <= 0) return '已过期';
    const s = Math.floor(ms / 1000);
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (d > 0) return `${d} 天 ${h} 小时`;
    if (h > 0) return `${h} 小时 ${m} 分钟`;
    if (m > 0) return `${m} 分钟`;
    return `${s} 秒`;
  }

  function formatDateTime(ts) {
    const d = new Date(ts);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  global.SecretCrypto = {
    PBKDF2_ITERATIONS,
    bytesToB64url,
    b64urlToBytes,
    generateKeyString,
    deriveKey,
    encryptString,
    decryptToString,
    formatRemaining,
    formatDateTime,
  };
})(window);
