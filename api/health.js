const L = require('./_lib');
// quick check that storage works: GET /api/health
module.exports = async (req, res) => {
  try {
    await L.readJSON('config.json');
    return L.send(res, 200, { ok: true, storage: L.USE_REDIS ? 'redis' : 'blob' });
  } catch (e) { return L.send(res, 503, { ok: false, storage: L.USE_REDIS ? 'redis' : 'blob', error: L.storageError(e) }); }
};
