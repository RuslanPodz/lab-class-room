'use strict';
/**
 * Аналітичне тестування: порівняльний аналіз для 5, 10 і 20 точок.
 * Запуск: npm run bench  → docs/analysis.json і docs/analysis.md
 */
const fs = require('fs');
const path = require('path');
const A = require('../js/approx.js');
const D = require('../js/datasets.js');

function time(fn, minMs = 150) {
  let reps = 0;
  const t0 = process.hrtime.bigint();
  let t;
  do {
    fn();
    reps++;
    t = Number(process.hrtime.bigint() - t0) / 1e6;
  } while (t < minMs);
  return t / reps; // мс на один виклик
}

const grid = A.linspace(0, 4, 1000);
const M_MAIN = 2; // степінь МНК для основних графіків
const out = { node: process.version, datasets: [], degrees: [], stability: [] };

for (const n of [5, 10, 20]) {
  const { x, y } = D[n];
  const lag = A.makeLagrange(x, y);
  const { coeffs } = A.dividedDifferences(x, y);
  const fit = A.leastSquares(x, y, M_MAIN);
  const r = A.rangeOf(lag, 0, 4, 2001);
  // LOOCV для МНК (m = M_MAIN): середня похибка прогнозу точки, виключеної з навчання
  let cvL = 0;
  let cvM = 0;
  for (let i = 1; i < n - 1; i++) {
    const xs = x.filter((_, j) => j !== i);
    const ys = y.filter((_, j) => j !== i);
    cvL += (A.lagrange(xs, ys, x[i]) - y[i]) ** 2;
    cvM += (A.leastSquares(xs, ys, Math.min(M_MAIN, xs.length - 1)).fn(x[i]) - y[i]) ** 2;
  }
  out.datasets.push({
    n,
    lagDegree: n - 1,
    lagMaxDevRef: A.maxDeviation(lag, D.reference, 0, 4, 4001),
    lagMin: r.min,
    lagMax: r.max,
    lagLoocvRmse: Math.sqrt(cvL / (n - 2)),
    mnkM: M_MAIN,
    mnkSse: fit.metrics.sse,
    mnkRmse: fit.metrics.rmse,
    mnkR2: fit.metrics.r2,
    mnkMaxAbs: fit.metrics.maxAbs,
    mnkMaxDevRef: A.maxDeviation(fit.fn, D.reference, 0, 4, 4001),
    mnkLoocvRmse: Math.sqrt(cvM / (n - 2)),
    mnkCond: fit.cond,
    // час, мкс
    tLagrange1000: time(() => grid.forEach((t) => A.lagrange(x, y, t))) * 1000,
    tNewton1000: time(() => { const c = A.dividedDifferences(x, y).coeffs; grid.forEach((t) => A.newtonEval(x, c, t)); }) * 1000,
    tMnkFit: time(() => A.leastSquares(x, y, M_MAIN)) * 1000,
    tMnkEval1000: time(() => grid.forEach((t) => fit.fn(t))) * 1000,
    newtonVsLagrange: A.maxDeviation(lag, (t) => A.newtonEval(x, coeffs, t), 0, 4),
  });
  for (const m of [1, 2, 3, 4, 5, 6]) {
    if (m > n - 1) continue;
    const f = A.leastSquares(x, y, m);
    out.degrees.push({ n, m, sse: f.metrics.sse, rmse: f.metrics.rmse, r2: f.metrics.r2, maxDevRef: A.maxDeviation(f.fn, D.reference, 0, 4, 2001) });
  }
}

// стійкість: QR із нормалізацією як еталон; порівнюємо нормальні рівняння без нормалізації
for (const m of [3, 6, 9, 12, 15]) {
  const { x, y } = D[20];
  const ref = A.leastSquares(x, y, m, { normalize: true });
  const qrRaw = A.leastSquares(x, y, m, { normalize: false });
  const ne = A.normalEquationsSolve(x, y, m, { normalize: false });
  out.stability.push({
    m,
    condNorm: ref.cond,
    condRaw: qrRaw.cond,
    errQrRaw: A.maxDeviation(ref.fn, qrRaw.fn, 0, 4),
    errNormalEq: A.maxDeviation(ref.fn, ne.fn, 0, 4),
  });
}

const f = (v, d = 4) => (!Number.isFinite(v) ? '> 1e16 (вироджена)' : Math.abs(v) >= 1e4 || (Math.abs(v) < 1e-3 && v !== 0) ? v.toExponential(2) : v.toFixed(d));
let md = `# Аналітичне тестування (Node ${process.version})\n\n## Порівняння для 5/10/20 точок (МНК m = 2)\n\n`;
md += '| n | ст. Лагранжа | max|p−g_ref| | min p | max p | LOOCV Лагранж | RMSE МНК | R² | max|g−g_ref| | LOOCV МНК | cond₂ |\n|---|---|---|---|---|---|---|---|---|---|---|\n';
for (const r of out.datasets) md += `| ${r.n} | ${r.lagDegree} | ${f(r.lagMaxDevRef)} | ${f(r.lagMin)} | ${f(r.lagMax)} | ${f(r.lagLoocvRmse)} | ${f(r.mnkRmse)} | ${f(r.mnkR2)} | ${f(r.mnkMaxDevRef)} | ${f(r.mnkLoocvRmse)} | ${f(r.mnkCond, 2)} |\n`;
md += '\n## Час обчислень, мкс\n\n| n | Лагранж ×1000 | Ньютон (таблиця + 1000) | МНК: побудова | МНК ×1000 |\n|---|---|---|---|---|\n';
for (const r of out.datasets) md += `| ${r.n} | ${f(r.tLagrange1000, 1)} | ${f(r.tNewton1000, 1)} | ${f(r.tMnkFit, 2)} | ${f(r.tMnkEval1000, 1)} |\n`;
md += '\n## Вплив степеня m\n\n| n | m | SSE | RMSE | R² | max|g−g_ref| |\n|---|---|---|---|---|---|\n';
for (const r of out.degrees) md += `| ${r.n} | ${r.m} | ${f(r.sse, 6)} | ${f(r.rmse)} | ${f(r.r2)} | ${f(r.maxDevRef)} |\n`;
md += '\n## Стійкість (20 точок): QR+нормалізація як еталон\n\n| m | cond₂ з нормалізацією | cond₂ без | похибка QR без нормалізації | похибка нормальних рівнянь без нормалізації |\n|---|---|---|---|---|\n';
for (const r of out.stability) md += `| ${r.m} | ${f(r.condNorm, 1)} | ${f(r.condRaw, 1)} | ${f(r.errQrRaw)} | ${f(r.errNormalEq)} |\n`;

fs.writeFileSync(path.join(__dirname, '..', 'docs', 'analysis.json'), JSON.stringify(out, null, 2));
fs.writeFileSync(path.join(__dirname, '..', 'docs', 'analysis.md'), md);
console.log(md);
