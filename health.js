/**
 * GET /api/health
 */
module.exports = async function handler(req, res) {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || origin || '*');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    return res.status(204).end();
  }

  return res.status(200).json({
    ok: true,
    hasAlpha: !!(process.env.BINANCE_API_KEY_ALPHA || process.env.BINANCE_API_KEY),
    hasBeta: !!(process.env.BINANCE_API_KEY_BETA || process.env.BINANCE_API_KEY),
    time: new Date().toISOString(),
  });
};
