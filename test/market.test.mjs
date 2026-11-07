import assert from 'node:assert/strict';
import { createMarket } from '../src/market.js';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('ok', name); };
const m = createMarket({ startBalance: 5_000_000_000 });
const L = m.lots.get('diesel');
L.bots = []; // isolate from simulated buyers

t('valid order gets a receipt and reserves funds', () => {
  const r = m.submit({ lotId: 'diesel', buyer: 'u1', name: 'Test', qty: 10, maxPrice: 14_300_000, idemKey: 'k1' });
  assert.equal(r.ok, true);
  assert.equal(r.receipt.reserved, 10 * 14_300_000 + Math.ceil(10 * 14_300_000 / 1000));
  assert.equal(m.state('u1').wallet.reserved, r.receipt.reserved);
});
t('idempotency key returns the same receipt, no duplicate order', () => {
  const r = m.submit({ lotId: 'diesel', buyer: 'u1', qty: 99, maxPrice: 14_300_000, idemKey: 'k1' });
  assert.equal(r.receipt.version, 1);
  assert.equal(L.orders.get('u1').qty, 10);
});
t('off-tick price is rejected with a reason', () => {
  const r = m.submit({ lotId: 'diesel', buyer: 'u2', qty: 5, maxPrice: 14_300_001 });
  assert.equal(r.ok, false); assert.match(r.reason, /qadam/);
});
t('insufficient funds rejected; shared across lots', () => {
  const r = m.submit({ lotId: 'ai92', buyer: 'u1', qty: 400, maxPrice: 16_000_000 });
  assert.equal(r.ok, false); assert.match(r.reason, /Mablag/);
});
t('replacement supersedes previous version', () => {
  const r = m.submit({ lotId: 'diesel', buyer: 'u1', qty: 20, maxPrice: 14_400_000 });
  assert.equal(r.receipt.version, 2); assert.equal(r.receipt.replaced, true);
});
t('close: clears, settles, releases unused reservation, verify passes', () => {
  m.submit({ lotId: 'diesel', buyer: 'u3', name: 'B', qty: 200, maxPrice: 14_200_000 });
  const before = m.state('u1').wallet.balance;
  m._close(L);
  const last = L.last;
  assert.equal(last.result.price, 14_200_000);
  const me = last.settle.find((s) => s.buyer === 'u1');
  assert.equal(me.x, 20);
  assert.equal(m.state('u1').wallet.balance, before - me.debit);
  assert.ok(me.released > 0, 'paid less than limit -> money released');
  const v = m.verify('diesel');
  assert.deepEqual([v.seedMatches, v.recordIntact, v.sameResult], [true, true, true]);
});
t('orders rejected after close', () => {
  assert.equal(m.submit({ lotId: 'diesel', buyer: 'u1', qty: 1, maxPrice: 14_200_000 }).ok, false);
});
t('agent suggestion respects budget and tick', () => {
  const s = m.suggest({ lotId: 'diesel', need: 50, urgency: 'high', budget: 300_000_000 });
  assert.equal(s.maxPrice % 10_000, 0);
  assert.ok(s.qty * s.maxPrice <= 300_000_000);
});
console.log(`\n${n} tests passed`);
