/**
 * scale.js — автоматичне масштабування осей.
 *  • computeBounds: обчислює min/max по всіх видимих об'єктах кадру (точки, криві,
 *    залишки) з відступом, щоб графік завжди лишався у видимій зоні;
 *  • niceTicks: «гарні» поділки осі (крок 1·10^k, 2·10^k, 5·10^k);
 *  • approach: плавне наближення поточних меж до цільових (для анімації осей).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Scale = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * @param {{xs:number[], ys:number[]}[]} pointSets  набори точок
   * @param {{fn:(x:number)=>number, from:number, to:number}[]} curves  криві з діапазоном x
   * @param {{padX?:number, padY?:number, samples?:number}} opt
   * @returns {{xMin:number, xMax:number, yMin:number, yMax:number}}
   */
  function computeBounds(pointSets, curves, opt = {}) {
    const padX = opt.padX ?? 0.04;
    const padY = opt.padY ?? 0.1;
    const samples = opt.samples ?? 300;
    let xMin = Infinity;
    let xMax = -Infinity;
    let yMin = Infinity;
    let yMax = -Infinity;
    const take = (x, y) => {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      if (x < xMin) xMin = x;
      if (x > xMax) xMax = x;
      if (y < yMin) yMin = y;
      if (y > yMax) yMax = y;
    };
    for (const s of pointSets) s.xs.forEach((x, i) => take(x, s.ys[i]));
    for (const c of curves) {
      if (!(c.to > c.from)) {
        take(c.from, c.fn(c.from));
        continue;
      }
      const step = (c.to - c.from) / samples;
      for (let i = 0; i <= samples; i++) {
        const x = c.from + i * step;
        take(x, c.fn(x));
      }
    }
    if (!Number.isFinite(xMin)) return { xMin: 0, xMax: 1, yMin: 0, yMax: 1 };
    // вироджені діапазони (одна точка / горизонтальна лінія)
    if (xMax - xMin < 1e-12) { xMin -= 0.5; xMax += 0.5; }
    if (yMax - yMin < 1e-12) {
      const d = Math.max(Math.abs(yMax) * 0.1, 0.5);
      yMin -= d;
      yMax += d;
    }
    const dx = (xMax - xMin) * padX;
    const dy = (yMax - yMin) * padY;
    return { xMin: xMin - dx, xMax: xMax + dx, yMin: yMin - dy, yMax: yMax + dy };
  }

  /** «Гарний» крок сітки для діапазону та бажаної кількості поділок. */
  function niceStep(range, target = 6) {
    const raw = range / Math.max(1, target);
    const pow = 10 ** Math.floor(Math.log10(raw));
    const f = raw / pow;
    const nice = f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10;
    return nice * pow;
  }

  /** Поділки осі в межах [lo; hi]. */
  function niceTicks(lo, hi, target = 6) {
    if (!(hi > lo)) return { ticks: [lo], step: 1 };
    const step = niceStep(hi - lo, target);
    const start = Math.ceil(lo / step - 1e-9) * step;
    const ticks = [];
    for (let v = start; v <= hi + step * 1e-9; v += step) ticks.push(Math.abs(v) < step * 1e-9 ? 0 : v);
    return { ticks, step };
  }

  /** Підпис поділки з доречною кількістю знаків після коми. */
  function formatTick(v, step) {
    if (Math.abs(v) >= 1e5 || (Math.abs(v) < 1e-3 && v !== 0)) return v.toExponential(1);
    const digits = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
    return v.toFixed(Math.min(digits, 6)).replace('-', '−');
  }

  /** Плавне наближення меж: k ∈ (0;1] — частка шляху за кадр. */
  function approach(cur, target, k) {
    if (!cur) return { ...target };
    const out = {};
    for (const key of ['xMin', 'xMax', 'yMin', 'yMax']) out[key] = cur[key] + (target[key] - cur[key]) * k;
    return out;
  }

  function boundsClose(a, b, rel = 1e-3) {
    if (!a || !b) return false;
    const sx = Math.abs(b.xMax - b.xMin) * rel;
    const sy = Math.abs(b.yMax - b.yMin) * rel;
    return Math.abs(a.xMin - b.xMin) < sx && Math.abs(a.xMax - b.xMax) < sx
      && Math.abs(a.yMin - b.yMin) < sy && Math.abs(a.yMax - b.yMax) < sy;
  }

  return { computeBounds, niceStep, niceTicks, formatTick, approach, boundsClose };
});
