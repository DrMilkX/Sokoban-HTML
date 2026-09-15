/* Browser smoke test (not shipped). node tools/smoke-test.js */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const URL = 'file://' + path.join(__dirname, '..', 'index.html');
const KEY = { '-1,0': 'ArrowLeft', '1,0': 'ArrowRight', '0,-1': 'ArrowUp', '0,1': 'ArrowDown' };

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1180, height: 900 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));

  const ok = (label, cond, extra) =>
    console.log((cond ? 'PASS  ' : 'FAIL  ') + label + (extra ? '  ' + extra : ''));

  await page.goto(URL);
  await page.waitForTimeout(400);
  ok('win overlay hidden on load', !(await page.locator('#winOverlay').isVisible()));
  ok('hint arrow hidden on load', !(await page.locator('#hintArrow').isVisible()));

  // --- render ---
  const tiles = await page.locator('.tile').count();
  const crates = await page.locator('.crate').count();
  ok('board renders tiles', tiles === 9 * 8, 'tiles=' + tiles);
  ok('crates rendered', crates === 2, 'crates=' + crates);
  ok('title', (await page.locator('#levelTitle').textContent()) === 'Level 0');
  ok('par shown', (await page.locator('#statPar').textContent()) === '8');

  // --- play level 0 with the A* solution via the keyboard ---
  const actions = await page.evaluate(() =>
    Sokoban.solveAStar(Sokoban.fromLines(LEVELS.main_levels[0].map), 200000).actions);
  for (const a of actions) { await page.keyboard.press(KEY[a.x + ',' + a.y]); await page.waitForTimeout(12); }
  await page.waitForTimeout(250);
  const winShown = await page.locator('#winOverlay').isVisible();
  ok('keyboard play reaches win', winShown);
  ok('move counter', (await page.locator('#statMoves').textContent()) === String(actions.length));
  ok('best recorded', (await page.locator('#statBest').textContent()) === String(actions.length));
  ok('win subtitle', /exactly par|moves/.test(await page.locator('#winSub').textContent()),
     JSON.stringify(await page.locator('#winSub').textContent()));

  await page.screenshot({ path: '../_shot_win.png' });

  // --- next level from the overlay ---
  await page.click('#winNext');
  await page.waitForTimeout(250);
  ok('advances to level 1', (await page.locator('#levelTitle').textContent()) === 'Level 1');
  ok('overlay hidden', !(await page.locator('#winOverlay').isVisible()));
  ok('solved dot persisted', await page.locator('.lvl.solved').count() === 1);

  // --- undo / reset ---
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(120);
  const m2 = await page.locator('#statMoves').textContent();
  await page.keyboard.press('u');
  await page.waitForTimeout(120);
  ok('undo decrements', +(await page.locator('#statMoves').textContent()) === +m2 - 1);
  await page.keyboard.press('r');
  await page.waitForTimeout(120);
  ok('reset zeroes moves', (await page.locator('#statMoves').textContent()) === '0');
  ok('undo disabled at start', await page.locator('#btnUndo').isDisabled());

  // --- hint ---
  await page.click('#btnHint');
  await page.waitForTimeout(200);
  ok('hint arrow visible', await page.locator('#hintArrow').isVisible());
  const hintNote = await page.locator('#solveNote').textContent();
  ok('hint note', /A\* says go/.test(hintNote), JSON.stringify(hintNote));

  // --- watch A* solve, on a level with a few crates ---
  await page.evaluate(() => document.querySelectorAll('.lvl')[24].click());
  await page.waitForTimeout(250);
  ok('jumped to level 24', (await page.locator('#levelTitle').textContent()) === 'Level 24');
  await page.click('#btnSolve');
  await page.waitForTimeout(200);
  const solveNote = await page.locator('#solveNote').textContent();
  ok('solve note reports nodes', /nodes expanded/.test(solveNote), JSON.stringify(solveNote));
  ok('solve button becomes Stop', (await page.locator('#btnSolve').textContent()) === 'Stop');
  await page.screenshot({ path: '../_shot_solving.png' });
  await page.waitForTimeout(9000);
  ok('A* playback wins', await page.locator('#winOverlay').isVisible());
  ok('win title is A*', (await page.locator('#winTitle').textContent()) === 'A* solved it');

  // --- deadlock detection: shove a crate into a corner, then ask for a hint ---
  await page.evaluate(() => document.querySelectorAll('.tabs button')[1].click());
  await page.waitForTimeout(200);
  ok('gen tab loads', (await page.locator('#levelTitle').textContent()) === 'Generated level 0');
  ok('gen level count', await page.locator('.lvl').count() === 21);

  // --- filters ---
  await page.evaluate(() => document.querySelectorAll('#filters button')[1].click());
  await page.waitForTimeout(150);
  const warm = await page.locator('.lvl').count();
  ok('warm-up filter narrows list', warm > 0 && warm < 21, 'warmup=' + warm);
  await page.evaluate(() => document.querySelectorAll('#filters button')[0].click());
  await page.waitForTimeout(150);
  ok('all filter restores', await page.locator('.lvl').count() === 21);

  // --- theme toggle ---
  await page.click('#themeBtn');
  await page.waitForTimeout(150);
  ok('theme toggles to dark', (await page.getAttribute('html', 'data-theme')) === 'dark');
  await page.screenshot({ path: '../_shot_dark.png' });
  await page.click('#themeBtn');
  await page.waitForTimeout(150);
  ok('theme toggles back', (await page.getAttribute('html', 'data-theme')) === 'light');

  // --- no horizontal scroll at phone width ---
  await page.setViewportSize({ width: 390, height: 780 });
  await page.waitForTimeout(400);
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok('no horizontal overflow at 390px', overflow <= 0, 'overflow=' + overflow);
  await page.screenshot({ path: '../_shot_mobile.png', fullPage: false });

  // --- widest level fits ---
  await page.setViewportSize({ width: 1180, height: 900 });
  await page.evaluate(() => document.querySelectorAll('.tabs button')[0].click());
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    // find the widest level and open it
    let best = 0, w = 0;
    LEVELS.main_levels.forEach((l, i) => { if (l.map[0].length > w) { w = l.map[0].length; best = i; } });
    document.querySelectorAll('.lvl')[best].click();
  });
  await page.waitForTimeout(300);
  const fits = await page.evaluate(() => {
    const b = document.getElementById('board');
    return b.getBoundingClientRect().width <= b.parentElement.getBoundingClientRect().width;
  });
  ok('widest board fits its frame', fits);
  await page.screenshot({ path: '../_shot_wide.png' });

  console.log(errors.length ? 'CONSOLE ERRORS:\n' + errors.join('\n') : 'no console errors');
  await browser.close();
})();
