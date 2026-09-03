/**
 * Cloudflare Web IT Tool Box — 内网文件分享本地后端
 *
 * 仅监听 127.0.0.1（默认 8789 端口），由 wrangler dev 的 /api/lan/* 反代调用。
 * 不暴露公网：纯内网文件分享，数据完全在本机磁盘。
 *
 * 数据类别：单文件 / 多文件包 / 文本片段。
 * 存储路径：./data/share_<id>/{meta.json, files/<idx>}
 *           文件名只存 meta.json，绝不参与落盘路径（消除路径穿越面）。
 *
 * 零三方依赖（node 内置：http/crypto/path/fs/os/url）。
 * multipart 解析：手写（流式，避免 200MB 进内存）。
 * ZIP 打包：手写流式 ZIP（跨平台一致，逐文件读盘）。
 */

'use strict';

const http = require('node:http');
const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');

const HOST = process.env.LAN_SHARE_HOST || '127.0.0.1';
const PORT = Number(process.env.LAN_SHARE_PORT || 8789);
const DATA_DIR = path.resolve(__dirname, 'data');
const FRONTEND_PORT = Number(process.env.FRONTEND_PORT || 8793);

const MAX_FILE_BYTES = 200 * 1024 * 1024;       // 200 MB / 文件
const MAX_TOTAL_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB / 总

// ========================================================================
// 路径安全：外部字符串一律不参与落盘路径；路径拼接后用 path.relative
// 校验必须严格位于基准目录之内（比 startsWith 语义更严）
// ========================================================================

const ID_PATTERN = /^[A-Za-z0-9_-]{4,32}$/;

function assertSafeId(id, label = 'id') {
  if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
    throw new Error(`invalid_${label}`);
  }
  return id;
}

function assertSafeFileName(name) {
  if (typeof name !== 'string') throw new Error('invalid_filename');
  // 文件名只用于展示与下载头（Content-Disposition / zip 条目名），
  // 不参与落盘路径；仅拒绝路径分隔符、控制字符与 ".."
  if (name.includes('/') || name.includes('\\') || name.includes('..')) {
    throw new Error('invalid_filename');
  }
  if (/[\x00-\x1f\x7f]/.test(name)) throw new Error('invalid_filename');
  if (name.trim() === '' || name.length > 200) throw new Error('invalid_filename');
  return name;
}

// 校验 p 必须严格位于 base 之内（不允许等于 base、跳出上级或绝对路径）
function assertInsideBase(base, p) {
  const rel = path.relative(base, p);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('path_escape');
  }
  return p;
}

// 严格白名单下构造 share 目录路径（id 白名单不含分隔符与点号，二次校验兜底）
function shareDirFor(id) {
  assertSafeId(id, 'share_id');
  return assertInsideBase(DATA_DIR, path.resolve(DATA_DIR, 'share_' + id));
}

// share 内第 idx 个文件的落盘路径：纯索引命名，任何外部字符串都不参与
function indexedFilePath(shareDir, idx) {
  if (!Number.isInteger(idx) || idx < 0 || idx > 9999) throw new Error('invalid_index');
  const filesDir = path.resolve(shareDir, 'files');
  return assertInsideBase(filesDir, path.resolve(filesDir, String(idx)));
}

function safeFileName(name, fallback = 'file') {
  try { return assertSafeFileName(name); }
  catch { return fallback; }
}

// zip 输出临时路径
function tmpZipPath(id) {
  assertSafeId(id, 'share_id');
  return assertInsideBase(DATA_DIR, path.resolve(DATA_DIR, `_zip_${id}.zip`));
}

// tmp 文件（multipart 写盘过程中的中间文件），id 为服务端随机数，不掺任何外部输入
function tmpUploadPath(id) {
  assertSafeId(id, 'tmp_id');
  return assertInsideBase(DATA_DIR, path.resolve(DATA_DIR, `_tmp_${id}`));
}

// ========================================================================
// 通用工具
// ========================================================================

function newId(bytes = 8) {
  return crypto.randomBytes(bytes).toString('base64url');
}

// 扫描磁盘用量
async function calcTotalBytes(root) {
  let total = 0;
  async function walk(dir) {
    // 防御式收口：只统计 root 之下的内容
    const rel = path.relative(root, dir);
    if (rel !== '' && (rel.startsWith('..') || path.isAbsolute(rel))) return;
    let entries;
    try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) await walk(p);
      else if (e.isFile()) {
        try { total += (await fsp.stat(p)).size; } catch { /* ignore */ }
      }
    }
  }
  await walk(root);
  return total;
}

