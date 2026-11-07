// Sealed batch auction with a common price — clearing engine, spec v0.1.
// Integers only: quantities in whole trading units, prices in integer so'm per unit.
// Pro-rata uses exact integer division (numerator U*q, common denominator QC).

export const RULE_VERSION = 'aniq-batch-0.1';

// Deterministic PRNG (mulberry32) seeded from a recorded seed string — used ONLY for exact remainder ties.
function seededOrder(seed, ids) {
  let h = 2166136261 >>> 0;
  for (const c of String(seed)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  let a = h;
  const rand = () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const arr = [...ids].sort(); // independent of arrival order
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return new Map(arr.map((id, k) => [id, k]));
}

/**
 * Validate one order against lot terms. Returns null if valid, else a reason string.
 */
export function validateOrder(lot, o) {
  if (!o || typeof o.buyer !== 'string' || !o.buyer) return 'Xaridor aniqlanmagan';
  if (!Number.isInteger(o.qty) || o.qty <= 0) return 'Hajm butun musbat son bo\'lishi kerak';
  if (o.qty > lot.supply * 10) return 'Hajm juda katta';
  if (!Number.isInteger(o.maxPrice) || o.maxPrice < 0) return 'Narx noto\'g\'ri';
  if (o.maxPrice % lot.tick !== 0) return `Narx ${lot.tick} so'm qadamiga karrali bo'lishi kerak`;
  return null;
}

/**
 * clear(lot, orders, seed)
 * lot: { supply M (units), reserve R (so'm/unit), tick }
 * orders: [{ id, buyer, qty, maxPrice }] — the frozen valid set, one per economic buyer.
 * Returns { traded, price|null, alloc: {buyer: units}, eligibleDemand, cutoff, higher, steps }
 */
export function clear(lot, orders, seed) {
  const M = lot.supply, R = lot.reserve;
  const alloc = Object.fromEntries(orders.map((o) => [o.buyer, 0]));
  const eligible = orders.filter((o) => o.maxPrice >= R);
  const D = eligible.reduce((s, o) => s + o.qty, 0);
  const base = { eligibleDemand: D, supply: M, reserve: R, ruleVersion: RULE_VERSION };

  if (M === 0 || D === 0) return { ...base, kind: 'no-trade', traded: 0, price: null, alloc, cutoff: [], higher: [] };

  if (D <= M) {
    for (const o of eligible) alloc[o.buyer] = o.qty;
    return { ...base, kind: 'under', traded: D, price: R, alloc, cutoff: [], higher: eligible.map((o) => o.buyer), unsold: M - D };
  }

  // D > M: find p* by cumulative quantity over price levels, highest first. No time ordering anywhere.
  const levels = [...new Set(eligible.map((o) => o.maxPrice))].sort((a, b) => b - a);
  let cum = 0, pStar = null;
  for (const p of levels) {
    const atP = eligible.filter((o) => o.maxPrice === p).reduce((s, o) => s + o.qty, 0);
    if (cum < M && cum + atP >= M) { pStar = p; break; }
    cum += atP;
  }
  const higher = eligible.filter((o) => o.maxPrice > pStar);
  const cutoff = eligible.filter((o) => o.maxPrice === pStar);
  for (const o of higher) alloc[o.buyer] = o.qty;
  const QH = higher.reduce((s, o) => s + o.qty, 0);
  const U = M - QH;
  const QC = cutoff.reduce((s, o) => s + o.qty, 0);

  // Largest remainder with exact integers: ideal = U*q/QC ; floor = div ; remainder numerator = mod (same denominator QC).
  const rem = [];
  let given = 0;
  for (const o of cutoff) {
    const num = U * o.qty;
    const fl = Math.floor(num / QC);
    alloc[o.buyer] = fl; given += fl;
    rem.push({ buyer: o.buyer, r: num % QC });
  }
  let J = U - given;
  const lottery = seededOrder(seed, cutoff.map((o) => o.buyer));
  rem.sort((a, b) => b.r - a.r || lottery.get(a.buyer) - lottery.get(b.buyer));
  for (let k = 0; k < J; k++) alloc[rem[k].buyer] += 1;

  return { ...base, kind: 'over', traded: M, price: pStar, alloc, cutoff: cutoff.map((o) => o.buyer), higher: higher.map((o) => o.buyer), unsold: 0 };
}

/** Invariants from spec §9. Throws on violation. */
export function checkInvariants(lot, orders, res) {
  const byBuyer = Object.fromEntries(orders.map((o) => [o.buyer, o]));
  let sum = 0;
  for (const [b, x] of Object.entries(res.alloc)) {
    const o = byBuyer[b];
    if (!Number.isInteger(x) || x < 0 || x > o.qty) throw new Error(`alloc out of range for ${b}`);
    if (x > 0 && !(res.price >= lot.reserve && res.price <= o.maxPrice)) throw new Error(`price limit violated for ${b}`);
    sum += x;
  }
  const D = orders.filter((o) => o.maxPrice >= lot.reserve).reduce((s, o) => s + o.qty, 0);
  if (sum !== Math.min(lot.supply, D)) throw new Error('traded != min(M, D)');
  if (res.traded !== sum) throw new Error('traded mismatch');
  return true;
}

/** Fees: published demo schedule — 0.1% of commodity payment, rounded up to whole so'm. */
export const fee = (commodity) => Math.ceil(commodity / 1000);
export const reserveFor = (lot, o) => lot.unit * o.qty * o.maxPrice + fee(lot.unit * o.qty * o.maxPrice);
