const L = require('./_lib');
module.exports = async (req, res) => {
  if (!L.isAdmin(req)) return L.send(res, 401, { error: 'unauthorized' });
  if (req.method === 'DELETE' || (req.method === 'POST' && L.body(req).action === 'delete')) {
    const id = String((req.query && req.query.id) || L.body(req).id || '');
    if (!/^[a-f0-9]{32}$/.test(id)) return L.send(res, 400, { error: 'id' });
    try {
      const st = await L.readJSON(`students/${id}.json`);
      if (st && st.email) await L.removeJSON(`emails/${L.hkey(st.email)}.json`);
      await L.removeJSON(`students/${id}.json`);
      return L.send(res, 200, { ok: true });
    } catch (e) { console.error(e); return L.send(res, 500, { error: 'Gagal menghapus.' }); }
  }
  try {
    const [docs, config] = await Promise.all([L.listJSON('students/'), L.readJSON('config.json')]);
    const students = docs.map(({ token, ...s }) => s);
    return L.send(res, 200, { students, config: config ? { mode: config.mode || 'level', daily: config.daily || L.DEFAULT_CONFIG.daily } : L.DEFAULT_CONFIG, now: Date.now() });
  } catch (e) { console.error(e); return L.send(res, 500, { error: 'Gagal memuat data siswa.' }); }
};
