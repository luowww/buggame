// V5 E2E：几何权威校准（M01/M02）+ 正反例通关（M06/M07/L2）
import { chromium } from 'playwright';

const BASE = 'http://localhost:5373/?debug=1&nvp=1';
const results = [];
const check = (id, ok, detail) => {
  results.push({ id, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${detail}`);
};

const browser = await chromium.launch();

// ---------- 桌面 ----------
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);

// M01：840 vs 600 的 cardA.x 差 ≥150
const rectA_wide = await page.evaluate(() => {
  const r = window.__game.view().livePlatforms().find((p) => p.id === 'cardA');
  return r.x;
});
await page.evaluate(() => window.__game.applyWidth(600));
await page.waitForTimeout(300);
const rectA_compact = await page.evaluate(() => {
  const r = window.__game.view().livePlatforms().find((p) => p.id === 'cardA');
  return r.x;
});
check('M01', rectA_compact - rectA_wide >= 150, `wide cardA.x=${rectA_wide.toFixed(1)} compact=${rectA_compact.toFixed(1)} Δ=${(rectA_compact - rectA_wide).toFixed(1)}`);

// 权威区间表校准：真实 DOMRect 与关卡表一致 ±2
const cal = await page.evaluate(() => {
  const lv = window.__game.level();
  const live = window.__game.view().livePlatforms().map((p) => ({ id: p.id, x: p.x, w: p.w }));
  const mode = window.__game.world().currentMode;
  const ref = lv.geometryByMode[mode];
  return { mode, live, ref };
});
const calOk = cal.live.every((l) => {
  const r = cal.ref.find((q) => q.id === l.id);
  return r && Math.abs(r.x - l.x) <= 2 && Math.abs(r.w - l.w) <= 2;
});
check('CAL', calOk, `${cal.mode} 实测 ${JSON.stringify(cal.live.map((l) => [l.id, Math.round(l.x), Math.round(l.w)]))} vs 表 ${JSON.stringify(cal.ref.map((l) => [l.id, l.x, l.w]))}`);

// M02：跨断点快照 = 切换前位置 ±2
await page.evaluate(() => window.__game.applyWidth(840));
await page.evaluate(() => window.__game.start());
await page.waitForTimeout(500);
const before = await page.evaluate(() => window.__game.view().livePlatforms().find((p) => p.id === 'cardA').x);
await page.evaluate(() => window.__game.applyWidth(600));
await page.waitForTimeout(200);
const ghost = await page.evaluate(() => {
  const g = window.__game.echo().list.find((q) => q.id === 'cardA');
  return g ? g.x : null;
});
check('M02', ghost !== null && Math.abs(ghost - before) <= 2, `切换前 cardA.x=${before.toFixed(1)} 残影 x=${ghost}`);

// M06：L1 一次切换赢（0.9s 时切）
await page.evaluate(() => window.__game.loadLevel(0));
await page.evaluate(() => window.__game.start());
await page.waitForTimeout(900);
await page.evaluate(() => window.__game.applyWidth(600));
await page.waitForFunction(`window.__game.phase() !== 'running'`, { timeout: 20000, polling: 100 });
const phaseWin = await page.evaluate(() => window.__game.phase());
check('M06', phaseWin === 'won', `L1 0.9s 切换 → ${phaseWin}`);

// M07：L1 不切输
await page.evaluate(() => window.__game.loadLevel(0));
await page.evaluate(() => window.__game.start());
await page.waitForFunction(`window.__game.phase() !== 'running'`, { timeout: 20000, polling: 100 });
const phaseLose = await page.evaluate(() => window.__game.phase());
check('M07', phaseLose === 'lost', `L1 不切 → ${phaseLose}`);

// L2：W→M→S 赢
await page.evaluate(() => window.__game.loadLevel(1));
await page.evaluate(() => window.__game.start());
await page.waitForTimeout(700);
await page.evaluate(() => window.__game.applyWidth(600));
await page.waitForTimeout(1400);
await page.evaluate(() => window.__game.applyWidth(480));
await page.waitForFunction(`window.__game.phase() !== 'running'`, { timeout: 25000, polling: 100 });
const l2a = await page.evaluate(() => window.__game.phase());
check('L2-WMS', l2a === 'won', `L2 0.7s→M, 2.1s→S → ${l2a}`);

// L2 反例：W→S 直跳输
await page.evaluate(() => window.__game.loadLevel(1));
await page.evaluate(() => window.__game.start());
await page.waitForTimeout(800);
await page.evaluate(() => window.__game.applyWidth(480));
await page.waitForFunction(`window.__game.phase() !== 'running'`, { timeout: 25000, polling: 100 });
const l2b = await page.evaluate(() => window.__game.phase());
check('L2-WS-fail', l2b === 'lost', `L2 直接切手机 → ${l2b}`);

check('ERR', errors.length === 0, `页面异常 ${errors.length} ${errors.slice(0, 2).join('; ')}`);
await page.screenshot({ path: 'artifacts/v5-desktop.png' });
await ctx.close();

// ---------- 手机 ----------
const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const mpage = await mctx.newPage();
const merrors = [];
mpage.on('pageerror', (e) => merrors.push(e.message));
await mpage.goto(BASE, { waitUntil: 'networkidle' });
await mpage.waitForTimeout(1000);
const overflow = await mpage.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
check('M12', !overflow, `390×844 无横向溢出（scrollWidth=${await mpage.evaluate(() => document.documentElement.scrollWidth)}）`);
const presetSize = await mpage.evaluate(() => {
  const b = document.querySelector('.preset-btn');
  if (!b) return null;
  const r = b.getBoundingClientRect();
  return { w: r.width, h: r.height };
});
check('M10', presetSize && presetSize.w >= 44 && presetSize.h >= 44, `预设按钮 ${JSON.stringify(presetSize)}`);
// 手机可玩：点开始 → 预设切手机 → 赢
await mpage.evaluate(() => window.__game.start());
await mpage.waitForTimeout(800);
await mpage.evaluate(() => window.__game.applyWidth(600));
await mpage.waitForFunction(`window.__game.phase() !== 'running'`, { timeout: 25000, polling: 100 });
const mwin = await mpage.evaluate(() => window.__game.phase());
check('M12-play', mwin === 'won', `手机端 L1 切换 → ${mwin}`);
check('M12-err', merrors.length === 0, `手机页面异常 ${merrors.length}`);
await mpage.screenshot({ path: 'artifacts/v5-mobile.png' });
await mctx.close();
await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n==== ${results.length - failed.length}/${results.length} PASS ====`);
process.exit(failed.length ? 1 : 0);
