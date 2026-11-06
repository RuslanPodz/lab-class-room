'use strict';
/**
 * Генератор наборів 10 і 20 точок на основі варіанта (5 точок).
 * Базова форма варіанта — його ж інтерполяційний поліном
 *   g(x) = 0.8 − (x−2)²/3 + (x−2)⁴/30,  x ∈ [0; 4],
 * вузли рівновіддалені, до y додається детермінований «шум вимірювань» ±0.03
 * (генератор mulberry32 із фіксованим seed), значення округлюються до 0.001.
 * Запуск: node scripts/gen-datasets.js  → друкує JSON для js/datasets.js
 */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const base = (x) => 0.8 - (x - 2) ** 2 / 3 + (x - 2) ** 4 / 30;
const r3 = (v) => Math.round(v * 1000) / 1000;
function make(n, seed, amp = 0.03) {
  const rnd = mulberry32(seed);
  const pts = [];
  for (let i = 0; i < n; i++) {
    const x = r3((4 * i) / (n - 1));
    pts.push([x, r3(base(x) + (2 * rnd() - 1) * amp)]);
  }
  return pts;
}
const out = { n10: make(10, 2026), n20: make(20, 1101) };
console.log(JSON.stringify(out));
module.exports = { base, make };
