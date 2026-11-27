const { put, head, list, del, BlobNotFoundError } = require('@vercel/blob');
const crypto = require('crypto');

const SECRET = process.env.APP_SECRET || process.env.ADMIN_PASSWORD || 'minna';
const DEFAULT_CONFIG = { daily: { k: 20, j: 10, b: 5 } };

const hkey = s => crypto.createHmac('sha256', SECRET).update(String(s)).digest('hex').slice(0, 40);
const rid = () => crypto.randomBytes(16).toString('hex');

async function readJSON(pathname) {
  try {
    const h = await head(pathname);
    const r = await fetch(h.url + '?v=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    if (e instanceof BlobNotFoundError || /does not exist|not.?found/i.test((e && e.message) || '')) return null;
    throw e;
  }
}
async function writeJSON(pathname, data) {
  await put(pathname, JSON.stringify(data), {
    access: 'public', addRandomSuffix: false, allowOverwrite: true,
    contentType: 'application/json', cacheControlMaxAge: 60,
  });
}
async function listJSON(prefix) {
  const out = []; let cursor;
  do {
    const r = await list({ prefix, cursor, limit: 1000 });
    out.push(...r.blobs); cursor = r.hasMore ? r.cursor : undefined;
  } while (cursor);
  const docs = await Promise.all(out.map(b => fetch(b.url + '?v=' + Date.now(), { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null)));
  return docs.filter(Boolean);
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

async function removeJSON(pathname) { try { const h = await head(pathname); await del(h.url); } catch (e) { if (!(e instanceof BlobNotFoundError)) throw e; } }

module.exports = { removeJSON, readJSON, writeJSON, listJSON, body, send, isAdmin, hkey, rid, clip, mergeDays, DEFAULT_CONFIG };
