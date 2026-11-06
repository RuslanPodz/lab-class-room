/**
 * approx.js — математичне ядро лабораторної роботи № 1.
 *  • інтерполяційний поліном Лагранжа (формула 4.3);
 *  • поліном Ньютона з таблицею поділених різниць (формула 4.4);
 *  • МНК-апроксимація поліномом степеня m через QR-розклад Хаусхолдера
 *    (без нормальних рівнянь), з нормалізацією x → t ∈ [−1; 1];
 *  • метрики якості (SSE, RMSE, R², max|r|).
 * Працює у браузері (глобальний Approx) і в Node.js (module.exports).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Approx = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------------------------------------------------------------- перевірки */

  /** Перевіряє набір точок: однакова довжина, скінченні числа, різні вузли. */
  function validatePoints(xs, ys) {
    if (!Array.isArray(xs) || !Array.isArray(ys)) throw new TypeError('xs та ys мають бути масивами');
    if (xs.length !== ys.length) throw new RangeError('Кількість x і y не збігається');
    if (xs.length < 2) throw new RangeError('Потрібно щонайменше 2 точки');
    for (let i = 0; i < xs.length; i++) {
      if (!Number.isFinite(xs[i]) || !Number.isFinite(ys[i])) {
        throw new TypeError(`Точка ${i + 1}: значення мають бути скінченними числами`);
      }
    }
    const sorted = [...xs].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] === sorted[i - 1]) throw new RangeError(`Вузли мають бути різними (x = ${sorted[i]} повторюється)`);
    }
  }

  /* ---------------------------------------------------------------- Лагранж */

  /** Базисний поліном L_k(x) = Π_{j≠k} (x − x_j)/(x_k − x_j). */
  function lagrangeBasis(xs, k, x) {
    let l = 1;
    for (let j = 0; j < xs.length; j++) {
      if (j !== k) l *= (x - xs[j]) / (xs[k] - xs[j]);
    }
    return l;
  }

  /** Значення інтерполяційного полінома Лагранжа p_n(x) = Σ y_k·L_k(x). */
  function lagrange(xs, ys, x) {
    let s = 0;
    for (let k = 0; k < xs.length; k++) s += ys[k] * lagrangeBasis(xs, k, x);
    return s;
  }

  /** Повертає функцію-поліном Лагранжа для набору (зручно для побудови кривих). */
  function makeLagrange(xs, ys) {
    validatePoints(xs, ys);
    const X = xs.slice();
    const Y = ys.slice();
    return (x) => lagrange(X, Y, x);
  }

  /* ---------------------------------------------------------------- Ньютон */

  /**
   * Таблиця поділених різниць: table[k][i] = f[x_i, …, x_{i+k}].
   * Коефіцієнти полінома Ньютона — верхня діагональ: a_k = table[k][0].
   */
  function dividedDifferences(xs, ys) {
    validatePoints(xs, ys);
    const n = xs.length;
    const table = [ys.slice()];
    for (let k = 1; k < n; k++) {
      const prev = table[k - 1];
      const col = [];
      for (let i = 0; i < n - k; i++) col.push((prev[i + 1] - prev[i]) / (xs[i + k] - xs[i]));
      table.push(col);
    }
    return { table, coeffs: table.map((col) => col[0]) };
  }

  /** Значення полінома Ньютона за схемою Горнера. */
  function newtonEval(xs, coeffs, x) {
    let v = coeffs[coeffs.length - 1];
    for (let k = coeffs.length - 2; k >= 0; k--) v = v * (x - xs[k]) + coeffs[k];
    return v;
  }

  /* ---------------------------------------------------------------- МНК */

  /** Параметри нормалізації: t = (x − c)/h, щоб t ∈ [−1; 1]. */
  function normalization(xs, enabled = true) {
    if (!enabled) return { c: 0, h: 1 };
    const lo = Math.min(...xs);
    const hi = Math.max(...xs);
    return { c: (lo + hi) / 2, h: (hi - lo) / 2 || 1 };
  }

  /** Дизайн-матриця (матриця Вандермонда) A[i][j] = t_i^j, j = 0..m. */
  function designMatrix(ts, m) {
    return ts.map((t) => {
      const row = new Array(m + 1);
      row[0] = 1;
      for (let j = 1; j <= m; j++) row[j] = row[j - 1] * t;
      return row;
    });
  }

  /**
   * Розв'язує перевизначену систему A·θ ≈ b у сенсі найменших квадратів
   * QR-розкладом Хаусхолдера: A = Q·R, θ = R⁻¹·(Qᵀb).
   * Повертає θ і діагональ R (для оцінки обумовленості).
   */
  function householderLeastSquares(A, b) {
    const rows = A.length;
    const cols = A[0].length;
    if (rows < cols) throw new RangeError(`Для степеня m = ${cols - 1} потрібно щонайменше ${cols} точок`);
    const R = A.map((r) => r.slice());
    const qtb = b.slice();

    for (let k = 0; k < cols; k++) {
      // норма k-го стовпця нижче діагоналі
      let norm = 0;
      for (let i = k; i < rows; i++) norm += R[i][k] * R[i][k];
      norm = Math.sqrt(norm);
      if (norm === 0) throw new RangeError('Матриця вироджена (стовпці лінійно залежні)');
      const alpha = R[k][k] > 0 ? -norm : norm; // знак обрано так, щоб уникнути віднімання близьких чисел
      // вектор відбиття v = x − alpha·e1
      const v = new Array(rows).fill(0);
      for (let i = k; i < rows; i++) v[i] = R[i][k];
      v[k] -= alpha;
      let vv = 0;
      for (let i = k; i < rows; i++) vv += v[i] * v[i];
      if (vv === 0) continue;
      // H = I − 2·v·vᵀ/(vᵀv) застосовується до стовпців R та до b
      for (let j = k; j < cols; j++) {
        let s = 0;
        for (let i = k; i < rows; i++) s += v[i] * R[i][j];
        const f = (2 * s) / vv;
        for (let i = k; i < rows; i++) R[i][j] -= f * v[i];
      }
      let s = 0;
      for (let i = k; i < rows; i++) s += v[i] * qtb[i];
      const f = (2 * s) / vv;
      for (let i = k; i < rows; i++) qtb[i] -= f * v[i];
    }

    // зворотна підстановка R·θ = (Qᵀb)[0..cols)
    const theta = new Array(cols).fill(0);
    for (let i = cols - 1; i >= 0; i--) {
      let s = qtb[i];
      for (let j = i + 1; j < cols; j++) s -= R[i][j] * theta[j];
      if (Math.abs(R[i][i]) < 1e-14) throw new RangeError('Матриця погано обумовлена або вироджена');
      theta[i] = s / R[i][i];
    }
    return { theta };
  }

  /** Обчислює поліном Σ θ_j·t^j за Горнером. */
  function polyEval(theta, t) {
    let v = 0;
    for (let j = theta.length - 1; j >= 0; j--) v = v * t + theta[j];
    return v;
  }

  /** Перерахунок коефіцієнтів з t = (x − c)/h у звичайні коефіцієнти за степенями x. */
  function toXCoefficients(theta, c, h) {
    const m = theta.length - 1;
    const out = new Array(m + 1).fill(0);
    // ((x − c)/h)^j = Σ_k C(j,k)·x^k·(−c)^{j−k} / h^j
    for (let j = 0; j <= m; j++) {
      let binom = 1;
      for (let k = 0; k <= j; k++) {
        if (k > 0) binom = (binom * (j - k + 1)) / k;
        out[k] += (theta[j] * binom * (-c) ** (j - k)) / h ** j;
      }
    }
    return out;
  }

  /**
   * МНК-апроксимація поліномом степеня m.
   * @returns {{m, theta, coeffsX, norm, fn, fitted, residuals, metrics, cond}}
   */
  function leastSquares(xs, ys, m, { normalize = true } = {}) {
    validatePoints(xs, ys);
    if (!Number.isInteger(m) || m < 0) throw new RangeError('Степінь m має бути цілим невід’ємним числом');
    if (m > xs.length - 1) throw new RangeError(`Для ${xs.length} точок степінь m не може перевищувати ${xs.length - 1}`);
    const norm = normalization(xs, normalize);
    const ts = xs.map((x) => (x - norm.c) / norm.h);
    const A = designMatrix(ts, m);
    const { theta } = householderLeastSquares(A, ys);
    const fn = (x) => polyEval(theta, (x - norm.c) / norm.h);
    const fitted = xs.map(fn);
    const residuals = ys.map((y, i) => y - fitted[i]);
    return {
      m,
      theta,
      coeffsX: toXCoefficients(theta, norm.c, norm.h),
      norm,
      fn,
      fitted,
      residuals,
      metrics: metrics(ys, fitted),
      cond: conditionNumber(A),
    };
  }

  /**
   * Розв'язок через нормальні рівняння (AᵀA)θ = Aᵀb методом Гаусса.
   * Використовується ЛИШЕ для порівняльного аналізу стійкості в тестах/звіті.
   */
  function normalEquationsSolve(xs, ys, m, { normalize = false } = {}) {
    const norm = normalization(xs, normalize);
    const A = designMatrix(xs.map((x) => (x - norm.c) / norm.h), m);
    const n = m + 1;
    const M = Array.from({ length: n }, (_, i) => {
      const row = new Array(n + 1).fill(0);
      for (let j = 0; j < n; j++) for (let r = 0; r < A.length; r++) row[j] += A[r][i] * A[r][j];
      for (let r = 0; r < A.length; r++) row[n] += A[r][i] * ys[r];
      return row;
    });
    for (let k = 0; k < n; k++) {
      let p = k;
      for (let i = k + 1; i < n; i++) if (Math.abs(M[i][k]) > Math.abs(M[p][k])) p = i;
      [M[k], M[p]] = [M[p], M[k]];
      for (let i = k + 1; i < n; i++) {
        const f = M[i][k] / M[k][k];
        for (let j = k; j <= n; j++) M[i][j] -= f * M[k][j];
      }
    }
    const theta = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
      let s = M[i][n];
      for (let j = i + 1; j < n; j++) s -= M[i][j] * theta[j];
      theta[i] = s / M[i][i];
    }
    return { theta, fn: (x) => polyEval(theta, (x - norm.c) / norm.h) };
  }

  /**
   * Число обумовленості cond₂(A) = σmax/σmin.
   * σ² — власні значення матриці Грама AᵀA, які знаходимо методом обертань Якобі
   * (для матриць розміру ≤ 21×21 це швидко і достатньо точно для оцінки).
   */
  function conditionNumber(A) {
    const n = A[0].length;
    const M = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => {
      let s = 0;
      for (let r = 0; r < A.length; r++) s += A[r][i] * A[r][j];
      return s;
    }));
    for (let sweep = 0; sweep < 100; sweep++) {
      let off = 0;
      for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += M[p][q] ** 2;
      if (off < 1e-30) break;
      for (let p = 0; p < n; p++) {
        for (let q = p + 1; q < n; q++) {
          if (Math.abs(M[p][q]) < 1e-300) continue;
          const theta = (M[q][q] - M[p][p]) / (2 * M[p][q]);
          const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
          const c = 1 / Math.sqrt(t * t + 1);
          const s = t * c;
          for (let k = 0; k < n; k++) {
            const mkp = M[k][p];
            const mkq = M[k][q];
            M[k][p] = c * mkp - s * mkq;
            M[k][q] = s * mkp + c * mkq;
          }
          for (let k = 0; k < n; k++) {
            const mpk = M[p][k];
            const mqk = M[q][k];
            M[p][k] = c * mpk - s * mqk;
            M[q][k] = s * mpk + c * mqk;
          }
        }
      }
    }
    const eig = M.map((row, i) => Math.max(row[i], 0));
    const lo = Math.min(...eig);
    return lo === 0 ? Infinity : Math.sqrt(Math.max(...eig) / lo);
  }

  /* ---------------------------------------------------------------- метрики */

  function metrics(ys, fitted) {
    const n = ys.length;
    const mean = ys.reduce((a, b) => a + b, 0) / n;
    let sse = 0;
    let sst = 0;
    let maxAbs = 0;
    for (let i = 0; i < n; i++) {
      const r = ys[i] - fitted[i];
      sse += r * r;
      sst += (ys[i] - mean) ** 2;
      maxAbs = Math.max(maxAbs, Math.abs(r));
    }
    return { sse, rmse: Math.sqrt(sse / n), r2: sst === 0 ? 1 : 1 - sse / sst, maxAbs, mean };
  }

  /** Рівномірна сітка з count точок на [a; b]. */
  function linspace(a, b, count) {
    if (count < 2) return [a];
    const step = (b - a) / (count - 1);
    return Array.from({ length: count }, (_, i) => (i === count - 1 ? b : a + i * step));
  }

  /** Максимальне відхилення двох функцій на сітці (для порівняння з еталоном). */
  function maxDeviation(f, g, a, b, count = 801) {
    let d = 0;
    for (const x of linspace(a, b, count)) d = Math.max(d, Math.abs(f(x) - g(x)));
    return d;
  }

  /** Діапазон значень функції на відрізку (для автоматичного масштабування). */
  function rangeOf(f, a, b, count = 400) {
    let lo = Infinity;
    let hi = -Infinity;
    for (const x of linspace(a, b, count)) {
      const v = f(x);
      if (Number.isFinite(v)) {
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    }
    return { min: lo, max: hi };
  }

  /**
   * Розбір тексту з точками. Підтримувані формати:
   *  • запис варіанта: «(0, 0.0), (1, 0.5), …»;
   *  • по рядку на точку: «x y», «x; y», «x, y», десяткова кома «0,5 0,8».
   */
  function parsePoints(text) {
    const xs = [];
    const ys = [];
    const src = String(text);
    const num = (s, where) => {
      const v = Number(String(s).trim().replace(',', '.'));
      if (s === undefined || String(s).trim() === '' || !Number.isFinite(v)) {
        throw new SyntaxError(`${where}: «${s ?? ''}» не є числом`);
      }
      return v;
    };
    const pairs = [...src.matchAll(/\(\s*([^()]*?)\s*\)/g)];
    if (pairs.length) {
      pairs.forEach((p, i) => {
        let parts = p[1].split(/\s*[,;]\s+|\s*;\s*|\s+/).filter(Boolean);
        if (parts.length === 1) parts = p[1].split(',');
        if (parts.length !== 2) throw new SyntaxError(`Точка ${i + 1}: очікується «(x, y)», отримано «${p[0]}»`);
        xs.push(num(parts[0], `Точка ${i + 1}`));
        ys.push(num(parts[1], `Точка ${i + 1}`));
      });
    } else {
      const lines = src.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
      lines.forEach((line, i) => {
        let parts = line.split(/[;\s]+/).map((p) => p.replace(/,$/, '')).filter(Boolean);
        if (parts.length === 1) parts = line.split(',');
        if (parts.length !== 2) throw new SyntaxError(`Рядок ${i + 1}: очікується «x y», отримано «${line}»`);
        xs.push(num(parts[0], `Рядок ${i + 1}`));
        ys.push(num(parts[1], `Рядок ${i + 1}`));
      });
    }
    validatePoints(xs, ys);
    // сортуємо за x, щоб анімація додавання вузлів ішла зліва направо
    const idx = xs.map((_, i) => i).sort((a, b) => xs[a] - xs[b]);
    return { x: idx.map((i) => xs[i]), y: idx.map((i) => ys[i]) };
  }

  /** Форматування полінома за коефіцієнтами при степенях x. */
  function formatPolynomial(coeffs, digits = 4) {
    const terms = [];
    for (let j = coeffs.length - 1; j >= 0; j--) {
      const c = coeffs[j];
      if (Math.abs(c) < 10 ** -(digits + 2)) continue;
      const abs = Math.abs(c).toFixed(digits);
      const pow = j === 0 ? '' : j === 1 ? '·x' : `·x^${j}`;
      terms.push({ sign: c < 0 ? '−' : '+', text: abs + pow });
    }
    if (!terms.length) return '0';
    return terms.map((t, i) => (i === 0 ? (t.sign === '−' ? '−' : '') + t.text : ` ${t.sign} ${t.text}`)).join('');
  }

  return {
    validatePoints,
    lagrangeBasis,
    lagrange,
    makeLagrange,
    dividedDifferences,
    newtonEval,
    normalization,
    designMatrix,
    householderLeastSquares,
    polyEval,
    toXCoefficients,
    leastSquares,
    normalEquationsSolve,
    conditionNumber,
    metrics,
    linspace,
    maxDeviation,
    rangeOf,
    parsePoints,
    formatPolynomial,
  };
});
