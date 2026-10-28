import crypto from 'crypto';
import fetch from 'node-fetch';

const BASE = process.env.BINANCE_FAPI || 'https://fapi.binance.com';

function sign(query, secret) {
  return crypto.createHmac('sha256', secret).update(query).digest('hex');
}

async function signedGet(path, params, apiKey, apiSecret) {
  const q = new URLSearchParams({ ...params, timestamp: Date.now(), recvWindow: 10000 });
  const qs = q.toString();
  const signature = sign(qs, apiSecret);
  const url = `${BASE}${path}?${qs}&signature=${signature}`;
  const res = await fetch(url, { headers: { 'X-MBX-APIKEY': apiKey } });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok) {
    const err = new Error(data.msg || data.message || `HTTP ${res.status}`);
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

export async function testKeys(apiKey, apiSecret) {
  await signedGet('/fapi/v2/account', {}, apiKey, apiSecret);
  return { ok: true };
}

export async function fetchAccount(apiKey, apiSecret) {
  const acc = await signedGet('/fapi/v2/account', {}, apiKey, apiSecret);
  const positionsRaw = await signedGet('/fapi/v2/positionRisk', {}, apiKey, apiSecret);
  const balance = parseFloat(acc.totalWalletBalance || acc.availableBalance || 0);
  const unrealizedPnl = parseFloat(acc.totalUnrealizedProfit || 0);
  const positions = (positionsRaw || [])
    .filter(p => Math.abs(parseFloat(p.positionAmt || 0)) > 0)
    .map(p => {
      const amt = parseFloat(p.positionAmt);
      const mark = parseFloat(p.markPrice);
      const entry = parseFloat(p.entryPrice);
      const liq = parseFloat(p.liquidationPrice || 0);
      const upnl = parseFloat(p.unRealizedProfit || 0);
      const notional = Math.abs(amt * mark);
      const liqDistancePct = liq > 0 && mark > 0
        ? Math.abs(mark - liq) / mark * 100
        : null;
      return {
        symbol: p.symbol,
        side: amt > 0 ? 'LONG' : 'SHORT',
        positionAmt: amt,
        entryPrice: entry,
        markPrice: mark,
        liquidationPrice: liq,
        liqDistancePct,
        unRealizedProfit: upnl,
        notional,
        leverage: parseFloat(p.leverage || 0),
      };
    });
  return {
    balance,
    unrealizedPnl,
    positions,
    updatedAt: new Date().toISOString(),
  };
}

export async function fetchFundingIncome(apiKey, apiSecret, { limit = 50 } = {}) {
  const rows = await signedGet('/fapi/v1/income', { incomeType: 'FUNDING_FEE', limit }, apiKey, apiSecret);
  return (rows || []).map(r => ({
    symbol: r.symbol,
    income: parseFloat(r.income),
    time: new Date(r.time).toISOString(),
    tranId: r.tranId,
  }));
}

export async function publicPremium(symbols = []) {
  const res = await fetch(`${BASE}/fapi/v1/premiumIndex`);
  const data = await res.json();
  if (!Array.isArray(data)) return [];
  const set = new Set(symbols);
  return data
    .filter(x => !set.size || set.has(x.symbol))
    .map(x => ({
      symbol: x.symbol,
      markPrice: parseFloat(x.markPrice),
      lastFundingRate: parseFloat(x.lastFundingRate),
      nextFundingTime: x.nextFundingTime,
    }));
}
