'use strict';
/**
 * Автоматичне знімання скріншотів для звіту (Playwright).
 * Запуск: node scripts/screenshots.js  → docs/screenshots/*.png
 */
const path = require('path');
const { chromium } = require('playwright');
const OUT = path.join(__dirname, '..', 'docs', 'screenshots');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1360, height: 950 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.join(__dirname, '..', 'index.html'));
  await page.waitForTimeout(600);
  const card = page.locator('.chart-card');
  const settle = () => page.waitForTimeout(900);
  const freeze = async (kind, t) => {
    await page.evaluate(([k, tt]) => {
      const app = window.__app;
      app.play();
      if (app.state.anim.kind !== k) {
        // перейти до потрібної фази (у режимі «Усі» друга фаза — МНК)
        const next = app.state.anim.queue.shift();
        app.state.anim = { ...next, queue: [], paused: false };
      }
      app.pause();
      app.state.anim.t = tt;
      app.requestDraw();
    }, [kind, t]);
    await settle();
  };

  // 1. Загальний вигляд
  await page.screenshot({ path: `${OUT}/01_overview.png`, fullPage: true });

  // 2. Шість графіків: Лагранж і МНК для 5/10/20
  for (const mode of ['lagrange', 'mnk']) {
    for (const n of [5, 10, 20]) {
      await page.evaluate(([m, nn]) => { window.__app.setDataset(nn); window.__app.setMode(m); }, [mode, n]);
      await settle();
      await card.screenshot({ path: `${OUT}/02_${mode}_${n}.png` });
    }
  }

  // 3. Режим «Усі» для 10 точок + підказка над вузлом
  await page.evaluate(() => { window.__app.setDataset(10); window.__app.setMode('all'); });
  await settle();
  const box = await page.locator('#mainChart').boundingBox();
  const pt = await page.evaluate(() => {
    const s = window.__app.state;
    return { x: s.model.x[3], y: s.model.y[3] };
  });
  const pix = await page.evaluate(({ x, y }) => {
    // координати вузла 3 у пікселях полотна
    const b = window.__app.state.bounds;
    const c = document.getElementById('mainChart').getBoundingClientRect();
    const px = 58 + ((x - b.xMin) / (b.xMax - b.xMin)) * (c.width - 58 - 18);
    const py = c.height - 44 - ((y - b.yMin) / (b.yMax - b.yMin)) * (c.height - 16 - 44);
    return { px, py };
  }, pt);
  await page.mouse.move(box.x + pix.px, box.y + pix.py);
  await page.waitForTimeout(300);
  await card.screenshot({ path: `${OUT}/03_all_10_tooltip.png` });
  await page.mouse.move(box.x + box.width * 0.62, box.y + box.height * 0.5);
  await page.waitForTimeout(300);
  await card.screenshot({ path: `${OUT}/03b_all_10_crosshair.png` });
  await page.mouse.move(0, 0);

  // 4. Кадри анімації Лагранжа (10 точок): після 3, 6 вузлів
  await page.evaluate(() => window.__app.setMode('lagrange'));
  for (const t of [2.5, 5.5, 8.4]) {
    await freeze('lagrange', t);
    await card.screenshot({ path: `${OUT}/04_anim_lagrange_10_t${String(t).replace('.', '_')}.png` });
  }
  // 5. Кадри анімації МНК (10 точок)
  await page.evaluate(() => { window.__app.stopAnimation(); window.__app.setMode('mnk'); });
  for (const t of [0.35, 0.8, 1.5]) {
    await freeze('mnk', t);
    await card.screenshot({ path: `${OUT}/05_anim_mnk_10_t${String(t).replace('.', '_')}.png` });
  }
  await page.evaluate(() => window.__app.stopAnimation());

  // 6. Автомасштаб під час анімації 20 точок (Лагранж)
  await page.evaluate(() => { window.__app.setDataset(20); window.__app.setMode('lagrange'); });
  for (const t of [12.5, 18.6]) {
    await freeze('lagrange', t);
    await card.screenshot({ path: `${OUT}/06_autoscale_20_t${String(t).replace('.', '_')}.png` });
  }
  await page.evaluate(() => window.__app.stopAnimation());

  // 7. Екстраполяція (10 точок, усі)
  await page.evaluate(() => { window.__app.setDataset(10); window.__app.setMode('all'); });
  await page.check('#extrap');
  await settle();
  await card.screenshot({ path: `${OUT}/07_extrapolation_10.png` });
  await page.uncheck('#extrap');
  await settle();

  // 8. Панель порівняння (6 графіків + таблиця) і панелі метрик
  await page.evaluate(() => window.__app.setDataset(20));
  await settle();
  await page.locator('section.card').last().screenshot({ path: `${OUT}/08_comparison.png` });
  await page.locator('.panels').screenshot({ path: `${OUT}/09_panels_20.png` });
  await page.locator('details.dd summary').click();
  await page.evaluate(() => window.__app.setDataset(5));
  await settle();
  await page.locator('details.dd').screenshot({ path: `${OUT}/10_divided_differences_5.png` });

  // 11. Мобільна ширина
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await mobile.goto('file://' + path.join(__dirname, '..', 'index.html'));
  await mobile.waitForTimeout(700);
  await mobile.screenshot({ path: `${OUT}/11_mobile.png` });
  const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

  // 12. Темна тема
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.evaluate(() => { window.__app.setMode('all'); window.__app.requestDraw(); });
  await settle();
  await card.screenshot({ path: `${OUT}/12_dark_theme.png` });

  console.log(JSON.stringify({ errors, mobileOverflowPx: overflow }));
  await browser.close();
})();