// 局域网 IP：扫非 internal 的 IPv4
function detectLanIP() {
  const ifaces = os.networkInterfaces();
  for (const list of Object.values(ifaces)) {
    if (!list) continue;
    for (const i of list) {
      if (i.family === 'IPv4' && !i.internal) return i.address;
    }
  }
  return '127.0.0.1';
}

// 确保目录存在
try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch { /* ignore */ }

// ========================================================================
// multipart/form-data 解析器（手写，流式）
// ========================================================================

class MultipartParser {
  constructor(boundary) {
    this.boundary = Buffer.from('--' + boundary);
    this.buf = Buffer.alloc(0);
    this.parts = [];
    this.currentPart = null;
    this.totalBytesIn = 0;
    this.fileSeen = 0;
  }

  startPart(headerLines) {
    const part = {
      name: '',
      filename: undefined,
      contentType: 'text/plain',
      value: '',
      isFile: false,
      tmpPath: undefined,
      size: 0,
    };
    const cdis = headerLines.find(h => h.toLowerCase().startsWith('content-disposition:'));
    if (cdis) {
      const nameM = cdis.match(/name="([^"]*)"/i);
      if (nameM) part.name = nameM[1];
      const fnM = cdis.match(/filename="([^"]*)"/i);
      if (fnM && fnM[1] !== '') {
        part.filename = fnM[1];
        part.isFile = true;
      }
    }
    const ct = headerLines.find(h => h.toLowerCase().startsWith('content-type:'));
    if (ct) part.contentType = ct.split(':').slice(1).join(':').trim();
    this.currentPart = part;
  }

  async feed(chunk) {
    this.buf = Buffer.concat([this.buf, chunk]);
    while (true) {
      const boundaryIdx = this.buf.indexOf(this.boundary);
      if (boundaryIdx === -1) {
        if (this.buf.length > this.boundary.length + 2) {
          const keep = this.buf.length - this.boundary.length - 2;
          const flush = this.buf.subarray(0, keep);
          await this.onData(flush);
          this.totalBytesIn += flush.length;
          this.buf = this.buf.subarray(keep);
        }
        return;
      }
      if (this.currentPart) {
        let dataEnd = boundaryIdx;
        if (dataEnd >= 2 && this.buf[dataEnd - 2] === 0x0d && this.buf[dataEnd - 1] === 0x0a) {
          dataEnd -= 2;
        }
        if (dataEnd > 0) {
          const data = this.buf.subarray(0, dataEnd);
          await this.onData(data);
          this.totalBytesIn += data.length;
        }
        await this.onPartEnd();
      }
      let after = boundaryIdx + this.boundary.length;
      if (after + 1 < this.buf.length && this.buf[after] === 0x2d && this.buf[after + 1] === 0x2d) {
        this.buf = this.buf.subarray(after + 2);
        this.finished = true;
        return;
      }
      if (after + 1 < this.buf.length && this.buf[after] === 0x0d && this.buf[after + 1] === 0x0a) {
        after += 2;
      }
      const headerStart = after;
      const sepIdx = this.buf.indexOf('\r\n\r\n', headerStart);
      if (sepIdx === -1) {
        this.buf = this.buf.subarray(headerStart);
        return;
      }
      const headerText = this.buf.subarray(headerStart, sepIdx).toString('utf8');
      const headerLines = headerText.split(/\r?\n/).filter(Boolean);
      this.startPart(headerLines);
      this.buf = this.buf.subarray(sepIdx + 4);
    }
  }

  async onData(chunk) {
    const part = this.currentPart;
    if (!part) return;
    if (part.isFile) {
      if (!part.tmpPath) {
        part.tmpPath = tmpUploadPath(newId(8));
        await fsp.writeFile(part.tmpPath, chunk);
      } else {
        await fsp.appendFile(part.tmpPath, chunk);
      }
      part.size += chunk.length;
      this.fileSeen = Math.max(this.fileSeen, part.size);
      if (part.size > MAX_FILE_BYTES) {
        throw new Error(`文件过大：单文件上限 ${MAX_FILE_BYTES} 字节`);
      }
    } else {
      part.value += chunk.toString('utf8');
    }
  }

  async onPartEnd() {
    const part = this.currentPart;
    if (part && !part.isFile) {
      part.value = part.value.replace(/\r?\n$/, '');
    }
    if (part) this.parts.push(part);
    this.currentPart = null;
  }

  async end() {
    // 仅收尾未闭合的 part；tmp 文件的清理由调用方的失败分支负责，
    // 成功路径要靠 rename 把 tmp 落位，绝不能在这里提前删
    if (this.currentPart) await this.onPartEnd();
  }
}

