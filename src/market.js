import { createHash, randomBytes } from 'node:crypto';
import { clear, checkInvariants, validateOrder, reserveFor, fee, RULE_VERSION } from './engine.js';

const sha = (s) => createHash('sha256').update(s).digest('hex');
const now = () => Date.now();

// Demo lots. All prices so'm per tonne, invented for the demo.
import { readFileSync } from 'node:fs';
// Real market facts from the organizers' UZEX dataset (500 000 deals, 2022–2026), built by scripts/build_real.py.
export const DATA = JSON.parse(readFileSync(new URL('./data/market.json', import.meta.url)));
export const CATEGORIES = { oil: 'Neft mahsulotlari', gas: 'Gaz', build: 'Qurilish', metal: 'Metall', food: 'Oziq-ovqat' };
const META = {
  diesel: { code: 'DT', grade: 'DT-E-K5', tick: 10_000, delivery: 'Ombordan olib ketish · 10 kun' },
  ai92: { code: 'AI', grade: 'AI-92', tick: 10_000, delivery: 'Ombordan olib ketish · 7 kun' },
  gas: { code: 'SG', grade: 'PBA (propan-butan)', tick: 10_000, delivery: 'Temir yo\'l, FCA · 5 kun' },
  cement: { code: 'SM', grade: 'CEM II/B-K 32,5N', tick: 1_000, delivery: 'Zavoddan olib ketish · 14 kun' },
  rebar: { code: 'AR', grade: 'A500C, Ø12 mm', tick: 10_000, delivery: 'Ombordan olib ketish · 10 kun' },
  wheat: { code: 'BG', grade: 'Oziq-ovqat, 4-sinf', tick: 10_000, delivery: 'Elevatordan olib ketish · 10 kun' },
  sugar: { code: 'SH', grade: 'Oq shakar', tick: 10_000, delivery: 'Ombordan olib ketish · 7 kun' },
};
const r2 = (v, t) => Math.round(v / t) * t;
export const LOT_TERMS = Object.entries(DATA.products).map(([id, p]) => {
  const m = META[id];
  const lotSize = id === 'cement' ? 400 : id === 'wheat' ? 600 : Math.max(40, r2(p.lot * 5, 10));
  return { id, cat: p.cat, code: m.code, icon: m.code, product: p.name, grade: m.grade, depot: p.sellers[0]?.region || '—', seller: p.sellers[0]?.name || '—', sellerInn: p.sellers[0]?.inn,
    supply: lotSize, reserve: r2(p.p50 * 0.97, m.tick), tick: m.tick, unit: 1, delivery: m.delivery, ref: { p10: p.p10, p50: p.p50, p90: p.p90, deals: p.deals } };
});

const BOT_NAMES = ['Namangan Qurilish', 'Andijon Agro Trans', 'Buxoro Avto Servis', 'Samarqand Non', 'Xorazm Logistika', 'Qo\'qon Un Kombinati', 'Termiz Energiya', 'Navoiy Beton', 'Chirchiq Transport', 'Guliston Fermer'];
const BOT_WHY = ['Ombor zaxirasi 4 kunga yetadi', 'Haftalik ehtiyoj', 'Narx oshishidan oldin zaxira', 'Shartnoma bo\'yicha yetkazish', 'Mavsumiy talab', 'Minimal zaxira'];

