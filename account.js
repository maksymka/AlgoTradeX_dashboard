/**
 * Vercel Serverless — Binance Futures account proxy
 * GET /api/account?bot=alpha|beta|all
 *
 * Env (Vercel → Settings → Environment Variables):
 *   BINANCE_API_KEY_ALPHA, BINANCE_API_SECRET_ALPHA
 *   BINANCE_API_KEY_BETA,  BINANCE_API_SECRET_BETA
 *   (або один набір: BINANCE_API_KEY + BINANCE_API_SECRET)
 *   ALLOWED_ORIGIN (optional) e.g. https://algotradex.ai
 */

const crypto = require('crypto');

const FAPI = 'https://fapi.binance.com';

function cors(origin, allowed) {
  let allow = '*';
  if (allowed && allowed !== '*') {
    const list = allowed.split(',').map((s) => s.trim()).filter(Boolean);
    if (origin && list.includes(origin)) allow = origin;
    else allow = list[0] || '*';
  } else if (origin) {
    allow = origin;
  }
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  };
}

function sign(query, secret) {
  return crypto.createHmac('sha256', secret).update(query).digest('hex');
}

async function signedGet(path, params, apiKey, apiSecret) {
  const timestamp = Date.now();
  const qs = new URLSearchParams({
    ...params,
    timestamp: String(timestamp),
    recvWindow: '5000',
  }).toString();
  const signature = sign(qs, apiSecret);
  const url = `${FAPI}${path}?${qs}&signature=${signature}`;
  const res = await fetch(url, {
    headers: { 'X-MBX-APIKEY': apiKey },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.msg || res.statusText || 'Binance error');
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function creds(bot) {
  if (bot === 'alpha') {
    return {
      key: process.env.BINANCE_API_KEY_ALPHA || process.env.BINANCE_API_KEY,
      secret: process.env.BINANCE_API_SECRET_ALPHA || process.env.BINANCE_API_SECRET,
    };
  }
  if (bot === 'beta') {
    return {
      key: process.env.BINANCE_API_KEY_BETA || process.env.BINANCE_API_KEY,
      secret: process.env.BINANCE_API_SECRET_BETA || process.env.BINANCE_API_SECRET,
    };
  }
  return {};
}

async function loadBot(bot) {
  const { key, secret } = creds(bot);
  if (!key || !secret) {
    return { bot, error: 'API keys not configured for ' + bot };
  }

  const [account, positions] = await Promise.all([
    signedGet('/fapi/v2/account', {}, key, secret),
    signedGet('/fapi/v2/positionRisk', {}, key, secret),
  ]);

  const assets = (account.assets || []).filter(
    (a) => parseFloat(a.walletBalance) !== 0 || parseFloat(a.unrealizedProfit) !== 0
  );

  const usdt =
    assets.find((a) => a.asset === 'USDT') || {
      walletBalance: parseFloat(account.totalWalletBalance || 0),
      unrealizedProfit: parseFloat(account.totalUnrealizedProfit || 0),
      marginBalance: parseFloat(account.totalMarginBalance || 0),
      availableBalance: parseFloat(account.availableBalance || 0),
    };

  const openPositions = (positions || [])
    .filter((p) => parseFloat(p.positionAmt) !== 0)
    .map((p) => {
      const amt = parseFloat(p.positionAmt);
      return {
        symbol: p.symbol,
        side: amt > 0 ? 'LONG' : 'SHORT',
        positionAmt: amt,
        entryPrice: parseFloat(p.entryPrice),
        markPrice: parseFloat(p.markPrice),
        unRealizedProfit: parseFloat(p.unRealizedProfit),
        leverage: parseFloat(p.leverage),
        liquidationPrice: parseFloat(p.liquidationPrice),
        marginType: p.marginType,
        notional: Math.abs(parseFloat(p.notional || 0)),
      };
    });

  return {
    bot,
    balance: parseFloat(usdt.marginBalance ?? usdt.walletBalance) || 0,
    walletBalance: parseFloat(usdt.walletBalance) || 0,
    unrealizedPnl: parseFloat(usdt.unrealizedProfit) || 0,
    availableBalance: parseFloat(usdt.availableBalance) || 0,
    positions: openPositions,
    updatedAt: new Date().toISOString(),
  };
}

module.exports = async function handler(req, res) {
  const origin = req.headers.origin || '';
  const allowed = process.env.ALLOWED_ORIGIN || '*';
  const headers = cors(origin, allowed);

  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const bot = String((req.query && req.query.bot) || 'all').toLowerCase();

    if (bot === 'all') {
      const [alpha, beta] = await Promise.all([loadBot('alpha'), loadBot('beta')]);
      return res.status(200).json({ alpha, beta });
    }
    if (bot === 'alpha' || bot === 'beta') {
      const data = await loadBot(bot);
      return res.status(200).json(data);
    }
    return res.status(400).json({ error: 'bot must be alpha|beta|all' });
  } catch (e) {
    return res.status(e.status || 500).json({
      error: e.message || 'Failed',
      details: e.data || null,
    });
  }
};
