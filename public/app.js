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
const IN_APP = /MinnaFukushuApp/.test(navigator.userAgent);
const APK_URL = '/minna-no-fukushu.apk';
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
async function api(path, body, headers = {}, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch('/api/' + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined });
      const j = await r.json().catch(() => ({}));
      if (r.ok) return j;
      last = new Error(j.error || ('HTTP ' + r.status));
      // only retry when the server says it may help (busy / network), never on bad input
      if (!(r.status >= 500 || r.status === 429) || j.retry === false) throw last;
    } catch (e) {
      last = e;
      if (!(e instanceof TypeError) && !/HTTP 5|sibuk|^sync$/i.test(e.message)) throw e;
    }
    if (i < tries - 1) await new Promise(res => setTimeout(res, 800 * Math.pow(2, i)));
  }
  throw last;
}
let CONFIG = { mode: 'level', daily: { k: 20, j: 10, b: 5 } };
const fullLevel = () => (CONFIG.mode || 'level') === 'level';
try { const cc = JSON.parse(localStorage.getItem('mna.cfg')); if (cc && cc.daily) CONFIG = cc; } catch {}
api('config').then(c => { if (c && c.daily) { c.mode = c.mode || 'level'; const changed = JSON.stringify(c.daily) !== JSON.stringify(CONFIG.daily) || c.mode !== CONFIG.mode; CONFIG = c; try { localStorage.setItem('mna.cfg', JSON.stringify(c)); } catch {} if (changed && route === 'home') render(); } }).catch(() => {});

let syncTimer;
function queueSync(now) { if (now) { clearTimeout(syncTimer); syncTimer = setTimeout(sync, 10); } else if (!syncTimer) syncTimer = setTimeout(sync, 30000); }
async function sync() {
  clearTimeout(syncTimer); syncTimer = null;
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
  const cfg = CONFIG.daily; const cfgKey = (CONFIG.mode || 'level') + JSON.stringify(cfg);
  if (S.daily.key === key && S.daily.cfg === cfgKey) return S.daily.sets;
  const d = DATA[lv]; const sets = {};
  if (fullLevel()) { for (const dk of ['k', 'j', 'b']) sets[dk] = [...Array(d[dk].length).keys()]; S.daily = { key, sets, cfg: cfgKey }; save(); return sets; }
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
  S.daily = { key, sets, cfg: cfgKey }; save();
  return sets;
}
const ROT_START = '2026-11-28'; // hari ini A1, besok A2.1, lusa A2.2, lalu kembali ke A1
function dayLevel(k = todayKey()) { const d = Math.round((new Date(k + 'T12:00:00') - new Date(ROT_START + 'T12:00:00')) / 86400000); return LEVELS[((d % 3) + 3) % 3]; }
const MOTTO = '<span><ruby>頑張<rt>がんば</rt></ruby>ってね！</span><br><span>みんなのご<ruby>飯<rt>はん</rt></ruby>が、</span><span>いつも<ruby>温<rt>あたた</rt></ruby>かくありますように。</span>';
const mottoHTML = (cls = '') => `<div class="motto ${cls}"><p class="mjp" lang="ja">${MOTTO}</p><p class="mid">Semangat ya, semoga nasi kalian selalu hangat.</p></div>`;
function dayRec(k = todayKey()) { return (S.days[k] ||= {}); }
const LV_TOTAL = { 'A1': { k: 1294, j: 90, b: 71 }, 'A2.1': { k: 1193, j: 182, b: 78 }, 'A2.2': { k: 1789, j: 177, b: 79 } };
// Target of a day: every card of that day's level (or the admin's fixed counts in 'count' mode)
function dayTarget(d, cfg = CONFIG) { const T = LV_TOTAL[dayLevel(d)]; if ((cfg.mode || 'level') === 'level') return T; const c = cfg.daily || {}; return { k: Math.min(c.k || 0, T.k), j: Math.min(c.j || 0, T.j), b: Math.min(c.b || 0, T.b) }; }
function lvPct(r, d, cfg) { const T = dayTarget(d, cfg); let a = 0, t = 0; for (const k of ['k', 'j', 'b']) { t += T[k]; a += Math.min(r && r[k] ? Number(r[k][0]) || 0 : 0, T[k]); } return t ? Math.floor(100 * a / t) : 0; }
function lvFull(r, d, cfg) { const T = dayTarget(d, cfg); return ['k', 'j', 'b'].every(k => r && r[k] && (Number(r[k][0]) || 0) >= T[k]); }
function taskDone(dk, k = todayKey()) { const r = S.days[k]; return !!(r && r[dk] && r[dk][0] >= dayTarget(k)[dk]); }
function streak() { let n = 0; let k = todayKey(); if (!allDone(k)) k = dayShift(k, -1); while (allDone(k)) { n++; k = dayShift(k, -1); } return n; }
function allDone(k) { return ['k', 'j', 'b'].every(dk => taskDone(dk, k)); }
function anyDone(k) { const r = S.days[k]; return !!(r && (r.n || 0) > 0); }

