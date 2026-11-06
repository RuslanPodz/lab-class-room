'use strict';
/**
 * Модульні тести математичного ядра (рівень «модуль» V-моделі).
 * Запуск: npm test  (node --test)
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../js/approx.js');
const D = require('../js/datasets.js');

const close = (a, b, eps = 1e-9, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} ≉ ${b} (eps ${eps})`);

test('Т-01 Лагранж проходить через усі вузли варіанта (5, 10, 20 точок)', () => {
  for (const n of [5, 10, 20]) {
    const { x, y } = D[n];
    x.forEach((xi, i) => close(A.lagrange(x, y, xi), y[i], 1e-9, `n=${n}, i=${i}`));
  }
});

test('Т-02 Базисні поліноми: L_k(x_j) = δ_kj і Σ L_k(x) = 1', () => {
  const { x } = D[5];
  for (let k = 0; k < x.length; k++) {
    for (let j = 0; j < x.length; j++) close(A.lagrangeBasis(x, k, x[j]), k === j ? 1 : 0);
  }
  for (const t of [0.3, 1.7, 3.9]) {
    close(x.reduce((s, _, k) => s + A.lagrangeBasis(x, k, t), 0), 1, 1e-12);
  }
});

test('Т-03 Поліном варіанта: p(x) = 0.8 − (x−2)²/3 + (x−2)⁴/30 (ручний розрахунок)', () => {
  const { x, y } = D[5];
  for (const t of [0.5, 1.5, 2.5, 3.5, 2.2]) close(A.lagrange(x, y, t), D.reference(t), 1e-12);
  close(A.lagrange(x, y, 0.5), 0.21875, 1e-12, 'p(0.5)');
  close(A.lagrange(x, y, 1.5), 0.71875, 1e-12, 'p(1.5)');
});

test('Т-04 Лагранж точно відтворює поліноми степеня ≤ n−1', () => {
  const xs = [-2, -1, 0.5, 1, 3];
  const f = (t) => 2 * t ** 4 - t ** 3 + 0.5 * t - 7;
  const ys = xs.map(f);
  for (const t of A.linspace(-3, 4, 15)) close(A.lagrange(xs, ys, t), f(t), 1e-8);
});

test('Т-05 Ньютон збігається з Лагранжем (поділені різниці)', () => {
  for (const n of [5, 10, 20]) {
    const { x, y } = D[n];
    const { coeffs } = A.dividedDifferences(x, y);
    for (const t of A.linspace(0, 4, 41)) close(A.newtonEval(x, coeffs, t), A.lagrange(x, y, t), 1e-6, `n=${n}`);
  }
});

test('Т-06 Таблиця поділених різниць для варіанта (ручний розрахунок)', () => {
  const { table, coeffs } = A.dividedDifferences(D[5].x, D[5].y);
  assert.deepEqual(table[1].map((v) => +v.toFixed(10)), [0.5, 0.3, -0.3, -0.5]);
  assert.deepEqual(table[2].map((v) => +v.toFixed(10)), [-0.1, -0.3, -0.1]);
  close(coeffs[3], -1 / 15, 1e-12);
  close(coeffs[4], 1 / 30, 1e-12);
});

test('Т-07 МНК: пряма через точні дані відновлюється точно', () => {
  const xs = [0, 1, 2, 3, 4, 5];
  const ys = xs.map((t) => 3 - 2 * t);
  const fit = A.leastSquares(xs, ys, 1);
  close(fit.coeffsX[0], 3, 1e-12);
  close(fit.coeffsX[1], -2, 1e-12);
  close(fit.metrics.sse, 0, 1e-20);
});

test('Т-08 МНК для варіанта, m = 2 (ручний розрахунок нормальних рівнянь)', () => {
  // Дані симетричні відносно x = 2, тому y ≈ a + b(x−2)²:
  // b = Σ(s−s̄)(y−ȳ)/Σ(s−s̄)² = −2.6/14 = −13/70, a = ȳ − 2b = 0.36 + 26/70
  // → y ≈ −2/175 + (26/35)x − (13/70)x² ≈ −0.0114 + 0.7429x − 0.1857x²
  const fit = A.leastSquares(D[5].x, D[5].y, 2);
  close(fit.coeffsX[0], -2 / 175, 1e-12, 'a0');
  close(fit.coeffsX[1], 26 / 35, 1e-12, 'a1');
  close(fit.coeffsX[2], -13 / 70, 1e-12, 'a2');
});

test('Т-09 МНК: сума залишків = 0 і залишки ортогональні до стовпців матриці', () => {
  for (const n of [5, 10, 20]) {
    const { x, y } = D[n];
    const fit = A.leastSquares(x, y, 3);
    close(fit.residuals.reduce((s, r) => s + r, 0), 0, 1e-12, `Σr n=${n}`);
    const ts = x.map((t) => (t - fit.norm.c) / fit.norm.h);
    for (let j = 0; j <= 3; j++) close(fit.residuals.reduce((s, r, i) => s + r * ts[i] ** j, 0), 0, 1e-12);
  }
});

test('Т-10 МНК при m = n−1 збігається з інтерполяцією Лагранжа', () => {
  const { x, y } = D[5];
  const fit = A.leastSquares(x, y, 4);
  for (const t of A.linspace(0, 4, 21)) close(fit.fn(t), A.lagrange(x, y, t), 1e-10);
});

test('Т-11 QR (Хаусхолдер) збігається з нормальними рівняннями на добре обумовленій задачі', () => {
  const { x, y } = D[10];
  const qr = A.leastSquares(x, y, 3);
  const ne = A.normalEquationsSolve(x, y, 3, { normalize: true });
  for (const t of A.linspace(0, 4, 21)) close(qr.fn(t), ne.fn(t), 1e-9);
});

test('Т-12 Нормалізація x: результат не залежить від неї, а обумовленість R значно краща', () => {
  const { x, y } = D[20];
  const a = A.leastSquares(x, y, 6, { normalize: true });
  const b = A.leastSquares(x, y, 6, { normalize: false });
  for (const t of A.linspace(0, 4, 21)) close(a.fn(t), b.fn(t), 1e-7);
  assert.ok(b.cond > 100 * a.cond, `cond без нормалізації ${b.cond} vs з нормалізацією ${a.cond}`);
});

test('Т-13 Метрики: R² ∈ [0;1], RMSE = √(SSE/n), МНК m=4 краще за m=2', () => {
  const { x, y } = D[20];
  const f2 = A.leastSquares(x, y, 2).metrics;
  const f4 = A.leastSquares(x, y, 4).metrics;
  assert.ok(f2.r2 > 0 && f2.r2 <= 1);
  close(f4.rmse, Math.sqrt(f4.sse / 20), 1e-15);
  assert.ok(f4.sse < f2.sse);
});

test('Т-14 Валідація: однакові вузли, різна довжина, нечислові значення, завеликий степінь', () => {
  assert.throws(() => A.makeLagrange([1, 1, 2], [0, 1, 2]), /різними/);
  assert.throws(() => A.makeLagrange([1, 2], [0]), /не збігається/);
  assert.throws(() => A.makeLagrange([1, NaN], [0, 1]), /скінченними/);
  assert.throws(() => A.leastSquares([0, 1, 2], [0, 1, 2], 3), /не може перевищувати/);
  assert.throws(() => A.leastSquares([0, 1, 2], [0, 1, 2], 1.5), /цілим/);
});

test('Т-15 Розбір введення: формат варіанта, рядки, десяткова кома, сортування', () => {
  const v = A.parsePoints('(0, 0.0), (1, 0.5), (2, 0.8), (3, 0.5), (4, 0.0)');
  assert.deepEqual(v, { x: [0, 1, 2, 3, 4], y: [0, 0.5, 0.8, 0.5, 0] });
  assert.deepEqual(A.parsePoints('2 0.8\n0;0\n1, 0.5'), { x: [0, 1, 2], y: [0, 0.5, 0.8] });
  assert.deepEqual(A.parsePoints('0,5 1,25\n1 2'), { x: [0.5, 1], y: [1.25, 2] });
  assert.throws(() => A.parsePoints('1 2 3\n4 5'), /очікується/);
  assert.throws(() => A.parsePoints('a b\n1 2'), /не є числом/);
});

test('Т-16 Число обумовленості: одинична матриця → 1, діагональ diag(1, 10) → 10', () => {
  close(A.conditionNumber([[1, 0], [0, 1], [0, 0]]), 1, 1e-12);
  close(A.conditionNumber([[1, 0], [0, 10]]), 10, 1e-10);
  close(A.conditionNumber([[1, 1], [1, 1.0001], [1, 0.9999]]), 24494.9, 1, 'майже залежні стовпці');
});

test('Т-17 Перерахунок коефіцієнтів t → x і форматування полінома', () => {
  const theta = [1, 2, 3]; // 1 + 2t + 3t², t = (x − 2)/2
  const cx = A.toXCoefficients(theta, 2, 2);
  for (const x of [0, 1, 3.3]) close(A.polyEval(cx, x), A.polyEval(theta, (x - 2) / 2), 1e-12);
  assert.equal(A.formatPolynomial([1, -2, 0.5], 2), '0.50·x^2 − 2.00·x + 1.00');
});
