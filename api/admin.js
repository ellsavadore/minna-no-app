const L = require('./_lib');
module.exports = async (req, res) => {
  if (!L.isAdmin(req)) return L.send(res, 401, { error: 'unauthorized' });
  try {
    const [docs, config] = await Promise.all([L.listJSON('students/'), L.readJSON('config.json')]);
    const students = docs.map(({ token, ...s }) => s);
    return L.send(res, 200, { students, config: config || L.DEFAULT_CONFIG, now: Date.now() });
  } catch (e) { console.error(e); return L.send(res, 500, { error: 'Gagal memuat data siswa.' }); }
};
