exports.dashboard = async (req, res) => {
  // simple stub — extend with DB queries for real stats
  res.json({ ok: true, stats: { users: 0, likes: 0, messages: 0 } });
};