// ========================================================================
// ZIP 打包（跨平台：逐个文件读盘打包，内存峰值 ≈ 最大单文件）
// ========================================================================

function crc32(buf) {
  if (typeof require('node:zlib').crc32 === 'function') return require('node:zlib').crc32(buf);
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let k = 0; k < 8; k++) {
      crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// items: [{ name, filePath }] —— name 只写入 zip 目录记录（来自 meta，不碰磁盘路径）
// 按 PKWARE APPNOTE 精确布局：local 30 字节定长 + central 46 字节定长 + EOCD 22 字节；
// flags 置 bit 11（0x0800）声明文件名为 UTF-8
async function packZipFromDisk(zipPath, items) {
  const u16 = (v) => { const b = Buffer.alloc(2); b.writeUInt16LE(v); return b; };
  const u32 = (v) => { const b = Buffer.alloc(4); b.writeUInt32LE(v); return b; };
  const out = fs.createWriteStream(zipPath);
  const central = [];
  let offset = 0;
  for (const e of items) {
    const data = await fsp.readFile(e.filePath);
    const nameBuf = Buffer.from(e.name, 'utf8');
    const crc = crc32(data);
    const local = Buffer.concat([
      u32(0x04034b50),        // local file header 签名
      u16(20),                // version needed
      u16(0x0800),            // flags: UTF-8 文件名
      u16(0),                 // method: store（不压缩）
      u16(0), u16(0x21),      // time / date（1980-01-01 占位）
      u32(crc),
      u32(data.length),       // compressed size
      u32(data.length),       // uncompressed size
      u16(nameBuf.length),
      u16(0),                 // extra len
      nameBuf,
      data,
    ]);
    out.write(local);
    central.push({ nameBuf, crc, size: data.length, offset });
    offset += local.length;
  }
  const cdStart = offset;
  let cdSize = 0;
  for (const c of central) {
    const cd = Buffer.concat([
      u32(0x02014b50),        // central directory 签名
      u16(20), u16(20),       // version made by / version needed
      u16(0x0800), u16(0),    // flags / method
      u16(0), u16(0x21),      // time / date
      u32(c.crc),
      u32(c.size), u32(c.size),
      u16(c.nameBuf.length), u16(0), u16(0), // name / extra / comment len
      u16(0), u16(0),         // disk start / internal attrs
      u32(0),                 // external attrs
      u32(c.offset),          // local header offset
      c.nameBuf,
    ]);
    out.write(cd);
    cdSize += cd.length;
  }
  const eocd = Buffer.concat([
    u32(0x06054b50),          // EOCD 签名
    u16(0), u16(0),           // disk number / CD 起始 disk
    u16(central.length), u16(central.length),
    u32(cdSize), u32(cdStart),
    u16(0),                   // comment len
  ]);
  out.write(eocd);
  await new Promise((res, rej) => { out.end((err) => err ? rej(err) : res()); });
}

// ========================================================================
// HTTP 服务
// ========================================================================

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Session',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...JSON_HEADERS, ...headers });
  if (typeof body === 'string' || Buffer.isBuffer(body)) res.end(body);
  else res.end(JSON.stringify(body));
}

async function handleInfo(req, res) {
  const usedBytes = await calcTotalBytes(DATA_DIR);
  send(res, 200, {
    ip: detectLanIP(),
    port: FRONTEND_PORT,
    usedBytes,
    limitBytes: MAX_TOTAL_BYTES,
    maxFileBytes: MAX_FILE_BYTES,
    platform: process.platform,
  });
}