/* ---------- icons ---------- */
const I = {
  undo: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>',
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
  if (!text) return;
  if (window.AndroidTTS) { try { AndroidTTS.speak(String(text).replace(/[～〜~]/g, '').replace(/（[^）]*）|\([^)]*\)/g, '')); } catch {} return; }
  if (!('speechSynthesis' in window)) return;
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
  const lv = route === 'home' ? dayLevel() : S.user.level;
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
    ${mottoHTML('small')}
    <form class="card formcard" id="reg" autocomplete="on">
      <label class="field"><span>Nama lengkap</span><input class="input" name="name" required maxlength="60" placeholder="Nama kamu" autocomplete="name"></label>
      <label class="field"><span>Email</span><input class="input" name="email" type="email" required maxlength="120" placeholder="nama@email.com" autocomplete="email" inputmode="email"></label>
      <div class="field"><span>Level belajar</span><div class="seg" id="lv">${LEVELS.map(l => `<button type="button" data-l="${l}" class="${l === lv ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <div class="err" id="err"></div>
      <button class="btn primary" type="submit">Daftar &amp; Mulai Belajar</button>
    </form>
    <p class="sub" style="text-align:center;margin:0 10px">Sudah pernah daftar? Isi nama &amp; email yang sama untuk masuk kembali.</p>
    <a class="link" href="#admin">Masuk sebagai Admin</a>
    <p class="credit"><span>作</span>サルマン・アルヒダムカラ<small>Salman Alhidamkara</small></p>${IN_APP ? '' : `<a class="apklink" href="${APK_URL}" download="minna-no-fukushu.apk">⬇ Unduh aplikasi Android (APK)</a>`}
  </div>`;
  const seg = document.getElementById('lv');
  seg.onclick = e => { const b = e.target.closest('button'); if (!b) return; lv = b.dataset.l; seg.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); };
  document.getElementById('reg').onsubmit = async e => {
    e.preventDefault(); const f = new FormData(e.target); const btn = e.target.querySelector('.btn');
    const name = String(f.get('name')).trim(), email = String(f.get('email')).trim().toLowerCase();
    if (name.length < 2) return document.getElementById('err').textContent = 'Nama minimal 2 huruf.';
    btn.disabled = true; btn.textContent = 'Menyimpan… (mohon tunggu)'; document.getElementById('err').textContent = '';
    try {
      const r = await api('register', { name, email, level: lv });
      S.user = { id: r.id, token: r.token, name: r.name || name, email, level: r.existing && r.level ? r.level : lv };
      if (r.days) for (const d in r.days) S.days[d] ||= r.days[d];
      save(); toast(r.existing ? 'おかえり, ' + S.user.name + '!' : 'ようこそ! Pendaftaran berhasil'); go('home');
    } catch (err) { document.getElementById('err').textContent = err instanceof TypeError ? 'Koneksi internet terputus. Cek sinyal/Wi-Fi lalu coba lagi.' : err.message; btn.disabled = false; btn.textContent = 'Daftar & Mulai Belajar'; }
  };
}

