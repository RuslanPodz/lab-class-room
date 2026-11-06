'use strict';
/**
 * Інтеграційні / системні тести веб-інтерфейсу в headless-браузері (Playwright).
 * Якщо Playwright не встановлено, тести пропускаються.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

let chromium;
try { ({ chromium } = require('playwright')); } catch { chromium = null; }
const skip = chromium ? false : 'Playwright не встановлено (npm i -D playwright)';

test('UI: сторінка, перемикання наборів, автомасштаб, анімація', { skip, timeout: 60000 }, async (t) => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.join(__dirname, '..', 'index.html'));
  await page.waitForTimeout(500);
  const st = () => page.evaluate(() => {
    const s = window.__app.state;
    return { n: s.n, mode: s.mode, bounds: s.bounds, anim: s.anim && { kind: s.anim.kind, t: s.anim.t }, points: s.model.x.length };
  });

  await t.test('UI-01 стартовий стан: 5 точок, режим «Усі», без помилок', async () => {
    const s = await st();
    assert.equal(s.n, 5);
    assert.equal(s.points, 5);
    assert.equal(s.mode, 'all');
    assert.deepEqual(errors, []);
  });

  await t.test('UI-02 перемикання 5/10/20 миттєво змінює модель і межі осей', async () => {
    for (const n of [10, 20, 5]) {
      await page.click(`button[data-n="${n}"]`);
      await page.waitForTimeout(700);
      const s = await st();
      assert.equal(s.points, n);
    }
    await page.click('button[data-n="20"]');
    await page.click('button[data-mode="lagrange"]');
    await page.waitForTimeout(1200);
    assert.ok((await st()).bounds.yMax > 20, 'для 20 точок вісь y має вмістити осциляцію до ≈23');
  });

  await t.test('UI-03 під час анімації межі завжди охоплюють видиму криву', async () => {
    await page.click('button[data-n="10"]');
    await page.click('button[data-mode="all"]');
    await page.click('#playBtn');
    for (let i = 0; i < 6; i++) {
      await page.waitForTimeout(400);
      const ok = await page.evaluate(() => {
        const s = window.__app.state;
        const b = s.bounds;
        return s.model.y.every((y) => y >= b.yMin - 0.05 && y <= b.yMax + 0.05);
      });
      assert.ok(ok, 'точки поза видимою зоною');
    }
    const s = await st();
    assert.equal(s.anim.kind, 'lagrange');
    assert.ok(s.anim.t > 1, 'анімація просувається');
  });

  await t.test('UI-04 клацання поза кнопками не зупиняє анімацію (регресія)', async () => {
    await page.mouse.click(5, 5);
    await page.waitForTimeout(200);
    assert.ok((await st()).anim, 'анімація має тривати');
    await page.click('#resetBtn');
    assert.equal((await st()).anim, null);
  });

  await t.test('UI-05 введення власного набору та повідомлення про помилку', async () => {
    await page.fill('#dataEditor', '(0, 1), (1, 1)\n');
    await page.click('#applyData');
    assert.equal((await st()).points, 2);
    await page.fill('#dataEditor', '1 2\n1 3');
    await page.click('#applyData');
    assert.match(await page.textContent('#dataError'), /різними/);
    await page.click('#resetData');
    assert.equal((await st()).points, 10);
  });

  await t.test('UI-06 6 мініграфіків намальовано, на мобільній ширині немає горизонтальної прокрутки', async () => {
    assert.equal(await page.locator('.mini canvas').count(), 6);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(400);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 0, `горизонтальне переповнення ${overflow}px`);
    assert.deepEqual(errors, []);
  });

  await browser.close();
});
