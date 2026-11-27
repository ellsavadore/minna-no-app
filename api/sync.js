const L = require('./_lib');
module.exports = async (req, res) => {
  if (req.method !== 'POST') return L.send(res, 405, { error: 'method' });
  const b = L.body(req);
  if (!/^[a-f0-9]{32}$/.test(b.id || '')) return L.send(res, 400, { error: 'id' });
  try {
    const st = await L.readJSON(`students/${b.id}.json`);
    if (!st || st.token !== b.token) return L.send(res, 403, { error: 'token' });
    st.days = L.mergeDays(st.days, b.days && typeof b.days === 'object' ? b.days : {});
    if (['A1', 'A2.1', 'A2.2'].includes(b.level)) st.level = b.level;
    if (b.mastered && typeof b.mastered === 'object') st.mastered = b.mastered;
    if (b.totals && typeof b.totals === 'object') st.totals = { ...(st.totals || {}), ...b.totals };
    st.lastSeen = Date.now();
    await L.writeJSON(`students/${b.id}.json`, st);
    return L.send(res, 200, { ok: true });
  } catch (e) { console.error(e); return L.send(res, 500, { error: 'sync' }); }
};
