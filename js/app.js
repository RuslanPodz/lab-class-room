/**
 * app.js — контролер застосунку: стан, обчислення, анімація, взаємодія з UI.
 *
 * Потік даних:  UI-подія → state → recompute() → buildScene(t) → autoscale → Plot.draw*
 * Анімація керується requestAnimationFrame; межі осей щокадру плавно наближаються
 * до цільових, обчислених по всіх видимих об'єктах кадру (автомасштабування).
 */
(function () {
  'use strict';
  const A = window.Approx;
  const S = window.Scale;
  const DATA = window.DATASETS;

  /* ------------------------------------------------------------------ стан */
  const ORIGINAL = {};
  for (const n of [5, 10, 20]) ORIGINAL[n] = { title: DATA[n].title, x: DATA[n].x.slice(), y: DATA[n].y.slice() };

  const state = {
    n: 5, // активний набір: 5 | 10 | 20
    mode: 'all', // 'lagrange' | 'mnk' | 'all'
    m: 2, // степінь МНК-полінома (за замовчуванням 2; дані симетричні, тож m = 3 дає той самий результат)
    normalize: true, // нормалізація x → t ∈ [−1; 1]
    extrap: false, // показувати зону екстраполяції
    showRef: false, // показувати еталонну форму варіанта
    speed: 1,
    sets: JSON.parse(JSON.stringify(ORIGINAL)),
    model: null, // результати обчислень для активного набору
    anim: null, // { kind: 'lagrange'|'mnk', t, duration, queue }
    bounds: null, // поточні (анімовані) межі осей
    hover: null,
  };

  /* ------------------------------------------------------------------ DOM */
  const $ = (id) => document.getElementById(id);
  const mainCanvas = $('mainChart');
  const resCanvas = $('residualChart');
  const tooltip = $('tooltip');
  const mainPlot = new window.Plot(mainCanvas, { xLabel: 'x', yLabel: 'y', onResize: () => requestDraw() });
  const resPlot = new window.Plot(resCanvas, { xLabel: 'x', yLabel: 'r = y − ŷ', onResize: () => requestDraw() });
  resPlot.margin = { l: 58, r: 18, t: 10, b: 30 };

  const colors = () => ({
    lag: window.cssVar('--series-lagrange'),
    mnk: window.cssVar('--series-mnk'),
    res: window.cssVar('--series-residual'),
    ref: window.cssVar('--text-muted'),
  });

  /* ------------------------------------------------------------------ обчислення */

  /** Будує модель для набору: Лагранж, Ньютон, МНК, метрики, час обчислень. */
  function buildModel(set, m, normalize) {
    const { x, y } = set;
    const mEff = Math.min(m, x.length - 1);
    const lag = A.makeLagrange(x, y);
    const dd = A.dividedDifferences(x, y);
    const fit = A.leastSquares(x, y, mEff, { normalize });
    // час: побудова моделі + обчислення кривої у 500 точках, середнє за 20 повторів
    const t0 = performance.now();
    for (let r = 0; r < 20; r++) {
      const f = A.leastSquares(x, y, mEff, { normalize });
      for (let i = 0; i < 500; i++) { const t = x[0] + (i / 499) * (x[x.length - 1] - x[0]); A.lagrange(x, y, t); f.fn(t); }
    }
    const t1 = t0 + (performance.now() - t0) / 20;
    const x0 = x[0];
    const xn = x[x.length - 1];
    const span = xn - x0;
    const lagRange = A.rangeOf(lag, x0, xn, 600);
    return {
      x, y, lag, dd, fit, mEff, x0, xn, span,
      lagDevRef: A.maxDeviation(lag, DATA.reference, x0, xn),
      mnkDevRef: A.maxDeviation(fit.fn, DATA.reference, x0, xn),
      lagAmplitude: lagRange.max - lagRange.min,
      computeMs: t1 - t0,
      // проміжні поліноми Лагранжа P_k для анімації (перші k вузлів)
      partial: x.map((_, k) => buildPartial(x, y, k + 1)),
    };
  }

  function buildPartial(x, y, k) {
    const xs = x.slice(0, k);
    const ys = y.slice(0, k);
    return (t) => A.lagrange(xs, ys, t);
  }

  function recompute() {
    const set = state.sets[state.n];
    state.model = buildModel(set, state.m, state.normalize);
    renderInfo();
  }

  /* ------------------------------------------------------------------ сцена */

  const ease = (t) => (t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t)); // smoothstep

  /**
   * Опис кадру: які криві, точки та залишки видно. Від нього залежить і малювання,
   * і автомасштабування (computeBounds бере саме видимі об'єкти).
   */
  function buildScene() {
    const M = state.model;
    const c = colors();
    const showLag = state.mode !== 'mnk';
    const showMnk = state.mode !== 'lagrange';
    const lo = state.extrap ? M.x0 - 0.25 * M.span : M.x0;
    const hi = state.extrap ? M.xn + 0.25 * M.span : M.xn;
    const scene = { curves: [], points: { added: undefined, active: undefined, pulse: 1 }, residFrac: null, lo, hi };
    const a = state.anim;

    // --- Лагранж
    if (showLag) {
      if (a && a.kind === 'lagrange') {
        const n = M.x.length;
        const p = Math.min(a.t, n - 1); // p ∈ [0; n−1]
        const k = Math.min(n - 1, Math.floor(p)); // уже повністю додано k+1 вузлів
        const s = ease(p - k);
        const Pk = M.partial[k];
        if (k + 1 < n) {
          const Pk1 = M.partial[k + 1];
          const right = M.x[k] + s * (M.x[k + 1] - M.x[k]);
          scene.curves.push({ fn: (t) => (1 - s) * Pk(t) + s * Pk1(t), from: M.x0, to: right, color: c.lag, width: 2.5 });
          scene.points.added = k + 1;
          scene.points.active = k + 1;
          scene.points.pulse = 0.4 + 0.6 * Math.sin(Math.PI * Math.min(1, (p - k) * 1.2));
        } else {
          scene.curves.push({ fn: M.lag, from: lo, to: hi, color: c.lag, width: 2.5 });
        }
      } else if (!(a && a.kind === 'mnk' && a.hideLag)) {
        scene.curves.push({ fn: M.lag, from: lo, to: hi, color: c.lag, width: 2.5 });
      }
    }

    // --- МНК
    if (showMnk) {
      const fitFn = M.fit.fn;
      if (a && a.kind === 'mnk') {
        // t ∈ [0; 2]: [0;1] — «вирощування» від горизонталі ȳ, [1;2] — поява залишків
        const g = ease(Math.min(1, a.t));
        const mean = M.fit.metrics.mean;
        scene.curves.push({ fn: (t) => (1 - g) * mean + g * fitFn(t), from: lo, to: hi, color: c.mnk, width: 2.5 });
        const n = M.x.length;
        const r = Math.max(0, a.t - 1) * n;
        scene.residFrac = M.x.map((_, i) => ease(r - i));
      } else if (!(a && a.kind === 'lagrange' && a.hideMnk)) {
        scene.curves.push({ fn: fitFn, from: lo, to: hi, color: c.mnk, width: 2.5 });
        scene.residFrac = M.x.map(() => 1);
      }
    }

    if (state.showRef) {
      scene.curves.unshift({ fn: DATA.reference, from: lo, to: hi, color: c.ref, width: 1.5, dash: [6, 5] });
    }
    return scene;
  }

  /* ------------------------------------------------------------------ малювання */

  let rafId = 0;
  let lastTs = 0;

  function requestDraw() {
    if (!rafId) rafId = requestAnimationFrame(frame);
  }

  function frame(ts) {
    rafId = 0;
    const dt = lastTs ? Math.min(0.05, (ts - lastTs) / 1000) : 0.016;
    lastTs = ts;
    let busy = false;

    // крок анімації
    const a = state.anim;
    if (a && !a.paused) {
      a.t += dt * a.rate * state.speed;
      if (a.t >= a.end) {
        a.t = a.end;
        const next = a.queue.shift();
        if (next) startPhase(next, a.queue);
        else finishAnimation();
      }
      busy = true;
    }

    const scene = buildScene();
    const M = state.model;
    const c = colors();

    // автомасштабування: цільові межі по всьому видимому
    const target = S.computeBounds([{ xs: M.x, ys: M.y }], scene.curves, { padX: 0.03, padY: 0.12 });
    if (state.extrap) {
      target.xMin = Math.min(target.xMin, scene.lo);
      target.xMax = Math.max(target.xMax, scene.hi);
    }
    if (state.snapBounds || !state.bounds) {
      state.bounds = target;
      state.snapBounds = false;
    } else {
      state.bounds = S.approach(state.bounds, target, 1 - Math.exp(-dt * 10));
      if (!S.boundsClose(state.bounds, target)) busy = true;
      else state.bounds = target;
    }
    mainPlot.bounds = state.bounds;
    updateScaleBadge(target);

    mainPlot.clear();
    if (state.extrap) mainPlot.drawExtrapolationZones(M.x0, M.xn);
    mainPlot.drawAxes();
    for (const cv of scene.curves) mainPlot.drawCurve(cv.fn, cv.from, cv.to, cv);
    if (scene.residFrac) mainPlot.drawResidualSegments(M.x, M.y, M.fit.fitted, scene.residFrac, c.res);
    mainPlot.drawPoints(M.x, M.y, { ...scene.points, highlight: state.hover?.node });

    // підказка / приціл
    const h = state.hover;
    if (h && h.node === undefined && h.x !== undefined) {
      mainPlot.drawCrosshair(h.x);
      for (const cv of scene.curves) {
        if (h.x >= cv.from && h.x <= cv.to && !cv.dash) mainPlot.dot(h.x, cv.fn(h.x), cv.color, 3.5);
      }
    }

    // діаграма залишків (лише для МНК)
    drawResiduals(scene, c);

    if (busy) requestDraw();
    else lastTs = 0;
  }

  function drawResiduals(scene, c) {
    const M = state.model;
    const wrap = $('residualWrap');
    const show = state.mode !== 'lagrange';
    wrap.hidden = !show;
    if (!show) return;
    resPlot.resize();
    const rs = M.fit.residuals;
    const amp = Math.max(1e-6, ...rs.map(Math.abs)) * 1.25;
    resPlot.bounds = { xMin: state.bounds.xMin, xMax: state.bounds.xMax, yMin: -amp, yMax: amp };
    resPlot.clear();
    resPlot.drawAxes();
    resPlot.drawResidualBars(M.x, rs, scene.residFrac, c.res, state.hover?.node);
  }

  function updateScaleBadge(t) {
    $('scaleInfo').textContent =
      `Автомасштаб: x ∈ [${t.xMin.toFixed(3)}; ${t.xMax.toFixed(3)}], y ∈ [${t.yMin.toFixed(3)}; ${t.yMax.toFixed(3)}]`;
  }

  /* ------------------------------------------------------------------ анімація */

  function phase(kind) {
    const n = state.model.x.length;
    if (kind === 'lagrange') {
      // ~0.7 с на кожен доданий вузол + пауза на фінальній кривій
      return { kind, t: 0, end: n - 1 + 0.6, rate: 1 / 0.7, hideMnk: state.mode === 'all' };
    }
    return { kind, t: 0, end: 2.2, rate: 1 / 1.4, hideLag: false };
  }

  function startPhase(p, queue) {
    state.anim = { ...p, queue, paused: false };
    setStatus(p.kind === 'lagrange'
      ? 'Анімація: покрокове додавання вузлів інтерполяції Лагранжа'
      : 'Анімація: МНК-поліном «виростає» від горизонталі ȳ, потім з’являються залишки');
  }

  function play() {
    if (state.anim && state.anim.paused) {
      state.anim.paused = false;
      updatePlayButton();
      requestDraw();
      return;
    }
    const kinds = state.mode === 'all' ? ['lagrange', 'mnk'] : [state.mode];
    const queue = kinds.map(phase);
    startPhase(queue.shift(), queue);
    updatePlayButton();
    requestDraw();
  }

  function pause() {
    if (state.anim) state.anim.paused = true;
    updatePlayButton();
  }

  function finishAnimation() {
    state.anim = null;
    setStatus('Готово. Наведіть курсор на графік, щоб побачити координати та похибку.');
    updatePlayButton();
  }

  function stopAnimation() {
    state.anim = null;
    updatePlayButton();
  }

  function updatePlayButton() {
    const running = state.anim && !state.anim.paused;
    $('playBtn').textContent = running ? '⏸ Пауза' : state.anim ? '▶ Продовжити' : '▶ Анімувати';
    $('playBtn').setAttribute('aria-pressed', running ? 'true' : 'false');
  }

  function setStatus(text) {
    $('status').textContent = text;
  }

  /* ------------------------------------------------------------------ інформаційні панелі */

  const fmt = (v, d = 4) => (Number.isFinite(v) ? (Math.abs(v) >= 1e5 || (Math.abs(v) < 1e-4 && v !== 0) ? v.toExponential(2) : v.toFixed(d)) : '—').replace('-', '−');

  function renderInfo() {
    const M = state.model;
    const f = M.fit;
    $('mInfo').textContent = M.mEff !== state.m ? `(для ${M.x.length} точок m обмежено до ${M.mEff})` : '';
    $('lagFormula').textContent = `p${sub(M.x.length - 1)}(x) = ${A.formatPolynomial(A.toXCoefficients(newtonToPower(M), 0, 1), 4)}`;
    $('mnkFormula').textContent = `g(x) = ${A.formatPolynomial(f.coeffsX, 4)}`;

    $('metricsBody').innerHTML = [
      ['Степінь полінома', `${M.x.length - 1}`, `${M.mEff}`],
      ['SSE = Σ r²ᵢ (у вузлах)', '0 (за побудовою)', fmt(f.metrics.sse, 6)],
      ['RMSE', '0', fmt(f.metrics.rmse, 5)],
      ['max |rᵢ|', '0', fmt(f.metrics.maxAbs, 5)],
      ['R²', '1', fmt(f.metrics.r2, 5)],
      ['max |f − g_ref| на [x₀; xₙ]', fmt(M.lagDevRef, 5), fmt(M.mnkDevRef, 5)],
      ['Розмах кривої (max − min)', fmt(M.lagAmplitude, 4), fmt(A.rangeOf(f.fn, M.x0, M.xn).max - A.rangeOf(f.fn, M.x0, M.xn).min, 4)],
      ['cond₂(A) дизайн-матриці', '—', fmt(f.cond, 2)],
    ].map((r) => `<tr><th scope="row">${r[0]}</th><td>${r[1]}</td><td>${r[2]}</td></tr>`).join('');

    // точки та залишки
    $('pointsBody').innerHTML = M.x.map((x, i) =>
      `<tr><td>${i}</td><td>${fmt(x, 3)}</td><td>${fmt(M.y[i], 3)}</td><td>${fmt(M.lag(x), 4)}</td><td>${fmt(f.fitted[i], 4)}</td><td>${fmt(f.residuals[i], 4)}</td></tr>`).join('');

    // таблиця поділених різниць (Ньютон)
    const tb = M.dd.table;
    const n = M.x.length;
    let head = '<tr><th>i</th><th>xᵢ</th><th>f[xᵢ]</th>';
    for (let k = 1; k < n; k++) head += `<th>${k}-го пор.</th>`;
    $('ddHead').innerHTML = head + '</tr>';
    let body = '';
    for (let i = 0; i < n; i++) {
      body += `<tr><td>${i}</td><td>${fmt(M.x[i], 3)}</td>`;
      for (let k = 0; k < n; k++) body += `<td${i === 0 ? ' class="diag"' : ''}>${tb[k] && tb[k][i] !== undefined ? fmt(tb[k][i], 4) : ''}</td>`;
      body += '</tr>';
    }
    $('ddBody').innerHTML = body;

    $('dataEditor').value = M.x.map((x, i) => `${x} ${M.y[i]}`).join('\n');
    $('datasetTitle').textContent = state.sets[state.n].title;
    $('perfInfo').textContent = `Час: МНК + 500 значень обох поліномів ≈ ${M.computeMs.toFixed(2)} мс`;
    renderComparison();
  }

  function sub(n) {
    return String(n).replace(/\d/g, (d) => '₀₁₂₃₄₅₆₇₈₉'[d]);
  }

  /** Коефіцієнти полінома Ньютона → коефіцієнти за степенями x (для виводу формули). */
  function newtonToPower(M) {
    const { coeffs } = M.dd;
    let poly = [coeffs[coeffs.length - 1]];
    for (let k = coeffs.length - 2; k >= 0; k--) {
      // poly = poly·(x − x_k) + a_k
      const next = new Array(poly.length + 1).fill(0);
      for (let j = 0; j < poly.length; j++) {
        next[j + 1] += poly[j];
        next[j] -= poly[j] * M.x[k];
      }
      next[0] += coeffs[k];
      poly = next;
    }
    return poly;
  }

  /* ------------------------------------------------------------------ 6 графіків порівняння */

  const miniPlots = {};

  function renderComparison() {
    const c = colors();
    const rows = [];
    for (const kind of ['lagrange', 'mnk']) {
      for (const n of [5, 10, 20]) {
        const id = `mini-${kind}-${n}`;
        const canvas = $(id);
        if (!canvas) continue;
        if (!miniPlots[id]) miniPlots[id] = new window.Plot(canvas, { compact: true, onResize: () => renderComparison() });
        const P = miniPlots[id];
        P.resize();
        const M = n === state.n ? state.model : buildModel(state.sets[n], state.m, state.normalize);
        const fn = kind === 'lagrange' ? M.lag : M.fit.fn;
        const curve = { fn, from: M.x0, to: M.xn };
        P.bounds = S.computeBounds([{ xs: M.x, ys: M.y }], [curve]);
        P.clear();
        P.drawAxes();
        P.drawCurve(fn, M.x0, M.xn, { color: kind === 'lagrange' ? c.lag : c.mnk, width: 2 });
        if (kind === 'mnk') P.drawResidualSegments(M.x, M.y, M.fit.fitted, null, c.res);
        P.drawPoints(M.x, M.y);
        const cap = $(`${id}-cap`);
        if (cap) {
          cap.textContent = kind === 'lagrange'
            ? `степінь ${M.x.length - 1} · max|p − g_ref| = ${fmt(M.lagDevRef, 3)}`
            : `m = ${M.mEff} · RMSE = ${fmt(M.fit.metrics.rmse, 4)} · R² = ${fmt(M.fit.metrics.r2, 4)}`;
        }
        canvas.closest('figure').classList.toggle('current', n === state.n && (state.mode === 'all' || state.mode === kind));
        rows.push({ kind, n, M });
      }
    }
    // підсумкова таблиця порівняльного аналізу
    $('compareBody').innerHTML = [5, 10, 20].map((n) => {
      const M = rows.find((r) => r.n === n).M;
      return `<tr><td>${n}</td><td>${n - 1}</td><td>${fmt(M.lagDevRef, 4)}</td><td>${fmt(M.lagAmplitude, 3)}</td>`
        + `<td>${M.mEff}</td><td>${fmt(M.fit.metrics.rmse, 4)}</td><td>${fmt(M.fit.metrics.r2, 4)}</td><td>${fmt(M.mnkDevRef, 4)}</td><td>${fmt(M.fit.cond, 1)}</td></tr>`;
    }).join('');
  }

  /* ------------------------------------------------------------------ підказки */

  function onMove(ev) {
    const r = mainCanvas.getBoundingClientRect();
    const px = ev.clientX - r.left;
    const py = ev.clientY - r.top;
    if (!mainPlot.bounds || !mainPlot.inPlot(px, py)) return onLeave();
    const M = state.model;
    // найближчий вузол у радіусі 12 px
    let node;
    let best = 144;
    M.x.forEach((x, i) => {
      const d = (mainPlot.px(x) - px) ** 2 + (mainPlot.py(M.y[i]) - py) ** 2;
      if (d < best) { best = d; node = i; }
    });
    const { x } = mainPlot.toData(px, py);
    state.hover = node !== undefined ? { node } : { x };
    const showLag = state.mode !== 'mnk';
    const showMnk = state.mode !== 'lagrange';
    let html;
    if (node !== undefined) {
      html = `<b>Вузол ${node}</b><br>x = ${fmt(M.x[node], 4)}<br>y = ${fmt(M.y[node], 4)}`;
      if (showLag) html += `<br><span class="sw lag"></span>p(x) = ${fmt(M.lag(M.x[node]), 4)} · похибка 0`;
      if (showMnk) html += `<br><span class="sw mnk"></span>ŷ = ${fmt(M.fit.fitted[node], 4)}<br><span class="sw res"></span>r = y − ŷ = ${fmt(M.fit.residuals[node], 5)}`;
    } else {
      html = `x = ${fmt(x, 4)}`;
      const inside = x >= M.x0 && x <= M.xn;
      if (showLag) html += `<br><span class="sw lag"></span>Лагранж p(x) = ${fmt(M.lag(x), 4)}`;
      if (showMnk) html += `<br><span class="sw mnk"></span>МНК g(x) = ${fmt(M.fit.fn(x), 4)}`;
      if (showLag && showMnk) html += `<br>|p − g| = ${fmt(Math.abs(M.lag(x) - M.fit.fn(x)), 4)}`;
      if (!inside) html += '<br><i>екстраполяція</i>';
    }
    tooltip.innerHTML = html;
    tooltip.hidden = false;
    const tw = tooltip.offsetWidth;
    const left = px + 16 + tw > r.width ? px - tw - 12 : px + 16;
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${Math.max(4, py - 10)}px`;
    requestDraw();
  }

  function onLeave() {
    if (!state.hover && tooltip.hidden) return;
    state.hover = null;
    tooltip.hidden = true;
    requestDraw();
  }

  /* ------------------------------------------------------------------ події UI */

  function setDataset(n) {
    if (state.n === n) return;
    state.n = n;
    stopAnimation();
    document.querySelectorAll('button[data-n]').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.n === n)));
    recompute();
    setStatus(`Набір: ${state.sets[n].title}. Осі масштабуються автоматично.`);
    requestDraw();
  }

  function setMode(mode) {
    state.mode = mode;
    stopAnimation();
    document.querySelectorAll('button[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
    document.body.dataset.mode = mode;
    renderComparison();
    requestDraw();
  }

  function bind() {
    document.querySelectorAll('button[data-n]').forEach((b) => b.addEventListener('click', () => setDataset(+b.dataset.n)));
    document.querySelectorAll('button[data-mode]').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
    $('degree').addEventListener('change', (e) => {
      state.m = +e.target.value;
      stopAnimation();
      recompute();
      requestDraw();
    });
    $('normalize').addEventListener('change', (e) => { state.normalize = e.target.checked; recompute(); requestDraw(); });
    $('extrap').addEventListener('change', (e) => { state.extrap = e.target.checked; requestDraw(); });
    $('showRef').addEventListener('change', (e) => { state.showRef = e.target.checked; requestDraw(); });
    $('speed').addEventListener('input', (e) => { state.speed = +e.target.value; $('speedOut').textContent = `${state.speed}×`; });
    $('playBtn').addEventListener('click', () => (state.anim && !state.anim.paused ? pause() : play()));
    $('resetBtn').addEventListener('click', () => { stopAnimation(); setStatus('Показано остаточні криві.'); requestDraw(); });

    $('applyData').addEventListener('click', () => {
      try {
        const p = A.parsePoints($('dataEditor').value);
        state.sets[state.n] = { title: `Власний набір (${p.x.length} точок) у слоті ${state.n}`, x: p.x, y: p.y };
        $('dataError').textContent = '';
        stopAnimation();
        recompute();
        requestDraw();
      } catch (e) {
        $('dataError').textContent = e.message;
      }
    });
    $('resetData').addEventListener('click', () => {
      state.sets[state.n] = JSON.parse(JSON.stringify(ORIGINAL[state.n]));
      $('dataError').textContent = '';
      recompute();
      requestDraw();
    });

    document.querySelectorAll('.mini figure').forEach((fig) => fig.addEventListener('click', () => {
      setDataset(+fig.dataset.n);
      setMode(fig.dataset.kind);
      mainCanvas.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }));

    mainCanvas.addEventListener('mousemove', onMove);
    mainCanvas.addEventListener('mouseleave', onLeave);

    document.addEventListener('keydown', (e) => {
      if (e.target.matches('textarea, input, select')) return;
      if (e.key === '1') setDataset(5);
      if (e.key === '2') setDataset(10);
      if (e.key === '3') setDataset(20);
      if (e.key === ' ') { e.preventDefault(); $('playBtn').click(); }
    });

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => { renderComparison(); requestDraw(); });
  }

  /* ------------------------------------------------------------------ старт */
  bind();
  recompute();
  setDataset(5);
  requestDraw();
  // доступ для автоматизованої перевірки (скріншоти/тести у браузері)
  window.__app = { state, setDataset, setMode, play, pause, stopAnimation, requestDraw };
})();
