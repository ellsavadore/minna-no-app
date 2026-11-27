const L = require('./_lib');
module.exports = async (req, res) => {
  if (req.method !== 'POST') return L.send(res, 405, { error: 'method' });
  const b = L.body(req);
  const name = L.clip(b.name, 60), email = L.clip(b.email, 120).toLowerCase();
  const level = ['A1', 'A2.1', 'A2.2'].includes(b.level) ? b.level : 'A1';
  if (name.length < 2) return L.send(res, 400, { error: 'Nama minimal 2 huruf.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return L.send(res, 400, { error: 'Format email belum benar.' });
  try {
    const idxPath = `emails/${L.hkey(email)}.json`;
    const idx = await L.readJSON(idxPath);
    if (idx && idx.id) {
      const st = await L.readJSON(`students/${idx.id}.json`);
      if (st) return L.send(res, 200, { id: st.id, token: st.token, name: st.name, level: st.level, existing: true, days: st.days || {} });
    }
    const id = L.rid(), token = L.rid(), now = Date.now();
    const st = { id, token, name, email, level, createdAt: now, lastSeen: now, days: {}, mastered: {}, totals: {} };
    await L.writeJSON(`students/${id}.json`, st);
    await L.writeJSON(idxPath, { id });
    return L.send(res, 200, { id, token, name, level, existing: false });
  } catch (e) {
    console.error(e); return L.send(res, 500, { error: 'Server sedang sibuk, coba lagi sebentar.' });
  }
};
