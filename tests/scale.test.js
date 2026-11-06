'use strict';
/** Модульні тести автоматичного масштабування осей. */
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../js/scale.js');
const A = require('../js/approx.js');
const D = require('../js/datasets.js');

test('М-01 computeBounds охоплює всі точки та всі значення кривої з відступом', () => {
  const { x, y } = D[20];
  const lag = A.makeLagrange(x, y);
  const b = S.computeBounds([{ xs: x, ys: y }], [{ fn: lag, from: 0, to: 4 }], { padX: 0.03, padY: 0.1 });
  const r = A.rangeOf(lag, 0, 4, 2001);
  assert.ok(b.yMax > r.max * 0.999, `yMax ${b.yMax} має покривати пік осциляції ${r.max}`);
  assert.ok(b.yMin < Math.min(r.min, ...y));
  assert.ok(b.xMin < 0 && b.xMax > 4);
});

test('М-02 Межі змінюються при перемиканні наборів 5 → 20 (осциляція Рунге видима)', () => {
  const bounds = [5, 20].map((n) => {
    const { x, y } = D[n];
    return S.computeBounds([{ xs: x, ys: y }], [{ fn: A.makeLagrange(x, y), from: x[0], to: x[x.length - 1] }]);
  });
  assert.ok(bounds[0].yMax < 1);
  assert.ok(bounds[1].yMax > 20);
});

test('М-03 Вироджені діапазони: одна точка та горизонтальна лінія не дають нульової висоти', () => {
  const b1 = S.computeBounds([{ xs: [2], ys: [3] }], []);
  assert.ok(b1.xMax > b1.xMin && b1.yMax > b1.yMin);
  const b2 = S.computeBounds([], [{ fn: () => 0.36, from: 0, to: 4 }]);
  assert.ok(b2.yMax > 0.36 && b2.yMin < 0.36);
  assert.deepEqual(S.computeBounds([], []), { xMin: 0, xMax: 1, yMin: 0, yMax: 1 });
});

test('М-04 NaN/Infinity у кривій ігноруються', () => {
  const b = S.computeBounds([], [{ fn: (x) => (x === 2 ? Infinity : x), from: 0, to: 4 }], { padY: 0, padX: 0 });
  assert.ok(Number.isFinite(b.yMax) && b.yMax <= 4);
});

test('М-05 niceTicks: крок 1·10^k / 2·10^k / 5·10^k, поділки в межах діапазону', () => {
  for (const [lo, hi] of [[-0.12, 0.9], [0, 4], [-4.8, 26.3], [1000, 1003]]) {
    const { ticks, step } = S.niceTicks(lo, hi, 6);
    const mant = step / 10 ** Math.floor(Math.log10(step) + 1e-12);
    assert.ok([1, 2, 5].some((m) => Math.abs(mant - m) < 1e-9), `крок ${step}`);
    assert.ok(ticks.length >= 3 && ticks.length <= 12, `${lo}..${hi}: ${ticks.length} поділок`);
    assert.ok(ticks.every((t) => t >= lo - 1e-9 && t <= hi + 1e-9));
  }
  assert.equal(S.formatTick(-0.5, 0.1), '−0.5');
});

test('М-06 approach: плавне наближення збігається до цілі', () => {
  let cur = { xMin: 0, xMax: 1, yMin: 0, yMax: 1 };
  const target = { xMin: -1, xMax: 5, yMin: -2, yMax: 25 };
  let steps = 0;
  while (!S.boundsClose(cur, target) && steps < 200) { cur = S.approach(cur, target, 0.15); steps++; }
  assert.ok(steps > 5 && steps < 100, `кроків: ${steps}`);
});