async function handleUpload(req, res) {
  const ct = req.headers['content-type'] || '';
  const m = ct.match(/^multipart\/form-data;\s*boundary=(.+)$/i);
  if (!m) return send(res, 400, { error: 'bad_content_type' });
  const boundary = m[1].replace(/^"|"$/g, '');
  const contentLength = Number(req.headers['content-length'] || 0);
  if (contentLength && contentLength > MAX_TOTAL_BYTES * 1.2) {
    return send(res, 413, { error: 'body_too_large', maxBytes: MAX_TOTAL_BYTES });
  }

  const session = (req.headers['x-session'] || '').toString().slice(0, 128) || 'anon';
  const id = newId(8);
  let shareDir, filesDir;
  try {
    shareDir = shareDirFor(id);
    filesDir = path.resolve(shareDir, 'files');
    await fsp.mkdir(filesDir, { recursive: true });
  } catch (e) {
    return send(res, 400, { error: 'internal_path_error', error_description: e.message });
  }

  const parser = new MultipartParser(boundary);
  try {
    // 用 for-await 顺序消费请求：async 'data' 回调会让 'end' 抢在 feed 之前执行（竞态）
    for await (const chunk of req) {
      const usedBefore = await calcTotalBytes(DATA_DIR);
      if (usedBefore + parser.totalBytesIn + chunk.length > MAX_TOTAL_BYTES) {
        throw new Error('storage_full');
      }
      await parser.feed(chunk);
    }
    await parser.end();
  } catch (e) {
    req.destroy();
    // 清理本次请求已落盘的 tmp 文件
    for (const part of parser.parts) {
      if (part.isFile && part.tmpPath) {
        try { await fsp.rm(part.tmpPath, { force: true }); } catch { /* ignore */ }
      }
    }
    await fsp.rm(shareDir, { recursive: true, force: true });
    if (e.message === 'storage_full') return send(res, 507, { error: 'storage_full' });
    if (e.message.startsWith('文件过大')) return send(res, 413, { error: 'file_too_large', error_description: e.message });
    return send(res, 400, { error: 'multipart_parse_error', error_description: e.message });
  }

  const parts = parser.parts;
  const kindField = parts.find(p => p.name === 'kind');
  const textField = parts.find(p => p.name === 'text');
  const labelField = parts.find(p => p.name === 'label');
  const fileParts = parts.filter(p => p.isFile && p.filename);

  let type, items = [];
  const itemsToFinalize = []; // { tmpPath, finalPath }

  try {
    if (kindField && kindField.value === 'text' && textField) {
      type = 'text';
      const ext = (labelField && /\.[a-z0-9]{1,8}$/i.test(labelField.value))
        ? labelField.value.match(/\.[a-z0-9]{1,8}$/i)[1].toLowerCase() : 'txt';
      const fname = `snippet.${safeFileName(ext, 'txt')}`;
      const finalPath = indexedFilePath(shareDir, 0);
      await fsp.writeFile(finalPath, textField.value, 'utf8');
      items.push({ name: fname, size: Buffer.byteLength(textField.value, 'utf8'), mime: 'text/plain; charset=utf-8' });
    } else if (fileParts.length === 1) {
      type = 'file';
      const p = fileParts[0];
      const finalName = safeFileName(p.filename, 'file');
      const finalPath = indexedFilePath(shareDir, 0);
      itemsToFinalize.push({ tmpPath: p.tmpPath, finalPath, size: p.size });
      items.push({ name: finalName, size: p.size, mime: p.contentType || 'application/octet-stream' });
    } else if (fileParts.length > 1) {
      type = 'bundle';
      for (let i = 0; i < fileParts.length; i++) {
        const p = fileParts[i];
        const finalName = safeFileName(p.filename, `file_${i + 1}`);
        const finalPath = indexedFilePath(shareDir, i);
        itemsToFinalize.push({ tmpPath: p.tmpPath, finalPath, size: p.size });
        items.push({ name: finalName, size: p.size, mime: p.contentType || 'application/octet-stream' });
      }
    } else {
      await fsp.rm(shareDir, { recursive: true, force: true });
      return send(res, 400, { error: 'no_files_or_text' });
    }

    // 落盘
    for (const it of itemsToFinalize) {
      await fsp.rename(it.tmpPath, it.finalPath);
      // rename 后，标记 part.consumed 让 parser 不会清理
    }
    for (const p of fileParts) p.consumed = true;

    const totalSize = items.reduce((s, i) => s + i.size, 0);
    const usedAfter = await calcTotalBytes(DATA_DIR);
    if (usedAfter > MAX_TOTAL_BYTES) {
      await fsp.rm(shareDir, { recursive: true, force: true });
      return send(res, 507, { error: 'storage_full' });
    }

    const meta = {
      id, type, session,
      label: (type === 'text' && labelField) ? labelField.value.slice(0, 80) : '',
      items,
      totalSize,
      createdAt: Date.now(),
    };
    await fsp.writeFile(path.resolve(shareDir, 'meta.json'), JSON.stringify(meta), 'utf8');

    send(res, 200, {
      id,
      type,
      label: meta.label,
      items: items.map(i => ({ name: i.name, size: i.size })),
      totalSize,
      downloadUrl: type === 'bundle'
        ? `/api/lan/share/${id}/zip`
        : `/api/lan/share/${id}/file/0`,
    });
  } catch (e) {
    await fsp.rm(shareDir, { recursive: true, force: true });
    for (const p of fileParts) {
      if (p.tmpPath) { try { await fsp.rm(p.tmpPath, { force: true }); } catch { /* ignore */ } }
    }
    send(res, 400, { error: 'save_failed', error_description: e.message });
  }
}

