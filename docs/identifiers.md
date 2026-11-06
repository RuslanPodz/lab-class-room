# Таблиці ідентифікаторів

## Змінні та константи

| Ідентифікатор | Тип | Модуль | Призначення |
|---|---|---|---|
| xs, ys | number[] | approx.js | вузли xᵢ та значення yᵢ табличної функції |
| n | number | усі | кількість точок у наборі |
| k, j | number | approx.js | індекси вузлів у формулі Лагранжа (L_k, добуток за j ≠ k) |
| m, mEff | number | approx.js, app.js | заданий і фактичний (≤ n − 1) степінь МНК-полінома |
| c, h | number | approx.js | центр і напівширина відрізка для нормалізації t = (x − c)/h |
| ts | number[] | approx.js | нормалізовані вузли tᵢ ∈ [−1; 1] |
| A | number[][] | approx.js | дизайн-матриця (Вандермонда) розміру n × (m + 1) |
| R, qtb | number[][], number[] | approx.js | верхньотрикутна матриця R та вектор Qᵀb після відбиттів Хаусхолдера |
| v, alpha | number[], number | approx.js | вектор і коефіцієнт відбиття H = I − 2vvᵀ/(vᵀv) |
| theta | number[] | approx.js | коефіцієнти МНК-полінома за степенями t |
| coeffsX | number[] | approx.js | коефіцієнти МНК-полінома за степенями x |
| fitted, residuals | number[] | approx.js | розрахункові значення ŷᵢ і залишки rᵢ = yᵢ − ŷᵢ |
| sse, rmse, r2, maxAbs | number | approx.js | метрики: Σr², √(SSE/n), коефіцієнт детермінації, max\|rᵢ\| |
| cond | number | approx.js | число обумовленості cond₂(A) = σmax/σmin |
| table, coeffs | number[][], number[] | approx.js | таблиця поділених різниць і коефіцієнти Ньютона aₖ |
| state | object | app.js | стан застосунку: n, mode, m, normalize, extrap, speed, sets, model, anim, bounds, hover |
| state.anim | object \| null | app.js | поточна фаза анімації: kind, t, end, rate, queue, paused |
| bounds, target | object | app.js, scale.js | поточні та цільові межі осей {xMin, xMax, yMin, yMax} |
| padX, padY | number | scale.js | відносні відступи меж (0.03 і 0.12 від розмаху) |
| s, g | number | app.js | параметр плавного переходу (smoothstep) у кадрі анімації |
| residFrac | number[] | app.js | частка «намальованості» кожного залишку (0…1) |
| ORIGINAL | object | app.js | незмінні вихідні набори 5/10/20 (для кнопки «Повернути») |

## Функції

| Функція | Модуль | Вхід | Результат |
|---|---|---|---|
| validatePoints(xs, ys) | approx.js | масиви точок | виняток, якщо дані некоректні |
| lagrangeBasis(xs, k, x) | approx.js | вузли, індекс, точка | L_k(x) |
| lagrange(xs, ys, x) | approx.js | вузли, значення, точка | p_n(x) за формулою 4.3 |
| makeLagrange(xs, ys) | approx.js | набір | функція x ↦ p_n(x) |
| dividedDifferences(xs, ys) | approx.js | набір | {table, coeffs} — поділені різниці |
| newtonEval(xs, coeffs, x) | approx.js | вузли, aₖ, точка | значення полінома Ньютона (Горнер) |
| normalization(xs, enabled) | approx.js | вузли | {c, h} |
| designMatrix(ts, m) | approx.js | tᵢ, степінь | матриця A |
| householderLeastSquares(A, b) | approx.js | A, b | θ — МНК-розв'язок через QR |
| leastSquares(xs, ys, m, opt) | approx.js | набір, m | модель МНК: θ, coeffsX, fn, fitted, residuals, metrics, cond |
| normalEquationsSolve(...) | approx.js | набір, m | розв'язок через AᵀA (лише для порівняння стійкості) |
| conditionNumber(A) | approx.js | матриця | cond₂(A) (обертання Якобі для AᵀA) |
| metrics(ys, fitted) | approx.js | y, ŷ | {sse, rmse, r2, maxAbs, mean} |
| maxDeviation(f, g, a, b) | approx.js | дві функції, відрізок | max\|f − g\| на сітці |
| rangeOf(f, a, b) | approx.js | функція, відрізок | {min, max} |
| parsePoints(text) | approx.js | текст форми | {x, y}, відсортовані за x |
| computeBounds(points, curves, opt) | scale.js | видимі об'єкти | межі осей з відступами |
| niceTicks(lo, hi, target) | scale.js | діапазон | {ticks, step} |
| approach(cur, target, k) | scale.js | межі | плавно наближені межі |
| buildModel(set, m, normalize) | app.js | набір | усі обчислення для набору + час |
| buildScene() | app.js | стан | список кривих, точок і залишків поточного кадру |
| frame(ts) | app.js | час кадру | крок анімації, автомасштаб, малювання |
| play(), pause(), stopAnimation() | app.js | — | керування анімацією |
| setDataset(n), setMode(mode) | app.js | 5/10/20; режим | перемикання набору / режиму |
| renderInfo(), renderComparison() | app.js | — | таблиці, формули, 6 мініграфіків |
| onMove(ev), onLeave() | app.js | подія миші | підказка і приціл |

## Об'єкти (класи та модулі)

| Об'єкт | Тип | Відповідальність |
|---|---|---|
| Approx | модуль (UMD) | чисельні методи: Лагранж, Ньютон, МНК, метрики, розбір введення |
| Scale | модуль (UMD) | автомасштаб і поділки осей |
| Plot | клас | рендерер Canvas 2D: осі, сітка, криві, точки, залишки, приціл |
| DATASETS | модуль (UMD) | набори 5/10/20 і еталонна форма g(x) |
| app (IIFE) | модуль | стан, події UI, анімація, зв'язок модулів |
| mainPlot, resPlot, miniPlots | екземпляри Plot | основний графік, діаграма залишків, 6 мініграфіків |
