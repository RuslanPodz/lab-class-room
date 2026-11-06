/**
 * chart.js — рендерер графіків на Canvas 2D.
 *  • адаптивне полотно (ResizeObserver + devicePixelRatio);
 *  • сітка, осі з підписами, зони екстраполяції;
 *  • криві, точки, відрізки залишків, підсвічування активного вузла;
 *  • штрих-діаграма залишків з нульовою лінією.
 * Кольори беруться з CSS-змінних, тому світла й темна теми працюють однаково.
 */
(function (root) {
  'use strict';
  const S = root.Scale;

  function cssVar(name, el = document.documentElement) {
    return getComputedStyle(el).getPropertyValue(name).trim();
  }

  class Plot {
    /**
     * @param {HTMLCanvasElement} canvas
     * @param {{xLabel?:string, yLabel?:string, compact?:boolean, onResize?:Function}} opt
     */
    constructor(canvas, opt = {}) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.opt = opt;
      this.bounds = null;
      this.margin = opt.compact
        ? { l: 40, r: 10, t: 10, b: 24 }
        : { l: 58, r: 18, t: 16, b: 44 };
      this.resize();
      if ('ResizeObserver' in window) {
        new ResizeObserver(() => {
          this.resize();
          if (opt.onResize) opt.onResize();
        }).observe(canvas);
      }
    }

    resize() {
      const r = this.canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      this.w = Math.max(50, r.width);
      this.h = Math.max(50, r.height);
      this.canvas.width = Math.round(this.w * dpr);
      this.canvas.height = Math.round(this.h * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    /** Перетворення координат даних → пікселі. */
    px(x) {
      const b = this.bounds;
      return this.margin.l + ((x - b.xMin) / (b.xMax - b.xMin)) * (this.w - this.margin.l - this.margin.r);
    }

    py(y) {
      const b = this.bounds;
      return this.h - this.margin.b - ((y - b.yMin) / (b.yMax - b.yMin)) * (this.h - this.margin.t - this.margin.b);
    }

    /** Пікселі → координати даних (для підказок). */
    toData(px, py) {
      const b = this.bounds;
      const x = b.xMin + ((px - this.margin.l) / (this.w - this.margin.l - this.margin.r)) * (b.xMax - b.xMin);
      const y = b.yMin + ((this.h - this.margin.b - py) / (this.h - this.margin.t - this.margin.b)) * (b.yMax - b.yMin);
      return { x, y };
    }

    inPlot(px, py) {
      return px >= this.margin.l && px <= this.w - this.margin.r && py >= this.margin.t && py <= this.h - this.margin.b;
    }

    clear() {
      const c = this.ctx;
      c.clearRect(0, 0, this.w, this.h);
      c.fillStyle = cssVar('--surface-1');
      c.fillRect(0, 0, this.w, this.h);
    }

    /** Сітка, осі та підписи поділок. */
    drawAxes() {
      const c = this.ctx;
      const b = this.bounds;
      const { l, r, t, b: mb } = this.margin;
      const compact = this.opt.compact;
      const xt = S.niceTicks(b.xMin, b.xMax, compact ? 4 : Math.max(4, Math.round(this.w / 110)));
      const yt = S.niceTicks(b.yMin, b.yMax, compact ? 4 : Math.max(3, Math.round(this.h / 70)));
      c.save();
      c.lineWidth = 1;
      c.strokeStyle = cssVar('--grid');
      c.fillStyle = cssVar('--text-secondary');
      c.font = `${compact ? 10 : 12}px system-ui, sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'top';
      for (const v of xt.ticks) {
        const X = Math.round(this.px(v)) + 0.5;
        c.beginPath(); c.moveTo(X, t); c.lineTo(X, this.h - mb); c.stroke();
        c.fillText(S.formatTick(v, xt.step), X, this.h - mb + 5);
      }
      c.textAlign = 'right';
      c.textBaseline = 'middle';
      for (const v of yt.ticks) {
        const Y = Math.round(this.py(v)) + 0.5;
        c.beginPath(); c.moveTo(l, Y); c.lineTo(this.w - r, Y); c.stroke();
        c.fillText(S.formatTick(v, yt.step), l - 6, Y);
      }
      // вісь y = 0 та x = 0 (якщо видимі) — трохи контрастніші
      c.strokeStyle = cssVar('--axis');
      if (b.yMin < 0 && b.yMax > 0) {
        const Y = Math.round(this.py(0)) + 0.5;
        c.beginPath(); c.moveTo(l, Y); c.lineTo(this.w - r, Y); c.stroke();
      }
      c.strokeRect(l + 0.5, t + 0.5, this.w - l - r - 1, this.h - t - mb - 1);
      if (!compact) {
        c.fillStyle = cssVar('--text-secondary');
        c.font = '12px system-ui, sans-serif';
        c.textAlign = 'right';
        c.textBaseline = 'bottom';
        c.fillText(this.opt.xLabel || 'x', this.w - r, this.h - 4);
        c.save();
        c.translate(14, t);
        c.rotate(-Math.PI / 2);
        c.textAlign = 'right';
        c.textBaseline = 'middle';
        c.fillText(this.opt.yLabel || 'y', 0, 0);
        c.restore();
      }
      c.restore();
    }

    /** Сіра заливка зон екстраполяції (за межами [x0; xn]). */
    drawExtrapolationZones(x0, xn) {
      const c = this.ctx;
      const { t, b: mb, l, r } = this.margin;
      c.save();
      c.fillStyle = cssVar('--extrap');
      const L = this.px(x0);
      const R = this.px(xn);
      if (L > l) c.fillRect(l, t, L - l, this.h - t - mb);
      if (R < this.w - r) c.fillRect(R, t, this.w - r - R, this.h - t - mb);
      c.fillStyle = cssVar('--text-muted');
      c.font = '11px system-ui, sans-serif';
      c.textBaseline = 'top';
      if (L - l > 60) { c.textAlign = 'left'; c.fillText('екстраполяція', l + 6, t + 6); }
      if (this.w - r - R > 60) { c.textAlign = 'right'; c.fillText('екстраполяція', this.w - r - 6, t + 6); }
      c.restore();
    }

    /** Крива y = fn(x) на [from; to]; значення поза полем обрізаються clip-ом. */
    drawCurve(fn, from, to, { color, width = 2, dash = [] }) {
      if (!(to >= from)) return;
      const c = this.ctx;
      const { l, r, t, b: mb } = this.margin;
      c.save();
      c.beginPath();
      c.rect(l, t, this.w - l - r, this.h - t - mb);
      c.clip();
      c.strokeStyle = color;
      c.lineWidth = width;
      c.lineJoin = 'round';
      c.lineCap = 'round';
      c.setLineDash(dash);
      c.beginPath();
      const steps = Math.max(2, Math.ceil(((this.px(to) - this.px(from)) / 2)));
      for (let i = 0; i <= steps; i++) {
        const x = from + ((to - from) * i) / steps;
        const y = fn(x);
        const X = this.px(x);
        const Y = Math.max(-1e4, Math.min(1e4, this.py(y)));
        if (i === 0) c.moveTo(X, Y); else c.lineTo(X, Y);
      }
      c.stroke();
      c.restore();
    }

    /** Відрізки залишків від (x_i, ŷ_i) до (x_i, y_i); frac[i] ∈ [0;1] — частка довжини. */
    drawResidualSegments(xs, ys, fitted, frac, color) {
      const c = this.ctx;
      c.save();
      c.strokeStyle = color;
      c.lineWidth = 2;
      c.setLineDash([4, 3]);
      xs.forEach((x, i) => {
        const f = frac ? frac[i] : 1;
        if (f <= 0) return;
        const yEnd = fitted[i] + (ys[i] - fitted[i]) * f;
        c.beginPath();
        c.moveTo(this.px(x), this.py(fitted[i]));
        c.lineTo(this.px(x), this.py(yEnd));
        c.stroke();
      });
      c.restore();
    }

    /**
     * Експериментальні точки.
     * @param {{added?:number, active?:number, pulse?:number, highlight?:number}} st
     *   added  — скільки вузлів уже додано (решта — порожні кружки);
     *   active — індекс вузла, що додається зараз (збільшений маркер);
     *   highlight — індекс вузла під курсором.
     */
    drawPoints(xs, ys, st = {}) {
      const c = this.ctx;
      const ink = cssVar('--text-primary');
      const surface = cssVar('--surface-1');
      const accent = cssVar('--active');
      const base = this.opt.compact ? 3.5 : 5;
      c.save();
      xs.forEach((x, i) => {
        const X = this.px(x);
        const Y = this.py(ys[i]);
        const added = st.added === undefined || i < st.added;
        const isActive = i === st.active;
        let rad = base;
        if (isActive) rad = base + 5 * (st.pulse ?? 1);
        if (i === st.highlight) rad = base + 2;
        c.beginPath();
        c.arc(X, Y, rad + 2, 0, Math.PI * 2);
        c.fillStyle = surface; // 2px кільце поверхні, щоб маркер не зливався з кривою
        c.fill();
        c.beginPath();
        c.arc(X, Y, rad, 0, Math.PI * 2);
        if (isActive) {
          c.fillStyle = accent;
          c.fill();
        } else if (added) {
          c.fillStyle = ink;
          c.fill();
        } else {
          c.lineWidth = 1.5;
          c.strokeStyle = cssVar('--text-muted');
          c.stroke();
        }
      });
      c.restore();
    }

    /** Вертикальна лінія-приціл для підказки. */
    drawCrosshair(x) {
      const c = this.ctx;
      const X = Math.round(this.px(x)) + 0.5;
      c.save();
      c.strokeStyle = cssVar('--text-muted');
      c.setLineDash([3, 3]);
      c.beginPath();
      c.moveTo(X, this.margin.t);
      c.lineTo(X, this.h - this.margin.b);
      c.stroke();
      c.restore();
    }

    dot(x, y, color, rad = 4) {
      const c = this.ctx;
      c.save();
      c.beginPath();
      c.arc(this.px(x), this.py(y), rad + 2, 0, Math.PI * 2);
      c.fillStyle = cssVar('--surface-1');
      c.fill();
      c.beginPath();
      c.arc(this.px(x), this.py(y), rad, 0, Math.PI * 2);
      c.fillStyle = color;
      c.fill();
      c.restore();
    }

    /** Штрих-діаграма залишків: стрижень від 0 до r_i + маркер; frac — частка висоти. */
    drawResidualBars(xs, rs, frac, color, highlight) {
      const c = this.ctx;
      const Y0 = this.py(0);
      c.save();
      // нульова лінія з підписом
      c.strokeStyle = cssVar('--axis');
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(this.margin.l, Y0);
      c.lineTo(this.w - this.margin.r, Y0);
      c.stroke();
      c.fillStyle = cssVar('--text-secondary');
      c.font = '11px system-ui, sans-serif';
      c.textAlign = 'left';
      c.textBaseline = 'bottom';
      c.fillText('r = 0', this.margin.l + 4, Y0 - 2);
      xs.forEach((x, i) => {
        const f = frac ? frac[i] : 1;
        if (f <= 0) return;
        const X = this.px(x);
        const Y = this.py(rs[i] * f);
        c.strokeStyle = color;
        c.lineWidth = i === highlight ? 4 : 2.5;
        c.lineCap = 'round';
        c.beginPath();
        c.moveTo(X, Y0);
        c.lineTo(X, Y);
        c.stroke();
        c.beginPath();
        c.arc(X, Y, i === highlight ? 5.5 : 4, 0, Math.PI * 2);
        c.fillStyle = color;
        c.fill();
      });
      c.restore();
    }
  }

  root.Plot = Plot;
  root.cssVar = cssVar;
})(typeof self !== 'undefined' ? self : this);