async function handleShareMeta(req, res, id) {
  let shareDir;
  try { shareDir = shareDirFor(id); }
  catch { return send(res, 400, { error: 'bad_id' }); }
  let meta;
  try { meta = JSON.parse(await fsp.readFile(path.resolve(shareDir, 'meta.json'), 'utf8')); }
  catch { return send(res, 404, { error: 'not_found' }); }
  send(res, 200, {
    id: meta.id,
    type: meta.type,
    label: meta.label,
    items: meta.items.map(i => ({ name: i.name, size: i.size })),
    totalSize: meta.totalSize,
    createdAt: meta.createdAt,
  });
}

async function handleFileDownload(req, res, id, idxStr) {
  const idx = Number(idxStr);
  if (!Number.isInteger(idx) || idx < 0) return send(res, 400, { error: 'bad_index' });
  let shareDir;
  try { shareDir = shareDirFor(id); }
  catch { return send(res, 400, { error: 'bad_id' }); }
  let meta;
  try { meta = JSON.parse(await fsp.readFile(path.resolve(shareDir, 'meta.json'), 'utf8')); }
  catch { return send(res, 404, { error: 'not_found' }); }
  if (!meta.items[idx]) return send(res, 404, { error: 'no_such_file' });
  let filePath;
  try { filePath = indexedFilePath(shareDir, idx); }
  catch { return send(res, 400, { error: 'bad_path' }); }
  if (!fs.existsSync(filePath)) return send(res, 404, { error: 'file_missing' });
  const encoded = encodeURIComponent(meta.items[idx].name);
  res.writeHead(200, {
    'Content-Type': meta.items[idx].mime || 'application/octet-stream',
    'Content-Disposition': `attachment; filename*=UTF-8''${encoded}`,
    'Content-Length': meta.items[idx].size,
    'Access-Control-Allow-Origin': '*',
  });
  fs.createReadStream(filePath).pipe(res);
}

