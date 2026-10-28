/** In-memory latest snapshots; optional POST to Supabase if configured */
import { getStrategy, listStrategiesPublic } from './store.js';
import * as binance from './binance.js';
import * as bybit from './bybit.js';

const latest = {}; // id -> account snapshot
const fundingLog = []; // ring buffer

export function getLatest(id) {
  if (id === 'all') return { ...latest };
  return latest[id] || null;
}

export function getFundingLog(limit = 100) {
  return fundingLog.slice(-limit);
}

async function pullOne(id) {
  const s = getStrategy(id);
  if (!s || !s.enabled || !s.apiKey || !s.apiSecret) {
    latest[id] = { error: 'not configured', updatedAt: new Date().toISOString() };
    return latest[id];
  }
  try {
    let data;
    if (s.exchange === 'bybit') data = await bybit.fetchAccount(s.apiKey, s.apiSecret);
    else data = await binance.fetchAccount(s.apiKey, s.apiSecret);

    // attach public funding rates for open symbols
    try {
      const syms = data.positions.map(p => p.symbol);
      const prem = await binance.publicPremium(syms);
      const map = Object.fromEntries(prem.map(x => [x.symbol, x]));
      data.positions = data.positions.map(p => ({
        ...p,
        lastFundingRate: map[p.symbol]?.lastFundingRate ?? null,
        nextFundingTime: map[p.symbol]?.nextFundingTime ?? null,
      }));
    } catch (_) {}

    data.strategy = id;
    data.exchange = s.exchange;
    latest[id] = data;

    if (s.exchange === 'binance') {
      try {
        const inc = await binance.fetchFundingIncome(s.apiKey, s.apiSecret, { limit: 20 });
        for (const row of inc) {
          fundingLog.push({ strategy: id, ...row });
        }
        while (fundingLog.length > 500) fundingLog.shift();
      } catch (_) {}
    }

    await pushSupabase(id, data);
    return data;
  } catch (e) {
    latest[id] = { error: e.message, updatedAt: new Date().toISOString() };
    return latest[id];
  }
}

async function pushSupabase(strategy, data) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key || data.error) return;
  try {
    await fetch(`${url.replace(/\/$/, '')}/rest/v1/position_snapshots`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: key,
        Authorization: `Bearer ${key}`,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        strategy,
        balance: data.balance,
        unrealized_pnl: data.unrealizedPnl,
        positions: data.positions,
        taken_at: data.updatedAt,
      }),
    });
  } catch (e) {
    console.warn('supabase snapshot', e.message);
  }
}

export async function syncAll() {
  const ids = listStrategiesPublic().filter(s => s.enabled).map(s => s.id);
  const results = {};
  for (const id of ids) {
    results[id] = await pullOne(id);
  }
  return results;
}

export function startCron(ms = 60_000) {
  const tick = () => syncAll().catch(e => console.warn('sync', e.message));
  tick();
  return setInterval(tick, ms);
}
