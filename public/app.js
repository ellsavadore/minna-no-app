/* みんなの復習 — Flashcard Fukushu */
(() => {
'use strict';
const LEVELS = ['A1', 'A2.1', 'A2.2'];
const LEVEL_NAME = { 'A1': 'A1 · Nyuumon', 'A2.1': 'A2.1 · Shokyuu 1', 'A2.2': 'A2.2 · Shokyuu 2' };
const DECKS = {
  k: { name: 'Kotoba', jp: '言葉', ico: 'あ', cls: 't-k', unit: 'kata' },
  j: { name: 'Kanji', jp: '漢字', ico: '漢', cls: 't-j', unit: 'kanji' },
  b: { name: 'Pola Kalimat', jp: '文型', ico: '文', cls: 't-b', unit: 'pola' },
};
const DATA_BASE = window.MNA_DATA_BASE || '/data/';
const $app = document.getElementById('app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const todayKey = (d = new Date()) => { const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return z.toISOString().slice(0, 10); };
const dayShift = (k, n) => { const d = new Date(k + 'T12:00:00'); d.setDate(d.getDate() + n); return todayKey(d); };

/* ---------- storage ---------- */
const KEY = 'mna.v1';
let S;
function load() { try { S = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { S = {}; } S.cards ||= {}; S.days ||= {}; S.ptr ||= {}; S.prefs ||= { reading: true, reverse: false, auto: true }; S.daily ||= {}; }
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} }
load();

/* ---------- toast ---------- */
let tt;
function toast(msg) { const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('show'), 2200); }

/* ---------- api ---------- */
async function api(path, body, headers = {}) {
  const r = await fetch('/api/' + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
  return j;
}
let CONFIG = { daily: { k: 20, j: 10, b: 5 } };
api('config').then(c => { if (c && c.daily) { CONFIG = c; if (route === 'home') render(); } }).catch(() => {});

let syncTimer;
function queueSync(now) { clearTimeout(syncTimer); syncTimer = setTimeout(sync, now ? 10 : 1500); }
async function sync() {
  if (!S.user) return;
  const mastered = {};
  for (const k in S.cards) if (S.cards[k].s === 1) { const [lv, dk] = k.split('|'); (mastered[lv] ||= { k: 0, j: 0, b: 0 })[dk]++; }
  const days = {}; Object.keys(S.days).sort().slice(-60).forEach(d => days[d] = S.days[d]);
  try { await api('sync', { id: S.user.id, token: S.user.token, name: S.user.name, email: S.user.email, level: S.user.level, days, mastered, totals: TOTALS }); } catch (e) { /* offline: try later */ }
}
window.addEventListener('online', () => queueSync(true));
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') sync(); });

/* ---------- data ---------- */
const DATA = {}; const TOTALS = {};
async function getData(lv) {
  if (DATA[lv]) return DATA[lv];
  const r = await fetch(DATA_BASE + lv + '.json');
  const d = await r.json();
  DATA[lv] = d; TOTALS[lv] = { k: d.k.length, j: d.j.length, b: d.b.length };
  return d;
}
function card(lv, dk, i) {
  const d = DATA[lv]; const x = d[dk][i];
  if (dk === 'b') return { type: 'b', p: x[0], ex: x[1] || [], exp: x[2] || '', l: x[3] };
  return { type: dk, w: x[0], r: x[1] || '', m: x[2] || '', l: x[3] };
}

/* ---------- daily task ---------- */
function dailySet(lv) {
  const t = todayKey(); const key = t + '|' + lv;
  const cfg = CONFIG.daily;
  if (S.daily.key === key && S.daily.cfg === JSON.stringify(cfg)) return S.daily.sets;
  const d = DATA[lv]; const sets = {};
  for (const dk of ['k', 'j', 'b']) {
    const n = Math.min(cfg[dk] || 0, d[dk].length); const pick = [];
    const learning = []; for (let i = 0; i < d[dk].length; i++) { const c = S.cards[lv + '|' + dk + '|' + i]; if (c && c.s === 0) learning.push([c.t, i]); }
    learning.sort((a, b) => a[0] - b[0]);
    for (const [, i] of learning) { if (pick.length >= Math.ceil(n / 2)) break; pick.push(i); }
    let p = S.ptr[lv + '|' + dk] || 0; let guard = 0;
    while (pick.length < n && guard++ < d[dk].length * 2) { const i = p % d[dk].length; p++; const c = S.cards[lv + '|' + dk + '|' + i]; if (!pick.includes(i) && !(c && c.s === 1 && guard < d[dk].length)) pick.push(i); }
    S.ptr[lv + '|' + dk] = p % d[dk].length;
    sets[dk] = pick;
  }
  S.daily = { key, sets, cfg: JSON.stringify(cfg) }; save();
  return sets;
}
function dayRec(k = todayKey()) { return (S.days[k] ||= {}); }
function taskDone(dk, k = todayKey()) { const r = S.days[k]; return !!(r && r[dk] && r[dk][0] >= r[dk][1] && r[dk][1] > 0); }
function streak() { let n = 0; let k = todayKey(); if (!allDone(k)) k = dayShift(k, -1); while (allDone(k)) { n++; k = dayShift(k, -1); } return n; }
function allDone(k) { return ['k', 'j', 'b'].every(dk => taskDone(dk, k)); }
function anyDone(k) { const r = S.days[k]; return !!(r && (r.n || 0) > 0); }

/* ---------- icons ---------- */
const I = {
  home: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3.2 2.8 10.6c-.5.4-.2 1.2.4 1.2H5v7.7c0 .8.7 1.5 1.5 1.5h3.7v-5.5h3.6V21h3.7c.8 0 1.5-.7 1.5-1.5v-7.7h1.8c.6 0 .9-.8.4-1.2Z"/></svg>',
  decks: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="6" width="14" height="15" rx="3"/><path d="M7 3.5h11a3 3 0 0 1 3 3V17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  me: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="8" r="4.2"/><path d="M3.8 20.2c.9-4 4.2-6.2 8.2-6.2s7.3 2.2 8.2 6.2c.1.5-.3.8-.8.8H4.6c-.5 0-.9-.3-.8-.8Z"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  chev: '<svg width="9" height="15" viewBox="0 0 9 15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m1.5 1.5 6 6-6 6"/></svg>',
  check: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  spk: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 9.5v5c0 .6.4 1 1 1h3l4.3 3.6c.6.5 1.7.1 1.7-.8V5.7c0-.9-1-1.3-1.7-.8L8 8.5H5c-.6 0-1 .4-1 1Z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M18.8 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  flip: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12a8 8 0 0 1 13.7-5.6L20 8.5M20 4v4.5h-4.5M20 12a8 8 0 0 1-13.7 5.6L4 15.5M4 20v-4.5h4.5"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>',
};

/* ---------- speech ---------- */
let jaVoice = null;
function pickVoice() { if (!('speechSynthesis' in window)) return; const vs = speechSynthesis.getVoices(); jaVoice = vs.find(v => /ja[-_]JP/i.test(v.lang) && /Kyoko|O-ren|Google/i.test(v.name)) || vs.find(v => /^ja/i.test(v.lang)) || null; }
if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
function speak(text) {
  if (!('speechSynthesis' in window) || !text) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(String(text).replace(/[～〜~]/g, '').replace(/（[^）]*）|\([^)]*\)/g, ''));
  u.lang = 'ja-JP'; u.rate = 0.9; if (jaVoice) u.voice = jaVoice; speechSynthesis.speak(u);
}

/* ---------- router ---------- */
let route = 'home';
function go(r) { route = r; render(); window.scrollTo(0, 0); }
function render() {
  if (location.hash === '#admin') return renderAdmin();
  if (!S.user) return renderOnboard();
  const lv = S.user.level;
  if (!DATA[lv]) { $app.innerHTML = '<div class="spin"></div>'; getData(lv).then(render).catch(() => { $app.innerHTML = '<div class="empty">Gagal memuat data. Periksa koneksi internet lalu muat ulang.</div>'; }); return; }
  if (route === 'decks') renderDecks(); else if (route === 'me') renderMe(); else renderHome();
  $app.insertAdjacentHTML('beforeend', `<nav class="tabbar">
    <button data-go="home" class="${route === 'home' ? 'on' : ''}">${I.home}Hari Ini</button>
    <button data-go="decks" class="${route === 'decks' ? 'on' : ''}">${I.decks}Flashcard</button>
    <button data-go="me" class="${route === 'me' ? 'on' : ''}">${I.me}Profil</button></nav>`);
  $app.querySelectorAll('[data-go]').forEach(b => b.onclick = () => go(b.dataset.go));
}
window.addEventListener('hashchange', render);

/* ---------- onboarding ---------- */
function renderOnboard() {
  let lv = 'A1';
  $app.innerHTML = `<div class="hero">
    <div class="appicon">愛</div>
    <h1 class="appname">みんなの復習</h1>
    <p class="romaji">MINNA NO FUKUSHU</p><div class="rule"></div>
    <form class="card formcard" id="reg" autocomplete="on">
      <label class="field"><span>Nama lengkap</span><input class="input" name="name" required maxlength="60" placeholder="Nama kamu" autocomplete="name"></label>
      <label class="field"><span>Email</span><input class="input" name="email" type="email" required maxlength="120" placeholder="nama@email.com" autocomplete="email" inputmode="email"></label>
      <div class="field"><span>Level belajar</span><div class="seg" id="lv">${LEVELS.map(l => `<button type="button" data-l="${l}" class="${l === lv ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <div class="err" id="err"></div>
      <button class="btn primary" type="submit">Daftar &amp; Mulai Belajar</button>
    </form>
    <p class="sub" style="text-align:center;margin:0 10px">Sudah pernah daftar? Isi nama &amp; email yang sama untuk masuk kembali.</p>
    <a class="link" href="#admin">Masuk sebagai Admin</a>
    <p class="credit"><span>作</span>サルマン・アルヒダムカラ<small>Salman Alhidamkara</small></p>
  </div>`;
  const seg = document.getElementById('lv');
  seg.onclick = e => { const b = e.target.closest('button'); if (!b) return; lv = b.dataset.l; seg.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); };
  document.getElementById('reg').onsubmit = async e => {
    e.preventDefault(); const f = new FormData(e.target); const btn = e.target.querySelector('.btn');
    const name = String(f.get('name')).trim(), email = String(f.get('email')).trim().toLowerCase();
    if (name.length < 2) return document.getElementById('err').textContent = 'Nama minimal 2 huruf.';
    btn.disabled = true; btn.textContent = 'Menyimpan…';
    try {
      const r = await api('register', { name, email, level: lv });
      S.user = { id: r.id, token: r.token, name: r.name || name, email, level: r.existing && r.level ? r.level : lv };
      if (r.days) for (const d in r.days) S.days[d] ||= r.days[d];
      save(); toast(r.existing ? 'おかえり, ' + S.user.name + '!' : 'ようこそ! Pendaftaran berhasil'); go('home');
    } catch (err) { document.getElementById('err').textContent = err.message === 'Failed to fetch' ? 'Tidak ada koneksi internet.' : err.message; btn.disabled = false; btn.textContent = 'Daftar & Mulai Belajar'; }
  };
}

/* ---------- home ---------- */
function greetWord() { const h = new Date().getHours(); return h < 11 ? 'おはよう' : h < 18 ? 'こんにちは' : 'こんばんは'; }
function renderHome() {
  const lv = S.user.level; const sets = dailySet(lv); const rec = dayRec();
  const parts = ['k', 'j', 'b'].map(dk => { const tot = sets[dk].length; const done = Math.min(rec[dk] ? rec[dk][0] : 0, tot); return { dk, tot, done }; });
  const pct = Math.round(100 * parts.reduce((a, p) => a + (p.tot ? p.done / p.tot : 1), 0) / 3);
  const C = 2 * Math.PI * 42; const st = streak();
  const days = []; for (let i = 6; i >= 0; i--) days.push(dayShift(todayKey(), -i));
  const dn = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
  $app.innerHTML = `<div class="screen">
    <div class="greet"><div class="avatar">${esc(S.user.name[0].toUpperCase())}</div>
      <div><div class="hi jp">${greetWord()},</div><div class="nm">${esc(S.user.name.split(' ')[0])}</div></div><div class="spacer"></div>
      <div class="streak">🔥 ${st}</div></div>
    <div class="card today">
      <div class="ring"><svg width="96" height="96"><circle cx="48" cy="48" r="42" stroke="var(--fill)" stroke-width="10" fill="none"/>
        <circle cx="48" cy="48" r="42" stroke="url(#g)" stroke-width="10" fill="none" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct / 100)}" style="transition:stroke-dashoffset .8s"/>
        <defs><linearGradient id="g"><stop offset="0" stop-color="#40d2c6"/><stop offset="1" stop-color="#087f86"/></linearGradient></defs></svg><b>${pct}%</b></div>
      <div><h3>${pct >= 100 ? 'Tugas hari ini selesai' : 'Tugas Fukushu Hari Ini'}</h3>
      <p>${pct >= 100 ? 'すごい！ Kamu hebat. Sampai jumpa besok ya.' : 'Selesaikan Kotoba, Kanji, dan Pola Kalimat untuk menjaga streak 🔥'}</p>
      <p style="margin-top:6px"><span class="pill p">${esc(LEVEL_NAME[lv])}</span></p></div>
    </div>
    <div class="section">Tugas Hari Ini</div>
    ${parts.map(p => { const D = DECKS[p.dk]; const ok = p.tot > 0 && p.done >= p.tot; return `<button class="card task ${ok ? 'complete' : ''}" data-task="${p.dk}">
      <div class="tico ${D.cls}">${D.ico}</div>
      <div style="flex:1;min-width:0"><div class="tt">${D.name} <span class="jp" style="color:var(--ink3);font-weight:500;font-size:14px">${D.jp}</span></div>
      <div class="ts">${ok ? '<span class="donepill">完了 · Selesai</span> ' + p.tot + ' kartu' : p.done + ' / ' + p.tot + ' kartu'}</div>
      <div class="mini"><i style="width:${p.tot ? 100 * p.done / p.tot : 0}%"></i></div></div>
      <div class="check ${ok ? 'ok' : ''}">${ok ? I.check : ''}</div></button>`; }).join('')}
    <div class="section">7 Hari Terakhir</div>
    <div class="card week">${days.map(d => { const full = allDone(d), part = anyDone(d); return `<div class="${d === todayKey() ? 'tdy' : ''}"><i class="${full ? 'full' : part ? 'part' : ''}">${full ? '✓' : part ? '•' : ''}</i>${dn[new Date(d + 'T12:00:00').getDay()]}</div>`; }).join('')}</div>
  </div>`;
  $app.querySelectorAll('[data-task]').forEach(b => b.onclick = () => { const dk = b.dataset.task; startStudy(lv, dk, sets[dk].slice(), { daily: true, title: 'Tugas ' + DECKS[dk].name }); });
}

/* ---------- decks ---------- */
function deckStats(lv, dk) {
  const n = DATA[lv] ? DATA[lv][dk].length : 0; let m = 0, l = 0;
  for (let i = 0; i < n; i++) { const c = S.cards[lv + '|' + dk + '|' + i]; if (c) c.s === 1 ? m++ : l++; }
  return { n, m, l, nw: n - m - l };
}
let deckLevel = null;
function renderDecks() {
  deckLevel ||= S.user.level; const lv = deckLevel;
  if (!DATA[lv]) { $app.innerHTML = '<div class="spin"></div>'; getData(lv).then(render); return; }
  $app.innerHTML = `<div class="screen">
    <p class="brand">みんなの復習</p><h1 class="largeTitle">Flashcard</h1><p class="sub">Semua kartu dikelompokkan per level.</p>
    <div class="seg" id="lvs" style="margin-bottom:18px">${LEVELS.map(l => `<button data-l="${l}" class="${l === lv ? 'on' : ''}">${l}</button>`).join('')}</div>
    ${['k', 'j', 'b'].map(dk => { const D = DECKS[dk], s = deckStats(lv, dk); return `<button class="card deck" data-deck="${dk}">
      <div class="row"><div class="tico ${D.cls}">${D.ico}</div><div style="flex:1"><div class="tt">${D.name}</div><div class="ts">${esc(LEVEL_NAME[lv])} · ${s.n} ${D.unit}</div></div><span class="chev">${I.chev}</span></div>
      <div class="mini"><i style="width:${s.n ? 100 * s.m / s.n : 0}%"></i></div>
      <div class="stats3"><div><b style="color:var(--green)">${s.m}</b><small>Hafal</small></div><div><b style="color:var(--orange)">${s.l}</b><small>Belum hafal</small></div><div><b>${s.nw}</b><small>Baru</small></div></div>
    </button>`; }).join('')}
  </div>`;
  document.getElementById('lvs').onclick = e => { const b = e.target.closest('button'); if (b) { deckLevel = b.dataset.l; render(); } };
  $app.querySelectorAll('[data-deck]').forEach(b => b.onclick = () => deckSheet(lv, b.dataset.deck));
}
function deckSheet(lv, dk) {
  const D = DECKS[dk], s = deckStats(lv, dk), n = s.n; const ptrKey = lv + '|' + dk + '|free'; const p = S.ptr[ptrKey] || 0;
  const bg = document.createElement('div'); bg.className = 'sheetBg';
  bg.innerHTML = `<div class="sheet" role="dialog"><div class="grab"></div>
    <div class="row" style="margin-bottom:8px"><div class="tico ${D.cls}">${D.ico}</div><div><h3>${D.name} ${esc(lv)}</h3><div class="sub" style="margin:0">${n} kartu · ${s.m} hafal</div></div></div>
    <div style="display:grid;gap:10px;margin:16px 0">
      <button class="btn primary" data-a="next">Lanjutkan · kartu ${Math.min(p + 1, n)}–${Math.min(p + 20, n)}</button>
      <button class="btn ghost" data-a="weak" ${s.l ? '' : 'disabled'}>Ulangi yang belum hafal (${s.l})</button>
      <button class="btn ghost" data-a="rand">Acak 20 kartu</button>
      <button class="btn ghost" data-a="all">Semua kartu (${n})</button>
    </div>
    <div class="optrow">Mulai dari arti (Indonesia → Jepang)<button class="switch ${S.prefs.reverse ? 'on' : ''}" data-p="reverse" aria-label="Balik arah"></button></div>
    <div class="optrow">Ucapkan otomatis (suara Jepang)<button class="switch ${S.prefs.auto ? 'on' : ''}" data-p="auto" aria-label="Suara otomatis"></button></div>
    <button class="btn ghost" data-a="close" style="margin-top:10px">Tutup</button></div>`;
  document.body.appendChild(bg);
  const close = () => bg.remove();
  bg.onclick = e => {
    if (e.target === bg) return close();
    const sw = e.target.closest('[data-p]'); if (sw) { S.prefs[sw.dataset.p] = !S.prefs[sw.dataset.p]; sw.classList.toggle('on'); save(); return; }
    const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return;
    if (a === 'close') return close();
    let idx = [];
    if (a === 'next') { for (let i = 0; i < Math.min(20, n); i++) idx.push((p + i) % n); S.ptr[ptrKey] = (p + 20) >= n ? 0 : p + 20; save(); }
    if (a === 'weak') for (let i = 0; i < n; i++) { const c = S.cards[lv + '|' + dk + '|' + i]; if (c && c.s === 0) idx.push(i); }
    if (a === 'rand') { const all = [...Array(n).keys()]; shuffle(all); idx = all.slice(0, 20); }
    if (a === 'all') idx = [...Array(n).keys()];
    close(); startStudy(lv, dk, idx, { title: D.name + ' ' + lv });
  };
}
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

/* ---------- profile ---------- */
function renderMe() {
  const u = S.user; let tm = 0, tc = 0; for (const lv of LEVELS) { if (!TOTALS[lv]) continue; tc += TOTALS[lv].k + TOTALS[lv].j + TOTALS[lv].b; }
  for (const k in S.cards) if (S.cards[k].s === 1) tm++;
  const daysActive = Object.keys(S.days).filter(anyDone).length;
  $app.innerHTML = `<div class="screen">
    <p class="brand">みんなの復習</p><h1 class="largeTitle">Profil</h1><p class="sub">Data belajarmu tersimpan dan dipantau oleh sensei.</p>
    <div class="card" style="padding:18px"><div class="row"><div class="avatar" style="width:58px;height:58px;font-size:22px">${esc(u.name[0].toUpperCase())}</div>
      <div style="min-width:0"><div style="font-weight:800;font-size:19px">${esc(u.name)}</div><div class="sub" style="margin:2px 0 0;overflow:hidden;text-overflow:ellipsis">${esc(u.email)}</div></div></div>
      <div class="stats3"><div><b>🔥 ${streak()}</b><small>Streak</small></div><div><b>${tm}</b><small>Kartu hafal</small></div><div><b>${daysActive}</b><small>Hari aktif</small></div></div></div>
    <div class="section">Level Belajar</div>
    <div class="card" style="padding:14px"><div class="seg" id="lvp">${LEVELS.map(l => `<button data-l="${l}" class="${l === u.level ? 'on' : ''}">${l}</button>`).join('')}</div>
    <p class="sub" style="margin:10px 4px 0;font-size:13px">Tugas harian diambil dari level ini.</p></div>
    <div class="section">Pengaturan Kartu</div>
    <div class="card" style="padding:4px 16px">
      <div class="optrow">Tampilkan cara baca (furigana)<button class="switch ${S.prefs.reading ? 'on' : ''}" data-p="reading"></button></div>
      <div class="optrow">Mulai dari arti (Indonesia → Jepang)<button class="switch ${S.prefs.reverse ? 'on' : ''}" data-p="reverse"></button></div>
      <div class="optrow">Ucapkan otomatis (suara Jepang)<button class="switch ${S.prefs.auto ? 'on' : ''}" data-p="auto"></button></div>
    </div>
    <button class="btn ghost" id="out" style="margin-top:22px;color:#e5484d">Keluar</button>
    <p class="credit"><span>作</span>サルマン・アルヒダムカラ<small>Salman Alhidamkara</small></p><p class="sub" style="text-align:center;margin-top:6px;font-size:12px">みんなの復習 · Materi: IRODORI ©The Japan Foundation</p>
  </div>`;
  document.getElementById('lvp').onclick = e => { const b = e.target.closest('button'); if (!b) return; S.user.level = b.dataset.l; save(); queueSync(); getData(b.dataset.l).then(render); };
  $app.querySelectorAll('[data-p]').forEach(sw => sw.onclick = () => { S.prefs[sw.dataset.p] = !S.prefs[sw.dataset.p]; sw.classList.toggle('on'); save(); });
  document.getElementById('out').onclick = () => { if (confirm('Keluar dari akun ini? Progres tetap tersimpan di server.')) { sync(); localStorage.removeItem(KEY); load(); go('home'); } };
}

/* ---------- study ---------- */
let ST = null;
function startStudy(lv, dk, idx, opt = {}) {
  if (!idx.length) return toast('Tidak ada kartu di sini.');
  ST = { lv, dk, idx, i: 0, yes: 0, no: 0, missed: [], daily: !!opt.daily, title: opt.title || '', t0: Date.now(), flipped: false };
  const el = document.createElement('div'); el.className = 'study'; el.id = 'study'; document.body.appendChild(el); document.body.style.overflow = 'hidden';
  drawStudy();
}
function closeStudy() { document.getElementById('study')?.remove(); document.body.style.overflow = ''; if ('speechSynthesis' in window) speechSynthesis.cancel(); ST = null; render(); }
function faceHTML(c, side) {
  const rev = S.prefs.reverse; const lesson = `<div class="lesson"><span class="pill">Bab ${esc(c.l)}</span></div>`;
  if (c.type === 'b') {
    const ex = c.ex[0];
    if (side === 'front' && !rev) return `<div class="big ${c.p.length > 14 ? 's' : 'm'}">${c.p.split('\n').map(esc).join('<br>')}</div>${ex ? `<div class="exjp">${esc(ex[0])}</div>` : ''}`;
    if (side === 'front' && rev) return ex ? `<div class="mean">${esc(ex[1])}</div><div class="exid" style="margin-top:12px">Bagaimana bahasa Jepangnya?</div>` : `<div class="mean s">${esc(c.exp.split(' • ')[0])}</div>`;
    return `<div class="big s" style="font-size:20px;color:var(--accent)">${c.p.split('\n').map(esc).join('<br>')}</div>
      ${c.ex.slice(0, 3).map(e => `<div class="exjp" style="margin-top:12px">${esc(e[0])}</div><div class="exid">${esc(e[1])}</div>`).join('')}
      ${c.exp ? `<div class="exp">${esc(c.exp.split(' • ')[0])}</div>` : ''}${lesson}`;
  }
  const len = c.w.length; const sz = len > 9 ? 's' : len > 5 ? 'm' : '';
  if (side === 'front') return rev ? `<div class="mean" style="font-size:clamp(22px,6.4vw,30px)">${esc(c.m)}</div>` : `<div class="big ${sz}">${esc(c.w)}</div>`;
  return `${S.prefs.reading && c.r ? `<div class="read">${esc(c.r)}</div>` : ''}<div class="big ${sz}">${esc(c.w)}</div><div class="mean" style="margin-top:16px">${esc(c.m)}</div>${lesson}`;
}
function drawStudy() {
  const el = document.getElementById('study'); if (!el || !ST) return;
  const total = ST.idx.length;
  if (ST.i >= total) return drawDone();
  const c = card(ST.lv, ST.dk, ST.idx[ST.i]); ST.flipped = false;
  const D = DECKS[ST.dk];
  el.innerHTML = `<div class="topbar"><button class="iconbtn" id="xq" aria-label="Tutup">${I.x}</button><div class="pbar"><i style="width:${100 * ST.i / total}%"></i></div><div class="counter">${ST.i + 1} / ${total}</div></div>
    <div class="tally"><span class="l">${ST.no} belum</span><span style="color:var(--ink3);font-weight:600">${esc(ST.title)}</span><span class="r">${ST.yes} hafal</span></div>
    <div class="stage"><span class="stamp l">BELUM</span><span class="stamp r">HAFAL</span><div class="fc enter" id="fc">
      <div class="face front"><span class="tag">${D.name}</span><button class="iconbtn say" data-say>${I.spk}</button><div class="inner">${faceHTML(c, 'front')}</div><div class="hint">Ketuk untuk membalik · geser ← belum / hafal →</div></div>
      <div class="face back"><span class="tag">${D.name}</span><button class="iconbtn say" data-say>${I.spk}</button><div class="inner">${faceHTML(c, 'back')}</div></div>
    </div></div>
    <div class="actions"><button class="abtn no" id="bn">✕ Belum</button><button class="abtn flipb" id="bf" aria-label="Balik">${I.flip}</button><button class="abtn yes" id="by">✓ Hafal</button></div>`;
  const fc = document.getElementById('fc');
  const sayText = c.type === 'b' ? (c.ex[0] ? c.ex[0][0] : c.p) : (c.r || c.w);
  const flip = () => { ST.flipped = !ST.flipped; fc.classList.toggle('flip', ST.flipped); if (ST.flipped && S.prefs.auto && (S.prefs.reverse || c.type !== 'b')) speak(sayText); };
  if (S.prefs.auto && !S.prefs.reverse && c.type !== 'b') setTimeout(() => speak(c.type === 'j' ? sayText : c.r || c.w), 250);
  el.querySelectorAll('[data-say]').forEach(b => b.onclick = e => { e.stopPropagation(); speak(sayText); });
  document.getElementById('xq').onclick = () => { if (ST.i > 0) recordProgress(); closeStudy(); };
  document.getElementById('bf').onclick = flip;
  document.getElementById('bn').onclick = () => { if (!busy) { busy = true; answer(false); } };
  document.getElementById('by').onclick = () => { if (!busy) { busy = true; answer(true); } };
  // swipe (touch + mouse) with direction lock, velocity and stamps
  fc.addEventListener('animationend', () => fc.classList.remove('enter'), { once: true });
  const stL = el.querySelector('.stamp.l'), stR = el.querySelector('.stamp.r');
  let sx = null, sy = 0, dx = 0, dy = 0, lock = null, t0 = 0, busy = false;
  const base = () => (ST && ST.flipped ? ' rotateY(180deg)' : '');
  const paint = () => {
    fc.style.transform = `translateX(${dx}px) rotate(${dx / 18}deg)${base()}`;
    const o = Math.min(1, Math.abs(dx) / 90);
    stR.style.opacity = dx > 0 ? o : 0; stL.style.opacity = dx < 0 ? o : 0;
    fc.classList.toggle('swipeR', dx > 70); fc.classList.toggle('swipeL', dx < -70);
  };
  const reset = () => { fc.style.transition = ''; fc.style.transform = ''; stL.style.opacity = stR.style.opacity = 0; fc.classList.remove('swipeR', 'swipeL'); };
  const start = (x, y) => { if (busy) return; sx = x; sy = y; dx = dy = 0; lock = null; t0 = performance.now(); fc.style.transition = 'none'; };
  const move = (x, y) => {
    if (sx === null) return false; dx = x - sx; dy = y - sy;
    if (!lock && Math.hypot(dx, dy) > 8) lock = Math.abs(dx) >= Math.abs(dy) * 0.8 ? 'x' : 'y';
    if (lock === 'x') { paint(); return true; }
    return false;
  };
  const end = () => {
    if (sx === null) return; sx = null;
    const v = Math.abs(dx) / Math.max(1, performance.now() - t0);
    if (lock === 'x' && (Math.abs(dx) > 80 || (Math.abs(dx) > 35 && v > 0.45))) {
      busy = true; fc.style.transition = 'transform .28s ease-out, opacity .28s';
      fc.style.transform = `translateX(${dx > 0 ? 140 : -140}vw) rotate(${dx > 0 ? 24 : -24}deg)${base()}`; fc.style.opacity = '0';
      (dx > 0 ? stR : stL).style.opacity = 1;
      return answer(dx > 0, true);
    }
    reset(); if (!lock) flip();
  };
  fc.addEventListener('touchstart', e => { if (e.touches.length === 1) start(e.touches[0].clientX, e.touches[0].clientY); }, { passive: true });
  fc.addEventListener('touchmove', e => { if (move(e.touches[0].clientX, e.touches[0].clientY) && e.cancelable) e.preventDefault(); }, { passive: false });
  fc.addEventListener('touchend', e => { if (e.cancelable) e.preventDefault(); end(); }, { passive: false });
  fc.addEventListener('touchcancel', () => { sx = null; reset(); });
  fc.addEventListener('mousedown', e => { start(e.clientX, e.clientY); const mm = ev => move(ev.clientX, ev.clientY); const mu = () => { window.removeEventListener('mousemove', mm); window.removeEventListener('mouseup', mu); end(); }; window.addEventListener('mousemove', mm); window.addEventListener('mouseup', mu); });
}
function answer(ok, swiped) {
  if (!ST) return; const fc = document.getElementById('fc'); const i = ST.idx[ST.i];
  const k = ST.lv + '|' + ST.dk + '|' + i; S.cards[k] = { s: ok ? 1 : 0, t: Date.now() };
  ok ? ST.yes++ : (ST.no++, ST.missed.push(i)); ST.i++;
  const r = dayRec(); r.n = (r.n || 0) + 1; r.c = r.c || {}; r.c[ST.dk] = (r.c[ST.dk] || 0) + 1; save();
  if (ST.daily) recordProgress(true);
  if (navigator.vibrate) navigator.vibrate(ok ? 8 : [6, 40, 6]);
  if (swiped) setTimeout(drawStudy, 240); else if (fc) { fc.style.transform = ''; fc.classList.add(ok ? 'fly-r' : 'fly-l'); setTimeout(drawStudy, 260); } else drawStudy();
}
function recordProgress(silent) {
  if (!ST) return; const r = dayRec();
  if (ST.daily) { const tot = ST.idx.length; const prev = r[ST.dk] ? r[ST.dk][0] : 0; r[ST.dk] = [Math.max(prev, Math.min(ST.i, tot)), tot]; }
  r.ms = (r.ms || 0) + (silent ? 0 : Date.now() - ST.t0); if (!silent) ST.t0 = Date.now();
  r.last = Date.now(); save(); queueSync();
}
function drawDone() {
  recordProgress(); const el = document.getElementById('study'); const tot = ST.idx.length; const pct = Math.round(100 * ST.yes / tot);
  const all = ST.daily && allDone(todayKey());
  el.innerHTML = `<div class="topbar"><button class="iconbtn" id="xq">${I.x}</button></div>
    <div class="finish"><div class="emoji">${pct >= 80 ? '🎐' : pct >= 50 ? '✨' : '💪'}</div>
    <h2 class="jp">${pct >= 80 ? 'よくできました！' : pct >= 50 ? 'いいですね！' : 'がんばって！'}</h2>
    <p>${ST.yes} hafal · ${ST.no} belum hafal dari ${tot} kartu</p>
    ${all ? '<p style="color:var(--green);font-weight:800">Semua tugas hari ini selesai! 🔥</p>' : ''}
    <div style="display:grid;gap:10px;width:100%;max-width:360px">
      ${ST.missed.length ? `<button class="btn primary" id="again">Ulangi ${ST.missed.length} yang belum hafal</button>` : ''}
      <button class="btn ${ST.missed.length ? 'ghost' : 'primary'}" id="fin">Selesai</button></div></div>`;
  confetti(pct >= 50 || all);
  document.getElementById('xq').onclick = document.getElementById('fin').onclick = () => { queueSync(true); closeStudy(); };
  const ag = document.getElementById('again'); if (ag) ag.onclick = () => { const m = ST.missed.slice(); const { lv, dk, title } = ST; el.remove(); ST = null; startStudy(lv, dk, shuffle(m), { title }); };
}
function confetti(big) {
  if (!big) return; const c = document.createElement('div'); c.className = 'confetti';
  const cols = ['#0aa39c', '#40d2c6', '#087f86', '#9be8df', '#ffffff', '#1596bf'];
  for (let i = 0; i < 70; i++) { const p = document.createElement('i'); p.style.left = Math.random() * 100 + 'vw'; p.style.background = cols[i % cols.length]; p.style.animationDuration = 1.8 + Math.random() * 1.8 + 's'; p.style.animationDelay = Math.random() * .4 + 's'; p.style.transform = `rotate(${Math.random() * 360}deg)`; c.appendChild(p); }
  document.body.appendChild(c); setTimeout(() => c.remove(), 4200);
}
document.addEventListener('keydown', e => {
  if (!ST || !document.getElementById('fc')) return;
  if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); document.getElementById('bf').click(); }
  if (e.key === 'ArrowRight') answer(true); if (e.key === 'ArrowLeft') answer(false);
});

/* ---------- admin ---------- */
let AD = null, adQ = '', adDay = todayKey();
function adminPass() { try { return sessionStorage.getItem('mna.admin') || ''; } catch { return ''; } }
async function renderAdmin() {
  const pass = adminPass();
  if (!pass) {
    $app.innerHTML = `<div class="hero"><div class="appicon">愛</div><h1 class="appname">管理者</h1><p class="romaji">ADMIN · SENSEI</p>
      <form class="card formcard" id="al"><label class="field"><span>Password admin</span><input class="input" type="password" name="p" required autocomplete="current-password"></label>
      <div class="err" id="err"></div><button class="btn primary">Masuk</button></form><a class="link" href="#">← Kembali ke aplikasi siswa</a><p class="credit"><span>作</span>サルマン・アルヒダムカラ<small>Salman Alhidamkara</small></p></div>`;
    document.getElementById('al').onsubmit = async e => { e.preventDefault(); const p = new FormData(e.target).get('p');
      try { await api('admin', null, { 'x-admin-pass': p }); sessionStorage.setItem('mna.admin', p); renderAdmin(); } catch (err) { document.getElementById('err').textContent = err.message === 'unauthorized' ? 'Password salah.' : err.message; } };
    return;
  }
  if (!AD) { $app.innerHTML = '<div class="spin"></div>'; try { AD = await api('admin', null, { 'x-admin-pass': pass }); } catch (e) { sessionStorage.removeItem('mna.admin'); return renderAdmin(); } }
  const cfg = AD.config?.daily || CONFIG.daily;
  const st = AD.students.map(s => { const d = (s.days || {})[adDay] || {}; const done = ['k', 'j', 'b'].filter(k => d[k] && d[k][1] > 0 && d[k][0] >= d[k][1]); return { ...s, d, done }; })
    .filter(s => !adQ || (s.name + ' ' + s.email).toLowerCase().includes(adQ)).sort((a, b) => b.done.length - a.done.length || (b.lastSeen || 0) - (a.lastSeen || 0));
  const all = AD.students.length; const active = AD.students.filter(s => (s.days || {})[adDay] && s.days[adDay].n).length;
  const full = AD.students.filter(s => { const d = (s.days || {})[adDay] || {}; return ['k', 'j', 'b'].every(k => d[k] && d[k][1] > 0 && d[k][0] >= d[k][1]); }).length;
  const isToday = adDay === todayKey();
  $app.innerHTML = `<div class="screen" style="padding-bottom:40px">
    <div class="row"><h1 class="largeTitle" style="flex:1">Monitoring</h1><button class="iconbtn" id="cfg" aria-label="Pengaturan">${I.gear}</button><button class="iconbtn" id="lo" aria-label="Keluar">${I.x}</button></div>
    <div class="row" style="margin:0 0 16px"><button class="iconbtn" id="pd">‹</button><div style="flex:1;text-align:center;font-weight:700">${isToday ? 'Hari ini · ' : ''}${new Date(adDay + 'T12:00:00').toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' })}</div><button class="iconbtn" id="nd" ${isToday ? 'disabled style="opacity:.3"' : ''}>›</button></div>
    <div class="tiles"><div class="card tile"><b>${all}</b><small>Siswa terdaftar</small></div><div class="card tile"><b style="color:var(--accent)">${active}</b><small>Belajar ${isToday ? 'hari ini' : ''}</small></div><div class="card tile"><b style="color:var(--green)">${full}</b><small>Tugas lengkap</small></div></div>
    <div class="section">Siswa · target ${cfg.k} kotoba, ${cfg.j} kanji, ${cfg.b} pola/hari</div>
    <input class="search" id="q" placeholder="Cari nama atau email" value="${esc(adQ)}">
    <div class="card list">${st.length ? st.map(s => `<button class="li" data-sid="${esc(s.id)}"><div class="avatar" style="width:40px;height:40px;font-size:15px">${esc((s.name || '?')[0].toUpperCase())}</div>
      <div style="flex:1;min-width:0"><div class="tt">${esc(s.name)}</div><div class="ts" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(s.level || '')} · ${s.lastSeen ? 'aktif ' + ago(s.lastSeen) : 'belum aktif'}</div></div>
      <div class="dots">${['k', 'j', 'b'].map(k => `<span class="dot ${s.done.includes(k) ? 'on' : ''}" title="${DECKS[k].name}">${DECKS[k].ico}</span>`).join('')}</div></button>`).join('') : '<div class="empty">Belum ada siswa yang cocok.</div>'}</div>
    <div class="row" style="margin-top:16px;gap:10px"><button class="btn ghost" id="rf">Muat ulang</button><button class="btn ghost" id="csv">Unduh CSV</button></div>
  </div>`;
  const q = document.getElementById('q'); q.oninput = () => { adQ = q.value.toLowerCase(); const pos = q.selectionStart; renderAdmin().then(() => { const n = document.getElementById('q'); n.focus(); n.setSelectionRange(pos, pos); }); };
  document.getElementById('pd').onclick = () => { adDay = dayShift(adDay, -1); renderAdmin(); };
  document.getElementById('nd').onclick = () => { if (!isToday) { adDay = dayShift(adDay, 1); renderAdmin(); } };
  document.getElementById('rf').onclick = () => { AD = null; renderAdmin(); };
  document.getElementById('lo').onclick = () => { sessionStorage.removeItem('mna.admin'); AD = null; location.hash = ''; };
  document.getElementById('csv').onclick = () => exportCSV();
  document.getElementById('cfg').onclick = () => configSheet(cfg);
  $app.querySelectorAll('[data-sid]').forEach(b => b.onclick = () => studentSheet(AD.students.find(s => s.id === b.dataset.sid)));
}
function ago(t) { const m = Math.round((Date.now() - t) / 60000); if (m < 1) return 'baru saja'; if (m < 60) return m + ' menit lalu'; const h = Math.round(m / 60); if (h < 24) return h + ' jam lalu'; return Math.round(h / 24) + ' hari lalu'; }
function studentSheet(s) {
  if (!s) return; const days = []; for (let i = 13; i >= 0; i--) days.push(dayShift(todayKey(), -i));
  let stk = 0; { let k = todayKey(); const full = d => { const r = (s.days || {})[d] || {}; return ['k', 'j', 'b'].every(x => r[x] && r[x][1] > 0 && r[x][0] >= r[x][1]); }; if (!full(k)) k = dayShift(k, -1); while (full(k)) { stk++; k = dayShift(k, -1); } }
  const lv = s.level || 'A1'; const m = (s.mastered || {})[lv] || {}; const tot = (s.totals || {})[lv] || TOTALS[lv] || {};
  const bg = document.createElement('div'); bg.className = 'sheetBg';
  bg.innerHTML = `<div class="sheet"><div class="grab"></div><div class="row"><div class="avatar">${esc((s.name || '?')[0].toUpperCase())}</div><div style="min-width:0"><h3>${esc(s.name)}</h3><div class="sub" style="margin:0">${esc(s.email)}</div></div></div>
    <div class="stats3"><div><b>🔥 ${stk}</b><small>Streak</small></div><div><b>${Object.values(s.days || {}).filter(d => d.n).length}</b><small>Hari aktif</small></div><div><b>${esc(lv)}</b><small>Level</small></div></div>
    <div class="section" style="margin-left:2px">Aktivitas 14 hari</div>
    <div class="heat">${days.map(d => { const r = (s.days || {})[d] || {}; const c = ['k', 'j', 'b'].filter(x => r[x] && r[x][1] > 0 && r[x][0] >= r[x][1]).length; return `<i class="${c ? 'l' + c : ''}" title="${d}: ${r.n || 0} kartu"></i>`; }).join('')}</div>
    <div class="sub" style="font-size:12px;margin:0 2px">Semakin pekat = semakin banyak tugas harian selesai</div>
    <div class="section" style="margin-left:2px">Kartu hafal (${esc(lv)})</div>
    ${['k', 'j', 'b'].map(k => `<div class="optrow"><span>${DECKS[k].name}</span><b>${m[k] || 0} / ${tot[k] || '–'}</b></div>`).join('')}
    <div class="section" style="margin-left:2px">Riwayat</div>
    ${days.slice().reverse().filter(d => (s.days || {})[d]).slice(0, 10).map(d => { const r = s.days[d]; return `<div class="optrow"><span>${new Date(d + 'T12:00:00').toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' })}</span><span style="color:var(--ink2);font-size:14px">${r.n || 0} kartu · ${Math.round((r.ms || 0) / 60000)} mnt · ${['k', 'j', 'b'].map(k => (r[k] && r[k][0] >= r[k][1] && r[k][1] ? '✓' : '·') + DECKS[k].ico).join(' ')}</span></div>`; }).join('') || '<div class="empty">Belum ada aktivitas.</div>'}
    <button class="btn ghost" style="margin-top:14px" data-close>Tutup</button>
    <button class="btn ghost" style="margin-top:10px;color:#e5484d" data-del>Hapus siswa ini</button></div>`;
  document.body.appendChild(bg); bg.onclick = async e => {
    if (e.target === bg || e.target.closest('[data-close]')) return bg.remove();
    if (e.target.closest('[data-del]') && confirm('Hapus ' + (s.name || 'siswa') + ' beserta semua progresnya?')) {
      try { await api('admin', { action: 'delete', id: s.id }, { 'x-admin-pass': adminPass() }); bg.remove(); AD = null; toast('Siswa dihapus'); renderAdmin(); } catch (err) { toast(err.message); }
    }
  };
}
function configSheet(cfg) {
  const bg = document.createElement('div'); bg.className = 'sheetBg';
  bg.innerHTML = `<form class="sheet" id="cf"><div class="grab"></div><h3>Target Harian</h3><p class="sub">Jumlah kartu yang wajib diselesaikan siswa setiap hari.</p>
    ${['k', 'j', 'b'].map(k => `<label class="field"><span>${DECKS[k].name}</span><input class="input" type="number" min="1" max="500" name="${k}" value="${cfg[k]}"></label>`).join('')}
    <div class="err" id="cerr"></div><button class="btn primary">Simpan</button><button type="button" class="btn ghost" style="margin-top:10px" data-close>Batal</button></form>`;
  document.body.appendChild(bg); bg.onclick = e => { if (e.target === bg || e.target.closest('[data-close]')) bg.remove(); };
  bg.querySelector('#cf').onsubmit = async e => { e.preventDefault(); const f = new FormData(e.target); const daily = { k: +f.get('k'), j: +f.get('j'), b: +f.get('b') };
    try { await api('config', { daily }, { 'x-admin-pass': adminPass() }); AD.config = { daily }; CONFIG = { daily }; bg.remove(); toast('Target harian disimpan'); renderAdmin(); } catch (err) { bg.querySelector('#cerr').textContent = err.message; } };
}
function exportCSV() {
  const days = []; for (let i = 13; i >= 0; i--) days.push(dayShift(todayKey(), -i));
  const rows = [['Nama', 'Email', 'Level', 'Terakhir aktif', ...days]];
  for (const s of AD.students) rows.push([s.name, s.email, s.level, s.lastSeen ? new Date(s.lastSeen).toLocaleString('id-ID') : '', ...days.map(d => { const r = (s.days || {})[d]; if (!r) return ''; return ['k', 'j', 'b'].filter(k => r[k] && r[k][1] && r[k][0] >= r[k][1]).length + '/3 (' + (r.n || 0) + ' kartu)'; })]);
  const csv = rows.map(r => r.map(v => '"' + String(v ?? '').replace(/"/g, '""') + '"').join(',')).join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' })); a.download = 'monitoring-siswa-' + todayKey() + '.csv'; a.click();
}

/* ---------- boot ---------- */
render();
if (S.user) queueSync();
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('/sw.js').catch(() => {});
})();
