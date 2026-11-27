const L = require('./_lib');
module.exports = async (req, res) => {
  try {
    if (req.method === 'POST') {
      if (!L.isAdmin(req)) return L.send(res, 401, { error: 'unauthorized' });
      const d = (L.body(req).daily) || {};
      const n = v => Math.max(1, Math.min(500, Math.round(Number(v) || 0)));
      const cfg = { daily: { k: n(d.k), j: n(d.j), b: n(d.b) } };
      await L.writeJSON('config.json', cfg);
      return L.send(res, 200, cfg);
    }
    const cfg = await L.readJSON('config.json');
    return L.send(res, 200, cfg || L.DEFAULT_CONFIG);
  } catch (e) { console.error(e); return L.send(res, 200, L.DEFAULT_CONFIG); }
};