export function createMarket({ openMs = 60_000, revealMs = 25_000, startBalance = 20_000_000_000, rng = Math.random } = {}) {
  const lots = new Map();
  const wallets = new Map(); // buyer -> { name, balance }
  const idem = new Map();
  const phones = new Map(); // buyer -> phone (for result calls)
  const listeners = [];
  const results = []; // global results register, newest last
  const myResults = new Map(); // buyer -> [{...}]

  const wallet = (buyer, name) => {
    if (!wallets.has(buyer)) wallets.set(buyer, { name: name || 'Siz', balance: startBalance });
    if (name) wallets.get(buyer).name = name;
    return wallets.get(buyer);
  };
  const reservedOf = (buyer, exceptLot) => {
    let s = 0;
    for (const L of lots.values()) if (L.phase === 'open' && L.id !== exceptLot && L.orders.has(buyer)) s += L.orders.get(buyer).reserved;
    return s;
  };

  function openRound(terms, t0 = now(), offset = 0) {
    const prev = lots.get(terms.id);
    const seed = randomBytes(16).toString('hex');
    const L = {
      ...terms, round: (prev?.round ?? 0) + 1, phase: 'open', opensAt: t0, closesAt: t0 + openMs + offset,
      seed, seedHash: sha(seed), orders: new Map(), history: prev?.history ?? seedHistory(terms), last: prev?.last ?? null, bots: [],
    };
    lots.set(terms.id, L);
    scheduleBots(L);
    return L;
  }

  // Real daily history from the dataset (median price per tonne, traded volume, deal count).
  function seedHistory(terms) {
    const p = DATA.products[terms.id];
    const h = p.daily.map((x, i) => ({ round: `R${i}`, date: x.d, price: r2(x.p, terms.tick), traded: Math.round(x.v), demand: Math.round(x.v), supply: Math.round(x.v), buyers: x.n, at: Date.parse(x.d + 'T12:00:00+05:00'), src: 'reyestr' }));
    for (const e of h.slice(-15)) results.push({ lot: terms.id, product: terms.product, icon: terms.code, ...e });
    return h;
  }

  function scheduleBots(L) {
    const k = 4 + Math.floor(rng() * 4);
    const names = [...BOT_NAMES].sort(() => rng() - 0.5).slice(0, k);
    const targetDemand = L.supply * (1.15 + rng() * 0.7);
    const span = L.closesAt - L.opensAt;
    L.bots = names.map((name, i) => {
      const qty = Math.max(1, Math.round((targetDemand / k) * (0.5 + rng())));
      const maxPrice = r2(L.reserve * (0.99 + rng() * rng() * 0.08), L.tick); // a few just below reserve, most near the market median
      const late = i === 0; // one bot always submits in the last 2 seconds — same treatment
      const at = L.opensAt + (late ? span - 1500 - rng() * 500 : span * (0.05 + rng() * 0.8));
      return { buyer: 'bot:' + name, name, qty, maxPrice: Math.max(0, maxPrice - (maxPrice % L.tick)), at, why: BOT_WHY[Math.floor(rng() * BOT_WHY.length)], done: false };
    });
  }

  function submit({ lotId, buyer, name, qty, maxPrice, idemKey, via = 'web' }) {
    if (idemKey && idem.has(idemKey)) return idem.get(idemKey);
    const L = lots.get(lotId);
    const fail = (reason) => ({ ok: false, reason });
    if (!L) return fail('Lot topilmadi');
    if (L.phase !== 'open' || now() >= L.closesAt) return fail('Oyna yopilgan — keyingi raundni kuting');
    const o = { buyer, qty, maxPrice };
    const bad = validateOrder(L, o);
    if (bad) return fail(bad);
    const w = wallet(buyer, name);
    const need = reserveFor(L, o);
    const avail = w.balance - reservedOf(buyer, L.id);
    if (need > avail) return fail(`Mablag' yetarli emas: kerak ${need.toLocaleString('ru-RU')} so'm`);
    const prev = L.orders.get(buyer);
    const order = { id: `${L.id}-${L.round}-${sha(buyer).slice(0, 6)}-v${(prev?.version ?? 0) + 1}`, buyer, name: w.name, qty, maxPrice, version: (prev?.version ?? 0) + 1, reserved: need, via, acceptedAt: now() };
    L.orders.set(buyer, order);
    const receipt = { ok: true, receipt: { orderId: order.id, lot: L.id, round: L.round, version: order.version, reserved: need, acceptedAt: order.acceptedAt, commit: sha(`${order.id}|${qty}|${maxPrice}`), replaced: !!prev } };
    if (idemKey) idem.set(idemKey, receipt);
    return receipt;
  }

  function cancel({ lotId, buyer }) {
    const L = lots.get(lotId);
    if (!L || L.phase !== 'open' || now() >= L.closesAt) return { ok: false, reason: 'Bekor qilib bo\'lmaydi — oyna yopilgan' };
    return { ok: L.orders.delete(buyer) };
  }

  function closeRound(L) {
    const frozen = [...L.orders.values()].map(({ buyer, name, qty, maxPrice, id, via }) => ({ id, buyer, name, qty, maxPrice, via })).sort((a, b) => a.buyer.localeCompare(b.buyer));
    const res = clear(L, frozen, L.seed);
    checkInvariants(L, frozen, res);
    const settle = frozen.map((o) => {
      const x = res.alloc[o.buyer];
      const commodity = x > 0 ? res.price * L.unit * x : 0;
      const f = x > 0 ? fee(commodity) : 0;
      const reserved = L.orders.get(o.buyer).reserved;
      if (!o.buyer.startsWith('bot:')) wallet(o.buyer).balance -= commodity + f;
      return { buyer: o.buyer, name: o.name, qty: o.qty, maxPrice: o.maxPrice, x, commodity, fee: f, debit: commodity + f, released: reserved - commodity - f, via: o.via };
    });
    const record = { lot: L.id, round: L.round, terms: { supply: L.supply, reserve: L.reserve, tick: L.tick, unit: L.unit, product: L.product, depot: L.depot }, ruleVersion: RULE_VERSION, seed: L.seed, seedHash: L.seedHash, frozen, result: { kind: res.kind, price: res.price, traded: res.traded, alloc: res.alloc, cutoff: res.cutoff }, closedAt: L.closesAt };
    record.recordHash = sha(JSON.stringify(record));
    L.phase = 'revealed';
    L.revealUntil = now() + revealMs;
    L.last = { ...record, settle, eligibleDemand: res.eligibleDemand, unsold: res.unsold ?? 0 };
    const entry = { round: L.round, price: res.price, traded: res.traded, demand: res.eligibleDemand, supply: L.supply, buyers: frozen.length, at: L.closesAt, recordHash: record.recordHash };
    L.history = [...L.history, entry].slice(-20);
    results.push({ lot: L.id, product: L.product, icon: L.code, ...entry, src: 'live' });
    if (results.length > 300) results.splice(0, results.length - 300);
    for (const st of settle) {
      if (st.buyer.startsWith('bot:')) continue;
      const list = myResults.get(st.buyer) || [];
      list.push({ lot: L.id, product: L.product, icon: L.code, round: L.round, at: L.closesAt, qty: st.qty, maxPrice: st.maxPrice, x: st.x, price: res.price, debit: st.debit, released: st.released, via: st.via });
      myResults.set(st.buyer, list.slice(-50));
    }
    for (const fn of listeners) try { fn(L, settle); } catch {}
  }

  function tick() {
    const t = now();
    for (const L of lots.values()) {
      if (L.phase === 'open') {
        for (const b of L.bots) if (!b.done && t >= b.at && t < L.closesAt) { b.done = true; submit({ lotId: L.id, buyer: b.buyer, name: b.name, qty: b.qty, maxPrice: b.maxPrice, via: 'agent' }); }
        if (t >= L.closesAt) closeRound(L);
      } else if (L.phase === 'revealed' && t >= L.revealUntil) {
        openRound(L, t);
      }
    }
  }

  function verify(lotId) {
    const L = lots.get(lotId);
    const rec = L?.last;
    if (!rec) return { ok: false, reason: 'Hali natija yo\'q' };
    const { recordHash, settle, eligibleDemand, unsold, ...body } = rec;
    const shuffled = [...rec.frozen].sort(() => Math.random() - 0.5);
    const again = clear({ ...rec.terms }, shuffled, rec.seed);
    const same = again.price === rec.result.price && Object.keys(rec.result.alloc).every((b) => again.alloc[b] === rec.result.alloc[b]);
    return {
      ok: true, seedMatches: sha(rec.seed) === rec.seedHash, recordIntact: sha(JSON.stringify(body)) === recordHash, sameResult: same,
      shuffledOrder: shuffled.map((o) => o.name), price: again.price, recordHash,
    };
  }

  // Agent purchasing advice: rule-based, uses only public history + the buyer's own need.
  function suggest({ lotId, need, urgency = 'normal', budget }) {
    const L = lots.get(lotId);
    if (!L) return { ok: false, reason: 'Lot topilmadi' };
    const prices = L.history.map((h) => h.price).filter((p) => p != null);
    const r = (p) => Math.max(L.reserve, p - (p % L.tick));
    const med = prices.length ? [...prices].sort((a, b) => a - b)[Math.floor(prices.length / 2)] : L.reserve;
    const hi = prices.length ? [...prices].sort((a, b) => a - b)[Math.floor(prices.length * 0.9)] : L.reserve;
    let maxPrice = urgency === 'low' ? L.reserve : urgency === 'high' ? r(hi + L.tick * Math.max(1, Math.round(L.reserve / L.tick / 200))) : r(med);
    let qty = Math.max(1, Math.min(Math.round(need || L.supply / 5), L.supply));
    const reasons = [];
    reasons.push(prices.length ? `Reyestr: oxirgi ${prices.length} savdo kunida narx ${fmt(Math.min(...prices))} – ${fmt(Math.max(...prices))}` : 'Hali tarix yo\'q — minimal narxdan boshlaymiz');
    reasons.push(urgency === 'low' ? 'Tejamkor: minimal narx — olmasangiz keyingi raund bor' : urgency === 'high' ? 'Ishonchli: tarixiy narxlarning yuqori 10% darajasi' : 'Odatiy: oxirgi savdo kunlari mediani');
    if (budget && L.unit * qty * maxPrice > budget) {
      qty = Math.max(1, Math.floor(budget / (L.unit * maxPrice * 1.001)));
      reasons.push(`Byudjetga sig'ishi uchun hajm ${qty} t gacha kamaytirildi`);
    }
    reasons.push('Hamma g\'oliblar bir xil narx to\'laydi — chegaradan kam to\'lashingiz mumkin');
    return { ok: true, qty, maxPrice, reasons };
  }

  function publicLot(L, viewer) {
    const mine = viewer ? L.orders.get(viewer) : null;
    const out = {
      id: L.id, cat: L.cat, code: L.code, ref: L.ref, product: L.product, grade: L.grade, depot: L.depot, seller: L.seller, delivery: L.delivery, icon: L.icon, supply: L.supply, reserve: L.reserve, tick: L.tick, unit: L.unit,
      round: L.round, phase: L.phase, opensAt: L.opensAt, closesAt: L.closesAt, revealUntil: L.revealUntil ?? null, seedHash: L.seedHash,
      sealed: L.orders.size, history: L.history,
      mine: mine ? { qty: mine.qty, maxPrice: mine.maxPrice, version: mine.version, reserved: mine.reserved } : null,
    };
    if (L.last) {
      out.last = {
        round: L.last.round, price: L.last.result.price, traded: L.last.result.traded, kind: L.last.result.kind, demand: L.last.eligibleDemand, unsold: L.last.unsold,
        cutoff: L.last.result.cutoff.length, recordHash: L.last.recordHash, seed: L.last.seed, seedHash: L.last.seedHash,
        bids: L.last.settle.map((s) => ({ name: s.name, me: s.buyer === viewer, qty: s.qty, maxPrice: s.maxPrice, x: s.x, debit: s.debit, released: s.released, via: s.via, cutoff: L.last.result.cutoff.includes(s.buyer) }))
          .sort((a, b) => b.maxPrice - a.maxPrice || a.name.localeCompare(b.name)),
      };
    }
    return out;
  }

  function state(viewer) {
    const w = viewer ? wallet(viewer) : null;
    const dayAgo = now() - 24 * 3600_000;
    const recent = results.filter((r) => r.at >= dayAgo);
    const live = results.filter((r) => r.src === 'live');
    const market = { data: DATA.global, liveRounds: live.length, liveTonnes: live.reduce((s, r) => s + r.traded, 0),
      turnover: recent.reduce((s, r) => s + (r.price || 0) * r.traded, 0),
      tonnes: recent.reduce((s, r) => s + r.traded, 0),
      rounds: recent.length,
      bids: recent.reduce((s, r) => s + r.buyers, 0),
      sold: recent.length ? recent.reduce((s, r) => s + r.traded, 0) / recent.reduce((s, r) => s + r.supply, 0) : 0,
    };
    return {
      now: now(), rule: RULE_VERSION, categories: CATEGORIES, market,
      lots: [...lots.values()].map((L) => publicLot(L, viewer)),
      results: [...results].sort((a, b) => b.at - a.at).slice(0, 60),
      wallet: w ? { name: w.name, balance: w.balance, reserved: reservedOf(viewer) } : null,
      mine: viewer ? (myResults.get(viewer) || []).slice().reverse() : [],
    };
  }

  LOT_TERMS.forEach((terms, i) => openRound(terms, now(), i * 9_000));
  return { tick, submit, cancel, state, verify, suggest, wallet, phones, onClose: (fn) => listeners.push(fn), lots, _close: closeRound };
}

export const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('ru-RU').replace(/ /g, ' '));
