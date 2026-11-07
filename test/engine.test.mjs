import assert from 'node:assert/strict';
import { clear, checkInvariants } from '../src/engine.js';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('ok', name); };
const lot = (supply, reserve = 100) => ({ supply, reserve, tick: 1, unit: 1 });
const o = (buyer, qty, maxPrice) => ({ buyer, qty, maxPrice });
const run = (L, os, seed = 's') => { const r = clear(L, os, seed); checkInvariants(L, os, r); return r; };

t('Example A: oversubscribed', () => {
  const r = run(lot(100), [o('Ali', 40, 110), o('Bek', 60, 105), o('Davron', 60, 105), o('Elena', 40, 100)]);
  assert.equal(r.price, 105);
  assert.deepEqual(r.alloc, { Ali: 40, Bek: 30, Davron: 30, Elena: 0 });
});
t('Example B: too little demand trades at reserve', () => {
  const r = run(lot(100), [o('A', 30, 110), o('B', 20, 105)]);
  assert.equal(r.price, 100); assert.deepEqual(r.alloc, { A: 30, B: 20 }); assert.equal(r.unsold, 50);
});
t('Example C: all at the same limit', () => {
  const r = run(lot(100), [o('A', 90, 105), o('B', 45, 105), o('C', 15, 105)]);
  assert.equal(r.price, 105); assert.deepEqual(r.alloc, { A: 60, B: 30, C: 10 });
});
t('Example D: lottery for indivisible units, seed-reproducible', () => {
  const os = [o('A', 1, 105), o('B', 1, 105), o('C', 1, 105)];
  const r1 = run(lot(2), os, 'seed-1'), r2 = run(lot(2), [...os].reverse(), 'seed-1');
  assert.deepEqual(r1.alloc, r2.alloc);
  assert.equal(Object.values(r1.alloc).filter((x) => x === 1).length, 2);
});
t('Example E: no eligible orders', () => {
  const r = run(lot(100), [o('A', 10, 90)]);
  assert.equal(r.price, null); assert.equal(r.traded, 0);
});
t('Example F: pricing boundary', () => {
  assert.equal(run(lot(100), [o('A', 100, 110)]).price, 100);
  const r = run(lot(100), [o('A', 100, 110), o('B', 1, 105)]);
  assert.equal(r.price, 110); assert.deepEqual(r.alloc, { A: 100, B: 0 });
});
t('Rounding: 5 units over 4,3,2 -> 2,2,1', () => {
  const r = run(lot(5), [o('X', 4, 105), o('Y', 3, 105), o('Z', 2, 105)]);
  assert.deepEqual(r.alloc, { X: 2, Y: 2, Z: 1 });
});
t('All 24 arrival permutations of Example A give identical results', () => {
  const os = [o('Ali', 40, 110), o('Bek', 60, 105), o('Davron', 60, 105), o('Elena', 40, 100)];
  const perms = (a) => (a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p])));
  const ref = run(lot(100), os).alloc;
  const all = perms(os);
  assert.equal(all.length, 24);
  for (const p of all) assert.deepEqual(run(lot(100), p).alloc, ref);
});
t('5000 random cases: invariants + shuffle invariance', () => {
  let s = 7;
  const r = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let k = 0; k < 5000; k++) {
    const L = lot(Math.floor(r() * 60), 90 + Math.floor(r() * 20));
    const os = Array.from({ length: 1 + Math.floor(r() * 8) }, (_, i) => o('b' + i, 1 + Math.floor(r() * 30), 85 + Math.floor(r() * 30)));
    const a = run(L, os, 'seed' + k);
    const shuffled = [...os].sort(() => r() - 0.5);
    assert.deepEqual(run(L, shuffled, 'seed' + k).alloc, a.alloc);
    assert.equal(run(L, shuffled, 'seed' + k).price, a.price);
  }
});
console.log(`\n${n} tests passed`);