async function handleZipDownload(req, res, id) {
  let shareDir, zipPath;
  try { shareDir = shareDirFor(id); zipPath = tmpZipPath(id); }
  catch { return send(res, 400, { error: 'bad_id' }); }
  let meta;
  try { meta = JSON.parse(await fsp.readFile(path.resolve(shareDir, 'meta.json'), 'utf8')); }
  catch { return send(res, 404, { error: 'not_found' }); }
  if (meta.type !== 'bundle') return send(res, 400, { error: 'not_bundle' });

  try {
    const items = [];
    for (let i = 0; i < meta.items.length; i++) {
      items.push({ name: meta.items[i].name, filePath: indexedFilePath(shareDir, i) });
    }
    await packZipFromDisk(zipPath, items);
    const size = (await fsp.stat(zipPath)).size;
    res.writeHead(200, {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="share-${id}.zip"`,
      'Content-Length': size,
      'Access-Control-Allow-Origin': '*',
    });
    fs.createReadStream(zipPath)
      .on('end', () => fsp.rm(zipPath, { force: true }).catch(() => {}))
      .on('error', () => {})
      .pipe(res);
  } catch (e) {
    send(res, 500, { error: 'zip_failed', error_description: e.message });
  }
}

async function handleDelete(req, res, id) {
  const session = (req.headers['x-session'] || '').toString().slice(0, 128);
  let shareDir;
  try { shareDir = shareDirFor(id); }
  catch { return send(res, 400, { error: 'bad_id' }); }
  let metaObj;
  try { metaObj = JSON.parse(await fsp.readFile(path.resolve(shareDir, 'meta.json'), 'utf8')); }
  catch { return send(res, 404, { error: 'not_found' }); }
  if (metaObj.session !== session) {
    return send(res, 403, { error: 'forbidden', error_description: '只能删除本会话创建的 share' });
  }
  await fsp.rm(shareDir, { recursive: true, force: true });
  send(res, 200, { ok: true });
}

async function handleList(req, res, url) {
  const session = url.searchParams.get('session') || '';
  if (!session) return send(res, 200, { items: [] });
  const out = [];
  let entries;
  try { entries = await fsp.readdir(DATA_DIR, { withFileTypes: true }); } catch { entries = []; }
  for (const e of entries) {
    if (!e.isDirectory() || !e.name.startsWith('share_') || e.name.includes('..')) continue;
    const idPart = e.name.slice('share_'.length);
    if (!ID_PATTERN.test(idPart)) continue; // 只读白名单 id
    try {
      const meta = JSON.parse(await fsp.readFile(path.resolve(DATA_DIR, e.name, 'meta.json'), 'utf8'));
      if (meta.session !== session) continue;
      out.push({
        id: meta.id, type: meta.type, label: meta.label,
        items: meta.items.map(i => ({ name: i.name, size: i.size })),
        totalSize: meta.totalSize, createdAt: meta.createdAt,
      });
    } catch { /* skip */ }
  }
  out.sort((a, b) => b.createdAt - a.createdAt);
  send(res, 200, { items: out, usedBytes: await calcTotalBytes(DATA_DIR), limitBytes: MAX_TOTAL_BYTES });
}

async function handleClear(req, res, url) {
  const session = url.searchParams.get('session') || '';
  if (!session) return send(res, 400, { error: 'missing_session' });
  let entries;
  try { entries = await fsp.readdir(DATA_DIR, { withFileTypes: true }); } catch { entries = []; }
  let removed = 0;
  for (const e of entries) {
    if (!e.isDirectory() || !e.name.startsWith('share_') || e.name.includes('..')) continue;
    const idPart = e.name.slice('share_'.length);
    if (!ID_PATTERN.test(idPart)) continue;
    const fullPath = path.resolve(DATA_DIR, e.name);
    if (!fullPath.startsWith(DATA_DIR + path.sep)) continue;
    try {
      const meta = JSON.parse(await fsp.readFile(path.resolve(fullPath, 'meta.json'), 'utf8'));
      if (meta.session === session) {
        await fsp.rm(fullPath, { recursive: true, force: true });
        removed++;
      }
    } catch { /* skip */ }
  }
  send(res, 200, { removed });
}

// ========================================================================
// 路由
// ========================================================================

const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, JSON_HEADERS);
    return res.end();
  }

  try {
    const p = reqUrl.pathname;
    if (req.method === 'GET' && p === '/api/lan/info') return handleInfo(req, res);
    if (req.method === 'POST' && p === '/api/lan/upload') return handleUpload(req, res);
    if (req.method === 'GET' && p === '/api/lan/ping') return send(res, 200, { pong: true });
    if (req.method === 'GET' && p === '/api/lan/list') return handleList(req, res, reqUrl);
    if (req.method === 'DELETE' && p === '/api/lan/clear') return handleClear(req, res, reqUrl);
    if (p.startsWith('/api/lan/share/')) {
      const rest = p.slice('/api/lan/share/'.length);
      const parts = rest.split('/').map(s => s).filter(Boolean);
      if (parts.length === 0) return send(res, 400, { error: 'bad_path' });
      // 验证第一段 id
      if (!ID_PATTERN.test(parts[0])) return send(res, 400, { error: 'bad_id' });
      const id = parts[0];
      if (req.method === 'GET' && parts.length === 1) return handleShareMeta(req, res, id);
      if (req.method === 'GET' && parts.length === 3 && parts[1] === 'file') return handleFileDownload(req, res, id, parts[2]);
      if (req.method === 'GET' && parts.length === 2 && parts[1] === 'zip') return handleZipDownload(req, res, id);
      if (req.method === 'DELETE' && parts.length === 1) return handleDelete(req, res, id);
    }
    send(res, 404, { error: 'not_found', path: reqUrl.pathname });
  } catch (e) {
    send(res, 500, { error: 'server_error', error_description: e.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`\n[lan-share] listening on http://${HOST}:${PORT}`);
  console.log(`[lan-share] data dir: ${DATA_DIR}`);
  console.log(`[lan-share] lan ip: ${detectLanIP()}`);
  console.log(`[lan-share] quota: ${(MAX_TOTAL_BYTES / 1024 / 1024 / 1024).toFixed(2)} GB total, ${(MAX_FILE_BYTES / 1024 / 1024).toFixed(0)} MB/file`);
  console.log(`[lan-share] frontend should reverse-proxy /api/lan/* to this port (set LAN_SHARE_BACKEND=1 on wrangler dev)\n`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { console.log(`\n[lan-share] ${sig} received, shutting down`); server.close(() => process.exit(0)); });
}