/* ---------- home ---------- */
function greetWord() { const h = new Date().getHours(); return h < 11 ? 'おはよう' : h < 18 ? 'こんにちは' : 'こんばんは'; }
function todayParts(lv) { const sets = dailySet(lv), rec = dayRec(); return ['k', 'j', 'b'].map(dk => { const tot = sets[dk].length; const done = Math.min(rec[dk] ? rec[dk][0] : 0, tot); return { dk, tot, done }; }); }
function renderHome() {
  const lv = dayLevel(); const sets = dailySet(lv); const rec = dayRec();
  const parts = todayParts(lv);
  const pct = parts.every(p => p.tot && p.done >= p.tot) ? 100 : 0;
  const st = streak(); const sumTot = parts.reduce((a, p) => a + p.tot, 0), sumDone = parts.reduce((a, p) => a + p.done, 0); const allPct = sumTot ? Math.floor(100 * sumDone / sumTot) : 0; const left = sumTot - sumDone;
  const mins = Math.ceil(left * 5 / 60); const eta = mins >= 60 ? (mins / 60).toFixed(1).replace('.', ',') + ' jam' : mins + ' mnt';
  const days = []; for (let i = 6; i >= 0; i--) days.push(dayShift(todayKey(), -i));
  const dn = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
  $app.innerHTML = `<div class="screen">
    <div class="greet"><div class="avatar">${esc(S.user.name[0].toUpperCase())}</div>
      <div><div class="hi jp">${greetWord()},</div><div class="nm">${esc(S.user.name.split(' ')[0])}</div></div><div class="spacer"></div>
      <div class="streak">🔥 ${st}</div></div>
    <div class="mission">
      <div class="mtop"><span class="mlabel">${fullLevel() ? 'Misi Hari Ini' : 'Target Hari Ini'}</span><span class="rot">${[0, 1, 2].map(i => { const l = dayLevel(dayShift(todayKey(), i)); return `<span class="${i ? '' : 'on'}">${i ? (i === 1 ? 'Besok ' : 'Lusa ') : ''}${l}</span>`; }).join('')}</span></div>
      <h2>${pct >= 100 ? 'お疲れさまでした！' : fullLevel() ? 'Tamatkan ' + esc(lv) + ' hari ini' : 'Fukushu hari ini'}</h2>
      <p>${pct >= 100 ? 'Semua kotoba, kanji, dan pola ' + esc(lv) + ' sudah selesai. すごい！' : fullLevel() ? 'Selesaikan semua kotoba, kanji, dan pola kalimat ' + esc(LEVEL_NAME[lv]) + '.' : 'Selesaikan Kotoba, Kanji, dan Pola Kalimat untuk menjaga streak.'}</p>
      <div class="mbar"><i style="width:${allPct}%"></i></div>
      <div class="mstats"><div><b>${allPct}%</b><small>selesai</small></div><div><b>${sumDone.toLocaleString('id-ID')}</b><small>dari ${sumTot.toLocaleString('id-ID')} kartu</small></div><div><b>${left > 0 ? eta : '✓'}</b><small>${left > 0 ? 'perkiraan sisa' : 'tuntas'}</small></div></div>
    </div>
    ${mottoHTML()}
    <div class="section">Tugas Hari Ini · ${esc(lv)}</div>
    ${parts.map(p => { const D = DECKS[p.dk]; const ok = p.tot > 0 && p.done >= p.tot; const pp = p.tot ? Math.round(100 * p.done / p.tot) : 0; return `<button class="card task t2 dk-${p.dk} ${ok ? 'complete' : ''}" data-task="${p.dk}">
      <div class="tico ${D.cls}">${D.ico}</div>
      <div style="flex:1;min-width:0"><div class="tt">${D.name} <span class="jp" style="color:var(--ink3);font-weight:500;font-size:14px">${D.jp}</span></div>
      <div class="ts">${ok ? '<span class="donepill">完了 · Selesai</span> ' + p.tot.toLocaleString('id-ID') + ' kartu' : '<b>' + p.done.toLocaleString('id-ID') + '</b> / ' + p.tot.toLocaleString('id-ID') + ' ' + D.unit + ' · ' + pp + '%'}</div>
      <div class="mini"><i style="width:${pp}%"></i></div>
      ${ok ? '' : `<div class="go">${p.done ? 'Lanjutkan dari kartu ' + (p.done + 1).toLocaleString('id-ID') : 'Mulai'} →</div>`}</div>
      <div class="check ${ok ? 'ok' : ''}">${ok ? I.check : ''}</div></button>`; }).join('')}
    <div class="section">7 Hari Terakhir</div>
    <div class="card week">${days.map(d => { const full = allDone(d), part = anyDone(d); return `<div class="${d === todayKey() ? 'tdy' : ''}"><i class="${full ? 'full' : part ? 'part' : ''}">${full ? '✓' : part ? '•' : ''}</i>${dn[new Date(d + 'T12:00:00').getDay()]}</div>`; }).join('')}</div>
  </div>`;
  $app.querySelectorAll('[data-task]').forEach(b => b.onclick = () => { const dk = b.dataset.task; const p = parts.find(x => x.dk === dk); const from = p.done < p.tot ? p.done : 0;
    startStudy(lv, dk, sets[dk].slice(from), { daily: true, offset: from, total: p.tot, title: 'Tugas ' + DECKS[dk].name + ' ' + lv }); });
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
    <div class="seg" id="lvs" style="margin-bottom:16px">${LEVELS.map(l => `<button data-l="${l}" class="${l === lv ? 'on' : ''}">${l}</button>`).join('')}</div>
    ${(() => { const t = ['k', 'j', 'b'].map(dk => deckStats(lv, dk)); const n = t.reduce((a, x) => a + x.n, 0), m = t.reduce((a, x) => a + x.m, 0); const pc = n ? Math.floor(100 * m / n) : 0;
      return `<div class="lvsum"><div><small>${esc(LEVEL_NAME[lv])}</small><b>${m.toLocaleString('id-ID')} <span>dari ${n.toLocaleString('id-ID')} kartu hafal</span></b></div><div class="lvpct">${pc}%</div><div class="mbar"><i style="width:${pc}%"></i></div></div>`; })()}
    ${['k', 'j', 'b'].map(dk => { const D = DECKS[dk], s = deckStats(lv, dk); const pc = s.n ? Math.floor(100 * s.m / s.n) : 0; return `<button class="card deck dk-${dk}" data-deck="${dk}">
      <div class="row"><div class="tico ${D.cls}">${D.ico}</div><div style="flex:1;min-width:0"><div class="tt">${D.name} <span class="jp djp">${D.jp}</span></div><div class="ts">${s.n.toLocaleString('id-ID')} ${D.unit} · ${pc}% hafal</div></div><span class="chev">${I.chev}</span></div>
      <div class="mini"><i style="width:${s.n ? 100 * s.m / s.n : 0}%"></i></div>
      <div class="stats3"><div><b style="color:var(--green)">${s.m}</b><small>Hafal</small></div><div><b style="color:var(--orange)">${s.l}</b><small>Belum hafal</small></div><div><b>${s.nw}</b><small>Baru</small></div></div>
    </button>`; }).join('')}
  </div>`;
  document.getElementById('lvs').onclick = e => { const b = e.target.closest('button'); if (b) { deckLevel = b.dataset.l; render(); } };
  $app.querySelectorAll('[data-deck]').forEach(b => b.onclick = () => deckSheet(lv, b.dataset.deck));
}
function deckSheet(lv, dk) {
  const D = DECKS[dk], s = deckStats(lv, dk), n = s.n; const ptrKey = lv + '|' + dk + '|free'; const p = S.ptr[ptrKey] || 0;
  const rows = DATA[lv][dk]; const babCount = {}; rows.forEach(x => { babCount[x[3]] = (babCount[x[3]] || 0) + 1; });
  const babs = Object.keys(babCount).sort((a, b) => (parseFloat(a) || 0) - (parseFloat(b) || 0));
  const bg = document.createElement('div'); bg.className = 'sheetBg';
  bg.innerHTML = `<div class="sheet" role="dialog"><div class="grab"></div>
    <div class="row" style="margin-bottom:8px"><div class="tico ${D.cls}">${D.ico}</div><div><h3>${D.name} ${esc(lv)}</h3><div class="sub" style="margin:0">${n} kartu · ${s.m} hafal</div></div></div>
    <div style="display:grid;gap:10px;margin:16px 0">
      <button class="btn primary" data-a="next">Lanjutkan · kartu ${Math.min(p + 1, n)}–${Math.min(p + 20, n)}</button>
      <button class="btn ghost" data-a="weak" ${s.l ? '' : 'disabled'}>Ulangi yang belum hafal (${s.l})</button>
      <button class="btn ghost" data-a="known" ${s.m ? '' : 'disabled'}>Fukushu yang sudah hafal (${s.m})</button>
      <button class="btn ghost" data-a="rand">Acak 20 kartu</button>
      <button class="btn ghost" data-a="all">Semua kartu (${n})</button>
    </div>
    <div class="section" style="margin:6px 2px 8px">Ulangi per Bab</div>
    <div class="babs">${babs.map(b => `<button data-bab="${esc(b)}">Bab ${esc(b)}<small>${babCount[b]}</small></button>`).join('')}</div>
    <div class="optrow">Mulai dari arti (Indonesia → Jepang)<button class="switch ${S.prefs.reverse ? 'on' : ''}" data-p="reverse" aria-label="Balik arah"></button></div>
    <div class="optrow">Ucapkan otomatis (suara Jepang)<button class="switch ${S.prefs.auto ? 'on' : ''}" data-p="auto" aria-label="Suara otomatis"></button></div>
    <button class="btn ghost" data-a="close" style="margin-top:10px">Tutup</button>
    <button class="btn ghost danger" data-a="reset" style="margin-top:6px">Reset progres ${D.name} ${esc(lv)}</button></div>`;
  document.body.appendChild(bg);
  const close = () => bg.remove();
  bg.onclick = e => {
    if (e.target === bg) return close();
    const sw = e.target.closest('[data-p]'); if (sw) { S.prefs[sw.dataset.p] = !S.prefs[sw.dataset.p]; sw.classList.toggle('on'); save(); return; }
    const bb = e.target.closest('[data-bab]');
    if (bb) { const idx = []; rows.forEach((x, i) => { if (String(x[3]) === bb.dataset.bab) idx.push(i); }); close(); return startStudy(lv, dk, idx, { title: `${D.name} · Bab ${bb.dataset.bab}` }); }
    const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return;
    if (a === 'close') return close();
    if (a === 'reset') {
      if (!confirm(`Reset semua progres ${D.name} ${lv}? Semua kartu akan kembali menjadi "Baru".`)) return;
      for (let i = 0; i < n; i++) delete S.cards[lv + '|' + dk + '|' + i];
      delete S.ptr[ptrKey]; delete S.ptr[lv + '|' + dk]; S.daily = {}; save(); queueSync(true); close(); render(); return toast('Progres sudah direset');
    }
    let idx = [];
    if (a === 'next') { for (let i = 0; i < Math.min(20, n); i++) idx.push((p + i) % n); S.ptr[ptrKey] = (p + 20) >= n ? 0 : p + 20; save(); }
    if (a === 'weak') for (let i = 0; i < n; i++) { const c = S.cards[lv + '|' + dk + '|' + i]; if (c && c.s === 0) idx.push(i); }
    if (a === 'known') { for (let i = 0; i < n; i++) { const c = S.cards[lv + '|' + dk + '|' + i]; if (c && c.s === 1) idx.push(i); } shuffle(idx); }
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
    <p class="sub" style="margin:10px 4px 0;font-size:13px">Dipakai di halaman Flashcard. Tugas harian bergilir otomatis tiap hari: A1 → A2.1 → A2.2 → A1 …</p></div>
    <div class="section">Pengaturan Kartu</div>
    <div class="card" style="padding:4px 16px">
      <div class="optrow">Tampilkan cara baca (furigana)<button class="switch ${S.prefs.reading ? 'on' : ''}" data-p="reading"></button></div>
      <div class="optrow">Mulai dari arti (Indonesia → Jepang)<button class="switch ${S.prefs.reverse ? 'on' : ''}" data-p="reverse"></button></div>
      <div class="optrow">Ucapkan otomatis (suara Jepang)<button class="switch ${S.prefs.auto ? 'on' : ''}" data-p="auto"></button></div>
    </div>
    ${IN_APP ? '' : `<a class="card apkcard" href="${APK_URL}" download="minna-no-fukushu.apk"><div class="tico t-k">⬇</div><div style="min-width:0;flex:1"><b>Aplikasi Android</b><small>Unduh APK みんなの復習 untuk HP Android</small></div><span class="chev">›</span></a>`}
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
  ST = { lv, dk, idx, off: opt.offset || 0, all: opt.total || idx.length, i: 0, yes: 0, no: 0, missed: [], hist: [], daily: !!opt.daily, title: opt.title || '', t0: Date.now(), flipped: false };
  const el = document.createElement('div'); el.className = 'study'; el.id = 'study'; document.body.appendChild(el); document.body.style.overflow = 'hidden';
  drawStudy();
}
function closeStudy() { if (window.__mnaPending && window.__mnaPending()) { ST = null; return location.reload(); } document.getElementById('study')?.remove(); document.querySelectorAll('.confetti').forEach(x => x.remove()); document.body.style.overflow = ''; if (window.AndroidTTS) { try { AndroidTTS.stop(); } catch {} } else if ('speechSynthesis' in window) speechSynthesis.cancel(); ST = null; render(); }
function jpSize(t) { const n = [...String(t).replace(/[（(][^）)]*[）)]/g, '')].length; return n <= 2 ? 'xl' : n <= 4 ? 'l' : n <= 7 ? 'm' : n <= 12 ? 's' : 'xs'; }
function patHTML(p) { return esc(p).replace(/(^|[^A-Za-z])(N[12]?|S[12]?|V|イA|ナA)(?![a-z])/g, '$1<b class="sym">$2</b>'); }
function faceHTML(c, side) {
  const rev = S.prefs.reverse; const lesson = `<span class="pill bab">第${esc(c.l)}課 · Bab ${esc(c.l)}</span>`;
  if (c.type === 'b') {
    const ex = c.ex[0];
    const pat = `<div class="pattern" lang="ja">${c.p.split('\n').map(l => `<div>${patHTML(l)}</div>`).join('')}</div>`;
    if (side === 'front' && !rev) return `<div class="cap">文型 · Pola</div>${pat}${ex ? `<div class="exbox"><div class="exjp" lang="ja">${esc(ex[0])}</div></div>` : ''}`;
    if (side === 'front' && rev) return ex ? `<div class="cap">Arti</div><div class="mean xl">${esc(ex[1])}</div><div class="ask">Bagaimana bahasa Jepangnya?</div>` : `<div class="cap">Arti</div><div class="mean">${esc(c.exp.split(' • ')[0])}</div>`;
    return `<div class="cap">文型 · Pola</div>${pat}
      ${c.ex.slice(0, 3).map((e, i) => `<div class="exbox"><span class="exn">例${i + 1}</span><div class="exjp" lang="ja">${esc(e[0])}</div>${e[1] ? `<div class="exid">${esc(e[1])}</div>` : ''}</div>`).join('')}
      ${c.exp ? `<details class="exp"><summary>Penjelasan</summary>${esc(c.exp.split(' • ')[0])}</details>` : ''}<div class="foot">${lesson}</div>`;
  }
  const font = c.type === 'j' ? 'kyokasho' : '';
  if (side === 'front') return rev ? `<div class="cap">Arti</div><div class="mean xl">${esc(c.m)}</div><div class="ask">Bagaimana bahasa Jepangnya?</div>`
    : `<div class="cap">${c.type === 'j' ? '漢字 · Kanji' : '言葉 · Kotoba'}</div><div class="word ${jpSize(c.w)} ${font}" lang="ja">${esc(c.w)}</div>`;
  return `<div class="cap">${c.type === 'j' ? '漢字 · Kanji' : '言葉 · Kotoba'}</div>
    ${S.prefs.reading && c.r ? `<div class="yomi" lang="ja">${esc(c.r)}</div>` : ''}<div class="word ${jpSize(c.w)} ${font}" lang="ja">${esc(c.w)}</div>
    <div class="divider"></div><div class="mean">${esc(c.m)}</div><div class="foot">${lesson}</div>`;
}
function drawStudy() {
  const el = document.getElementById('study'); if (!el || !ST) return;
  const total = ST.idx.length;
  if (ST.i >= total) return drawDone();
  const c = card(ST.lv, ST.dk, ST.idx[ST.i]); ST.flipped = false;
  const D = DECKS[ST.dk];
  el.innerHTML = `<div class="topbar"><button class="iconbtn" id="xq" aria-label="Tutup">${I.x}</button>
      <div class="sthead"><div class="sttitle">${esc(ST.title)}</div><div class="pbar"><i style="width:${100 * (ST.off + ST.i) / ST.all}%"></i></div></div>
      <div class="counter"><b>${ST.off + ST.i + 1}</b>/${ST.all}</div><button class="iconbtn undo" id="bu" aria-label="Undo" ${ST.hist.length ? '' : 'disabled'}>${I.undo}</button></div>
    <div class="tally"><span class="l">✕ ${ST.no}</span><span class="r">✓ ${ST.yes}</span></div>
    <div class="stage"><span class="stamp l">BELUM</span><span class="stamp r">HAFAL</span><div class="fc enter dk-${ST.dk}" id="fc">
      <div class="face"><button class="iconbtn say" data-say aria-label="Dengarkan">${I.spk}</button>
        <div class="side front"><div class="inner">${faceHTML(c, 'front')}</div><div class="hint">Ketuk untuk membalik  ·  ← Belum  ·  Hafal →</div></div>
        <div class="side back"><div class="inner">${faceHTML(c, 'back')}</div></div>
      </div>
    </div></div>
    <div class="actions"><button class="abtn no" id="bn">✕ Belum</button><button class="abtn flipb" id="bf" aria-label="Balik">${I.flip}</button><button class="abtn yes" id="by">✓ Hafal</button></div>`;
  const fc = document.getElementById('fc');
  const sayText = c.type === 'b' ? (c.ex[0] ? c.ex[0][0] : c.p) : (c.r || c.w);
  let turning = false;
  const flip = () => {
    if (turning) return; turning = true; fc.classList.add('turn');
    setTimeout(() => { ST.flipped = !ST.flipped; fc.classList.toggle('flip', ST.flipped); fc.querySelector('.face').scrollTop = 0; fc.classList.remove('turn');
      setTimeout(() => { turning = false; }, 170);
      if (ST.flipped && S.prefs.auto && (S.prefs.reverse || c.type !== 'b')) speak(sayText); }, 160);
  };
  if (S.prefs.auto && !S.prefs.reverse && c.type !== 'b') setTimeout(() => speak(c.type === 'j' ? sayText : c.r || c.w), 250);
  el.querySelectorAll('[data-say]').forEach(b => b.onclick = e => { e.stopPropagation(); speak(sayText); });
  document.getElementById('xq').onclick = () => { if (ST.i > 0) recordProgress(); closeStudy(); };
  document.getElementById('bf').onclick = flip;
  document.getElementById('bu').onclick = undo;
  document.getElementById('bn').onclick = () => { if (!busy) { busy = true; answer(false); } };
  document.getElementById('by').onclick = () => { if (!busy) { busy = true; answer(true); } };
  // swipe (touch + mouse) with direction lock, velocity and stamps
  fc.addEventListener('animationend', () => fc.classList.remove('enter'), { once: true });
  const stL = el.querySelector('.stamp.l'), stR = el.querySelector('.stamp.r');
  let sx = null, sy = 0, dx = 0, dy = 0, lock = null, t0 = 0, busy = false, inUI = false;
  const base = () => '';
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
    if (!lock && Math.hypot(dx, dy) > 8) lock = Math.abs(dx) >= Math.abs(dy) * 0.7 ? 'x' : 'y';
    // a gesture that began as a scroll can still become a swipe once it is clearly sideways (long Pola cards)
    if (lock === 'y' && Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 0.9) lock = 'x';
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
    reset(); if (!lock && !inUI) flip();
  };
  const skip = t => t.closest && t.closest('[data-say]');
  const ui = t => !!(t.closest && t.closest('summary,details[open]'));
  fc.addEventListener('touchstart', e => { if (e.touches.length === 1 && !skip(e.target)) { inUI = ui(e.target); start(e.touches[0].clientX, e.touches[0].clientY); } }, { passive: true });
  fc.addEventListener('touchmove', e => { if (move(e.touches[0].clientX, e.touches[0].clientY) && e.cancelable) e.preventDefault(); }, { passive: false });
  fc.addEventListener('touchend', e => { if (sx === null) return; if (e.cancelable && (lock || !inUI)) e.preventDefault(); end(); }, { passive: false });
  fc.addEventListener('touchcancel', () => { sx = null; reset(); });
  fc.addEventListener('mousedown', e => { if (skip(e.target)) return; inUI = ui(e.target); start(e.clientX, e.clientY); const mm = ev => move(ev.clientX, ev.clientY); const mu = () => { window.removeEventListener('mousemove', mm); window.removeEventListener('mouseup', mu); end(); }; window.addEventListener('mousemove', mm); window.addEventListener('mouseup', mu); });
}
function answer(ok, swiped) {
  if (!ST) return; const fc = document.getElementById('fc'); const i = ST.idx[ST.i];
  const k = ST.lv + '|' + ST.dk + '|' + i; ST.hist.push({ k, prev: S.cards[k] || null, ok }); S.cards[k] = { s: ok ? 1 : 0, t: Date.now() };
  ok ? ST.yes++ : (ST.no++, ST.missed.push(i)); ST.i++;
  const r = dayRec(); r.n = (r.n || 0) + 1; r.c = r.c || {}; r.c[ST.dk] = (r.c[ST.dk] || 0) + 1; save();
  if (ST.daily) recordProgress(true);
  if (navigator.vibrate) navigator.vibrate(ok ? 8 : [6, 40, 6]);
  if (swiped) setTimeout(drawStudy, 240); else if (fc) { fc.style.transform = ''; fc.classList.add(ok ? 'fly-r' : 'fly-l'); setTimeout(drawStudy, 260); } else drawStudy();
}
function undo() {
  if (!ST || !ST.hist.length) return;
  const h = ST.hist.pop(); ST.i--; ST.shown = -1;
  if (h.prev) S.cards[h.k] = h.prev; else delete S.cards[h.k];
  if (h.ok) ST.yes--; else { ST.no--; ST.missed.pop(); }
  const r = dayRec(); r.n = Math.max(0, (r.n || 1) - 1); if (r.c && r.c[ST.dk]) r.c[ST.dk]--;
  if (ST.daily && r[ST.dk]) r[ST.dk][0] = Math.min(r[ST.dk][0], ST.off + ST.i);
  save(); queueSync(); if (navigator.vibrate) navigator.vibrate(5);
  drawStudy(); toast('Kartu sebelumnya dikembalikan');
}
function recordProgress(silent) {
  if (!ST) return; const r = dayRec();
  if (ST.daily) { const tot = ST.all; const prev = r[ST.dk] ? r[ST.dk][0] : 0; r[ST.dk] = [Math.max(prev, Math.min(ST.off + ST.i, tot)), tot];
    const sets = dailySet(ST.lv); for (const dk of ['k', 'j', 'b']) if (!r[dk]) r[dk] = [0, sets[dk].length]; }
  r.ms = (r.ms || 0) + (silent ? 0 : Date.now() - ST.t0); if (!silent) ST.t0 = Date.now();
  r.last = Date.now(); save(); queueSync();
}
function drawDone() {
  if (ST.shown === ST.i) return; ST.shown = ST.i;
  recordProgress(); const el = document.getElementById('study'); const tot = ST.idx.length; const pct = Math.round(100 * ST.yes / tot);
  const all = ST.daily && allDone(todayKey());
  const next = ST.daily && !all ? todayParts(ST.lv).find(p => p.dk !== ST.dk && p.tot && p.done < p.tot) : null;
  const secs = Math.round((Date.now() - ST.t0) / 1000); const dur = secs >= 60 ? Math.round(secs / 60) + ' mnt' : secs + ' dtk';
  const C = 2 * Math.PI * 52;
  el.innerHTML = `<div class="topbar"><button class="iconbtn" id="xq">${I.x}</button><div class="sthead"><div class="sttitle">${esc(ST.title)}</div></div></div>
    <div class="finish">
      <div class="fring"><svg width="132" height="132" viewBox="0 0 132 132"><circle cx="66" cy="66" r="52" stroke="var(--fill)" stroke-width="12" fill="none"/>
        <circle cx="66" cy="66" r="52" stroke="url(#fg)" stroke-width="12" fill="none" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct / 100)}"/>
        <defs><linearGradient id="fg"><stop offset="0" stop-color="#40d2c6"/><stop offset="1" stop-color="#087f86"/></linearGradient></defs></svg><div><b>${pct}%</b><small>hafal</small></div></div>
      <h2 class="jp">${pct >= 80 ? 'よくできました！' : pct >= 50 ? 'いいですね！' : 'がんばって！'}</h2>
      <p>${pct >= 100 ? 'Sempurna, semua kartu sudah hafal.' : pct >= 80 ? 'Hebat, hampir semua sudah hafal.' : pct >= 50 ? 'Bagus, tinggal sedikit lagi.' : 'Tidak apa-apa, ulangi yang belum hafal ya.'}</p>
      <div class="stats3 fstats"><div><b style="color:var(--green)">${ST.yes}</b><small>Hafal</small></div><div><b style="color:var(--orange)">${ST.no}</b><small>Belum hafal</small></div><div><b>${dur}</b><small>Waktu</small></div></div>
      ${all ? '<div class="alldone">🔥 Semua tugas hari ini selesai! Streak bertambah.</div>' : ''}
      ${mottoHTML('small')}
      <div class="factions">
        ${next ? `<button class="btn primary" id="nxt">Lanjut ke ${DECKS[next.dk].name} →</button>` : ''}
        ${ST.missed.length ? `<button class="btn ${next ? 'ghost' : 'primary'}" id="again">Ulangi ${ST.missed.length} yang belum hafal</button>` : ''}
        <button class="btn ${next || ST.missed.length ? 'ghost' : 'primary'}" id="fin">Kembali ke beranda</button>
        <button class="linkbtn" id="undo2">↶ Kembali ke kartu terakhir</button></div></div>`;
  confetti(pct >= 80 || all);
  document.getElementById('xq').onclick = document.getElementById('fin').onclick = () => { queueSync(true); closeStudy(); };
  document.getElementById('undo2').onclick = () => { document.querySelectorAll('.confetti').forEach(x => x.remove()); undo(); };
  const nx = document.getElementById('nxt'); if (nx) nx.onclick = () => { queueSync(true); const lv = ST.lv; closeStudy(); const b = document.querySelector(`[data-task="${next.dk}"]`); if (b) b.click(); };
  const ag = document.getElementById('again'); if (ag) ag.onclick = () => { const m = ST.missed.slice(); const { lv, dk, title } = ST; el.remove(); ST = null; document.querySelectorAll('.confetti').forEach(x => x.remove()); startStudy(lv, dk, shuffle(m), { title }); };
}
function confetti(big) {
  if (!big) return; document.querySelectorAll('.confetti').forEach(x => x.remove()); const c = document.createElement('div'); c.className = 'confetti';
  const cols = ['#0aa39c', '#40d2c6', '#087f86', '#9be8df', '#ffffff', '#1596bf'];
  for (let i = 0; i < 36; i++) { const p = document.createElement('i'); p.style.left = Math.random() * 100 + 'vw'; p.style.background = cols[i % cols.length]; p.style.animationDuration = 1.8 + Math.random() * 1.8 + 's'; p.style.animationDelay = Math.random() * .4 + 's'; p.style.transform = `rotate(${Math.random() * 360}deg)`; c.appendChild(p); }
  document.body.appendChild(c); setTimeout(() => c.remove(), 4200);
}
document.addEventListener('keydown', e => {
  if (!ST || !document.getElementById('fc')) return;
  if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); document.getElementById('bf').click(); }
  if (e.key === 'Backspace' || e.key === 'z') { e.preventDefault(); return undo(); }
  if (e.key === 'ArrowRight') answer(true); if (e.key === 'ArrowLeft') answer(false);
});

/* ---------- admin ---------- */
let AD = null, adQ = '', adDay = todayKey(), adF = 'all';
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
  const wk = []; for (let i = 6; i >= 0; i--) wk.push(dayShift(adDay, -i));
  const AC = AD.config || CONFIG;
  const dayState = (s, d) => { const r = (s.days || {})[d]; if (lvFull(r, d, AC)) return 2; return r && r.n ? 1 : 0; };
  const stAll = AD.students.map(s => { const d = (s.days || {})[adDay] || {}; const pct = lvPct(d, adDay, AC); const fin = lvFull(d, adDay, AC); const did = !!d.n; const week = wk.map(x => dayState(s, x)); return { ...s, d, pct, fin, did, week, wfull: week.filter(x => x === 2).length }; });
  const st = stAll.filter(s => !adQ || (s.name + ' ' + s.email).toLowerCase().includes(adQ)).filter(s => adF === 'all' || (adF === 'yes' ? s.fin : !s.fin))
    .sort((a, b) => b.pct - a.pct || b.wfull - a.wfull || (b.lastSeen || 0) - (a.lastSeen || 0));
  const all = stAll.length; const full = stAll.filter(s => s.fin).length; const prog = stAll.filter(s => !s.fin && s.did).length; const none = all - full - prog;
  const isToday = adDay === todayKey();
  $app.innerHTML = `<div class="screen" style="padding-bottom:40px">
    <div class="row"><h1 class="largeTitle" style="flex:1">Monitoring</h1><button class="iconbtn" id="cfg" aria-label="Pengaturan">${I.gear}</button><button class="iconbtn" id="lo" aria-label="Keluar">${I.x}</button></div>
    <div class="row" style="margin:0 0 16px"><button class="iconbtn" id="pd">‹</button><div style="flex:1;text-align:center;font-weight:700">${isToday ? 'Hari ini · ' : ''}${new Date(adDay + 'T12:00:00').toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' })}</div><button class="iconbtn" id="nd" ${isToday ? 'disabled style="opacity:.3"' : ''}>›</button></div>
    <div class="adlv">Giliran level: <b>${dayLevel(adDay)}</b> · ${(AC.mode || 'level') === 'level' ? `"Sudah fukushu" = tamat semua ${dayLevel(adDay)} (${(() => { const T = LV_TOTAL[dayLevel(adDay)]; return (T.k + T.j + T.b).toLocaleString('id-ID'); })()} kartu)` : `target ${cfg.k} kotoba, ${cfg.j} kanji, ${cfg.b} pola`}</div>
    <div class="tiles"><div class="card tile"><b style="color:var(--green)">${full}</b><small>Sudah fukushu (tamat ${dayLevel(adDay)})</small></div><div class="card tile"><b style="color:var(--amber)">${prog}</b><small>Belum tamat</small></div><div class="card tile"><b style="color:var(--orange)">${none}</b><small>Belum mulai</small></div></div>
    <div class="section">Siswa (${all})</div>
    <div class="seg" id="adf" style="margin-bottom:10px">${[['all', 'Semua'], ['yes', 'Sudah fukushu'], ['no', 'Belum']].map(([k, t]) => `<button data-f="${k}" class="${adF === k ? 'on' : ''}">${t}</button>`).join('')}</div>
    <input class="search" id="q" placeholder="Cari nama atau email" value="${esc(adQ)}">
    <div class="card list">${st.length ? st.map(s => `<button class="li" data-sid="${esc(s.id)}"><div class="avatar" style="width:40px;height:40px;font-size:15px">${esc((s.name || '?')[0].toUpperCase())}</div>
      <div style="flex:1;min-width:0"><div class="tt">${esc(s.name)}</div><div class="ts ${s.fin ? 'okc' : s.did ? 'midc' : 'noc'}">${s.fin ? 'Sudah fukushu · tamat ' + dayLevel(adDay) + ' ✓' : s.did ? 'Belum tamat · ' + dayLevel(adDay) + ' ' + s.pct + '%' : 'Belum mulai fukushu'}</div>
        <div class="wk" title="7 hari terakhir">${s.week.map(x => `<i class="w${x}"></i>`).join('')}<span>tamat ${s.wfull}/7 hari</span></div></div>
      <div class="pct ${s.fin ? 'full' : s.did ? 'part' : ''}">${s.pct}%</div></button>`).join('') : '<div class="empty">Tidak ada siswa di sini.</div>'}</div>
    <p class="sub" style="font-size:12.5px;margin:10px 4px 0">Kotak 7 hari: <i class="lg w2"></i> tamat level · <i class="lg w1"></i> belum tamat · <i class="lg w0"></i> tidak fukushu</p>
    <div class="row" style="margin-top:16px;gap:10px"><button class="btn ghost" id="rf">Muat ulang</button><button class="btn ghost" id="csv">Unduh CSV</button></div>
  </div>`;
  const q = document.getElementById('q'); q.oninput = () => { adQ = q.value.toLowerCase(); const pos = q.selectionStart; renderAdmin().then(() => { const n = document.getElementById('q'); n.focus(); n.setSelectionRange(pos, pos); }); };
  document.getElementById('adf').onclick = e => { const b = e.target.closest('[data-f]'); if (b) { adF = b.dataset.f; renderAdmin(); } };
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
  let stk = 0; { let k = todayKey(); const full = d => lvFull((s.days || {})[d], d, AD.config || CONFIG); if (!full(k)) k = dayShift(k, -1); while (full(k)) { stk++; k = dayShift(k, -1); } }
  const lv = s.level || 'A1'; const m = (s.mastered || {})[lv] || {}; const tot = (s.totals || {})[lv] || TOTALS[lv] || {};
  const bg = document.createElement('div'); bg.className = 'sheetBg';
  bg.innerHTML = `<div class="sheet"><div class="grab"></div><div class="row"><div class="avatar">${esc((s.name || '?')[0].toUpperCase())}</div><div style="min-width:0"><h3>${esc(s.name)}</h3><div class="sub" style="margin:0">${esc(s.email)}</div></div></div>
    <div class="stats3"><div><b>🔥 ${stk}</b><small>Streak</small></div><div><b>${Object.values(s.days || {}).filter(d => d.n).length}</b><small>Hari aktif</small></div><div><b>${esc(lv)}</b><small>Level</small></div></div>
    <div class="section" style="margin-left:2px">Aktivitas 14 hari</div>
    <div class="heat">${days.map(d => { const r = (s.days || {})[d] || {}; const c = lvFull(r, d, AD.config || CONFIG) ? 3 : r.n ? 1 : 0; return `<i class="${c ? 'l' + c : ''}" title="${d} (${dayLevel(d)}): ${lvPct(r, d, AD.config || CONFIG)}%"></i>`; }).join('')}</div>
    <div class="sub" style="font-size:12px;margin:0 2px">Pekat = tamat level hari itu · muda = belum tamat · kosong = tidak fukushu</div>
    <div class="section" style="margin-left:2px">Kartu hafal (${esc(lv)})</div>
    ${['k', 'j', 'b'].map(k => `<div class="optrow"><span>${DECKS[k].name}</span><b>${m[k] || 0} / ${tot[k] || '–'}</b></div>`).join('')}
    <div class="section" style="margin-left:2px">Riwayat</div>
    ${days.slice().reverse().filter(d => (s.days || {})[d]).slice(0, 10).map(d => { const r = s.days[d]; return `<div class="optrow"><span>${new Date(d + 'T12:00:00').toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' })}</span><span style="color:var(--ink2);font-size:14px">${dayLevel(d)} · ${lvFull(r, d, AD.config || CONFIG) ? 'tamat ✓' : lvPct(r, d, AD.config || CONFIG) + '%'} · ${Math.round((r.ms || 0) / 60000)} mnt<br>${(() => { const T = dayTarget(d, AD.config || CONFIG); return ['k', 'j', 'b'].map(k => DECKS[k].ico + ' ' + Math.min(r[k] ? r[k][0] : 0, T[k]) + '/' + T[k]).join('  '); })()}</span></div>`; }).join('') || '<div class="empty">Belum ada aktivitas.</div>'}
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
  const mode = (AD.config && AD.config.mode) || 'level';
  const bg = document.createElement('div'); bg.className = 'sheetBg';
  bg.innerHTML = `<form class="sheet" id="cf"><div class="grab"></div><h3>Target Harian</h3><p class="sub">Apa yang wajib diselesaikan siswa setiap hari.</p>
    <div class="cfgmode">
      <label><input type="radio" name="mode" value="level" ${mode === 'level' ? 'checked' : ''}><span><b>Tamat 1 level per hari</b><small>Semua kotoba, kanji, dan pola kalimat di level siswa (A1, A2.1, atau A2.2).</small></span></label>
      <label><input type="radio" name="mode" value="count" ${mode === 'count' ? 'checked' : ''}><span><b>Jumlah kartu tertentu</b><small>Isi jumlah per kategori di bawah.</small></span></label>
    </div>
    <div id="cnums">${['k', 'j', 'b'].map(k => `<label class="field"><span>${DECKS[k].name}</span><input class="input" type="number" min="1" max="500" name="${k}" value="${cfg[k]}"></label>`).join('')}</div>
    <div class="err" id="cerr"></div><button class="btn primary">Simpan</button><button type="button" class="btn ghost" style="margin-top:10px" data-close>Batal</button></form>`;
  document.body.appendChild(bg); bg.onclick = e => { if (e.target === bg || e.target.closest('[data-close]')) bg.remove(); };
  const nums = bg.querySelector('#cnums'); const sync = () => { nums.style.display = bg.querySelector('input[name=mode]:checked').value === 'count' ? '' : 'none'; };
  bg.querySelectorAll('input[name=mode]').forEach(r => r.onchange = sync); sync();
  bg.querySelector('#cf').onsubmit = async e => { e.preventDefault(); const f = new FormData(e.target); const daily = { k: +f.get('k'), j: +f.get('j'), b: +f.get('b') }; const m = f.get('mode');
    try { const c = await api('config', { mode: m, daily }, { 'x-admin-pass': adminPass() }); AD.config = c; CONFIG = c; bg.remove(); toast('Target harian disimpan'); renderAdmin(); } catch (err) { bg.querySelector('#cerr').textContent = err.message; } };
}
function exportCSV() {
  const days = []; for (let i = 13; i >= 0; i--) days.push(dayShift(todayKey(), -i));
  const rows = [['Nama', 'Email', 'Level', 'Terakhir aktif', ...days]];
  for (const s of AD.students) rows.push([s.name, s.email, s.level, s.lastSeen ? new Date(s.lastSeen).toLocaleString('id-ID') : '', ...days.map(d => { const r = (s.days || {})[d]; if (!r) return ''; return dayLevel(d) + ' ' + (lvFull(r, d, AD.config || CONFIG) ? 'TAMAT' : lvPct(r, d, AD.config || CONFIG) + '%'); })]);
  const csv = rows.map(r => r.map(v => '"' + String(v ?? '').replace(/"/g, '""') + '"').join(',')).join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' })); a.download = 'monitoring-siswa-' + todayKey() + '.csv'; a.click();
}

/* ---------- boot ---------- */
render();
if (S.user) queueSync();
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  // A new version activated: reload once so everyone runs the latest rules (wait if a study session is open)
  let had = !!navigator.serviceWorker.controller, pending = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!had) { had = true; return; } pending = true; if (!ST) location.reload(); });
  document.addEventListener('visibilitychange', () => { if (pending && !ST && document.visibilityState === 'visible') location.reload(); });
  window.__mnaPending = () => pending;
  navigator.serviceWorker.register('/sw.js').then(r => r.update()).catch(() => {});
}
})();
