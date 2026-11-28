const { put, head, list, del, BlobNotFoundError } = require('@vercel/blob');
const crypto = require('crypto');

const SECRET = process.env.APP_SECRET || process.env.ADMIN_PASSWORD || 'minna';
const DEFAULT_CONFIG = { mode: 'level', daily: { k: 20, j: 10, b: 5 } };

const hkey = s => crypto.createHmac('sha256', SECRET).update(String(s)).digest('hex').slice(0, 40);
const rid = () => crypto.randomBytes(16).toString('hex');

// ---- storage: Upstash Redis (if configured) else Vercel Blob ----
// Blob on the Hobby plan has a small monthly operations quota; when it runs out the
// store is suspended and every write fails. Redis (Upstash free tier) has a far
// larger quota, so it is used whenever its env vars are present.
const R_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const R_TOK = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
const USE_REDIS = !!(R_URL && R_TOK);
const NS = 'mnf:';
const sleep = ms => new Promise(r => setTimeout(r, ms));

// retry transient failures (network, 429, 5xx) with backoff
async function retry(fn, tries = 3) {
  let err;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); } catch (e) {
      err = e;
      if (e && (e.permanent || e instanceof BlobNotFoundError || isSuspended(e))) throw e;
      if (i < tries - 1) await sleep(250 * Math.pow(3, i));
    }
  }
  throw err;
}
function isSuspended(e) { return !!e && (e.name === 'BlobStoreSuspendedError' || /suspended/i.test(e.message || '')); }

async function redis(cmds) {
  return retry(async () => {
    const r = await fetch(R_URL.replace(/\/$/, '') + '/pipeline', {
      method: 'POST', headers: { authorization: 'Bearer ' + R_TOK, 'content-type': 'application/json' },
      body: JSON.stringify(cmds),
    });
    if (!r.ok) { const e = new Error('redis HTTP ' + r.status); if (r.status < 500 && r.status !== 429) e.permanent = true; throw e; }
    const out = await r.json();
    for (const x of out) if (x && x.error) throw new Error('redis: ' + x.error);
    return out.map(x => x.result);
  });
}
const dirOf = p => p.includes('/') ? p.slice(0, p.lastIndexOf('/') + 1) : '';
const parse = v => { if (v == null) return null; try { return JSON.parse(v); } catch { return null; } };

async function readJSON(pathname) {
  if (USE_REDIS) { const [v] = await redis([['GET', NS + pathname]]); return parse(v); }
  try {
    return await retry(async () => {
      const h = await head(pathname);
      const r = await fetch(h.url + '?v=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) return null;
      return await r.json();
    });
  } catch (e) {
    if (e instanceof BlobNotFoundError || /does not exist|not.?found/i.test((e && e.message) || '')) return null;
    throw e;
  }
}
async function writeJSON(pathname, data) {
  if (USE_REDIS) {
    const cmds = [['SET', NS + pathname, JSON.stringify(data)]];
    const d = dirOf(pathname); if (d) cmds.push(['SADD', NS + 'idx:' + d, pathname]);
    await redis(cmds); return;
  }
  await retry(() => put(pathname, JSON.stringify(data), {
    access: 'public', addRandomSuffix: false, allowOverwrite: true,
    contentType: 'application/json', cacheControlMaxAge: 60,
  }));
}
async function listJSON(prefix) {
  if (USE_REDIS) {
    const [keys] = await redis([['SMEMBERS', NS + 'idx:' + prefix]]);
    if (!keys || !keys.length) return [];
    const [vals] = await redis([['MGET', ...keys.map(k => NS + k)]]);
    return vals.map(parse).filter(Boolean);
  }
  const out = []; let cursor;
  do {
    const r = await retry(() => list({ prefix, cursor, limit: 1000 }));
    out.push(...r.blobs); cursor = r.hasMore ? r.cursor : undefined;
  } while (cursor);
  const docs = await Promise.all(out.map(b => fetch(b.url + '?v=' + Date.now(), { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null)));
  return docs.filter(Boolean);
}
async function removeJSON(pathname) {
  if (USE_REDIS) { const cmds = [['DEL', NS + pathname]]; const d = dirOf(pathname); if (d) cmds.push(['SREM', NS + 'idx:' + d, pathname]); await redis(cmds); return; }
  try { const h = await head(pathname); await del(h.url); } catch (e) { if (!(e instanceof BlobNotFoundError)) throw e; }
}

// friendly message for the students when storage fails
function storageError(e) {
  if (isSuspended(e)) return 'Penyimpanan data sedang penuh untuk bulan ini. Belajar tetap bisa jalan dan progres tersimpan di HP. Sensei sedang memperbaikinya, coba daftar lagi nanti ya.';
  return 'Server sedang sibuk. Tunggu sekitar 1 menit lalu coba lagi ya.';
}

function body(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body || '{}'); } catch { return {}; }
}
function send(res, code, data) {
  res.setHeader('cache-control', 'no-store');
  res.status(code).json(data);
}
function isAdmin(req) {
  const p = req.headers['x-admin-pass'] || '';
  const real = process.env.ADMIN_PASSWORD || '';
  if (!real || !p) return false;
  const a = Buffer.from(String(p)), b = Buffer.from(real);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const clip = (s, n) => String(s ?? '').trim().slice(0, n);

// merge day records: keep the larger value for every counter
function mergeDays(a = {}, b = {}) {
  const out = { ...a };
  for (const d of Object.keys(b)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    const x = out[d] || {}, y = b[d] || {}; const m = { ...x };
    for (const k of ['k', 'j', 'b']) {
      if (Array.isArray(y[k])) {
        const yy = [Number(y[k][0]) || 0, Number(y[k][1]) || 0];
        if (!Array.isArray(x[k]) || yy[0] > x[k][0] || (yy[0] === x[k][0] && yy[1] > x[k][1])) m[k] = yy;
      }
    }
    for (const k of ['n', 'ms', 'last']) m[k] = Math.max(Number(x[k]) || 0, Number(y[k]) || 0);
    if (y.c && typeof y.c === 'object') { m.c = { ...(x.c || {}) }; for (const k of ['k', 'j', 'b']) m.c[k] = Math.max(Number((x.c || {})[k]) || 0, Number(y.c[k]) || 0); }
    out[d] = m;
  }
  const keys = Object.keys(out).sort(); while (keys.length > 120) delete out[keys.shift()];
  return out;
}


module.exports = { USE_REDIS, storageError, isSuspended, removeJSON, readJSON, writeJSON, listJSON, body, send, isAdmin, hkey, rid, clip, mergeDays, DEFAULT_CONFIG };
