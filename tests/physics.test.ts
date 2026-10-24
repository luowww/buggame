import { expect, it } from 'vitest';
import { createEngine, isReachable, landingX } from '../src/game/engine';
import { PHYSICS } from '../src/game/levels';

const DT = PHYSICS.fixedStep;

function runUntil(e: ReturnType<typeof createEngine>, cond: () => boolean, maxSec = 40): boolean {
  let t = 0;
  while (t < maxSec) {
    e.tick(DT);
    t += DT;
    if (cond()) return true;
  }
  return false;
}

// ===== 规格 §16.1 物理 12 项 =====

it('P1 横向重叠不足 8 不算落地', () => {
  const e = createEngine(0);
  // 构造：模块在脚下但只有 4px 重叠 → 不落地
  e.setModuleRect('HEADLINE', { x: 132, y: 300, w: 250, h: 64 }); // 右缘 382，英雄 94 起
  // 直接把英雄移到平台边缘 2px 重叠处再坠落
  const hero = e.hero;
  hero.x = 130; // 半宽15 → 右缘145；平台左132 → 重叠13？调到重叠4
  hero.x = 143; // 英雄右缘 158，平台左 132..382 → 重叠 26..？platform左132 < hero左128 → 重叠= min(158,382)-max(128,132)=158-132=26
  // 重叠 26 依然够；用更小平台
  e.setModuleRect('HEADLINE', { x: 152, y: 300, w: 250, h: 64 });
  hero.x = 143; // hero [128,158], plat [152,402] → 重叠 6 < 8
  hero.feetY = 296;
  hero.vy = 10;
  hero.grounded = false;
  hero.groundedOn = null;
  e.tick(DT);
  expect(hero.grounded).toBe(false);
});

it('P2 只有下落穿过顶面才落地（从下方上穿不撞头）', () => {
  const e = createEngine(0);
  const hero = e.hero;
  e.setModuleRect('HEADLINE', { x: 60, y: 300, w: 250, h: 64 });
  hero.x = 100;
  hero.feetY = 380; // 平台顶 300，英雄在下方
  hero.vy = -600; // 向上穿
  hero.grounded = false;
  e.tick(DT);
  // 上穿过程中不应 grounded
  expect(hero.grounded).toBe(false);
});

it('P3 土狼时间存在（离开平台 90ms 内仍可跳）', () => {
  const e = createEngine(0);
  const hero = e.hero;
  // 英雄站在 GROUND_A 右缘外一点点 → 失去支撑 → coyote 设置
  hero.x = 210; // 地面右缘 195，重叠为 0
  hero.grounded = true;
  hero.groundedOn = 'GROUND_A';
  e.tick(DT);
  expect(hero.grounded).toBe(false);
  expect(hero.coyote).toBeGreaterThan(0);
  expect(hero.coyote).toBeLessThanOrEqual(PHYSICS.coyoteTime);
});

it('P4 抛物线求解：落点数学正确', () => {
  // 从 (0,0) 以 vx=195, vy=-690 跳，回到 y=0 的时间
  const lx = landingX(0, 0, 195, -690, 0);
  expect(lx).not.toBeNull();
  // 对称抛物线：往返时间 2*690/1700=0.8118s → 距离 ≈158.3
  expect(lx!).toBeCloseTo(158.3, 0);
  // 落到更低平台 (+100)
  const lx2 = landingX(0, 0, 195, -690, 100);
  expect(lx2!).toBeGreaterThan(lx!);
});

it('P5 目标过高不可达', () => {
  // 最大跳高 140：目标 top 高 200 以上 → 无下降交点
  const r = isReachable(0, 520, { x: 60, y: 520 - 200, w: 200, h: 40 });
  expect(r).toBeNull();
});

it('P6 超过最大跳距不可达', () => {
  const r = isReachable(0, 520, { x: 400, y: 520, w: 100, h: 40 });
  expect(r).toBeNull();
});

it('P7 弹跳只有一次（0.5s 冷却内再踩不弹）', () => {
  const e = createEngine(0);
  // 把按钮放到脚下路径
  e.setModuleRect('BUTTON_CONTINUE', { x: 60, y: 400, w: 215, h: 56 });
  const hero = e.hero;
  void hero;
  hero.x = 100;
  hero.feetY = 399; // 按钮顶 400 上一线
  hero.vy = 50;
  hero.grounded = false;
  hero.groundedOn = null;
  e.tick(DT);
  expect(hero.vy).toBeLessThan(-800); // 第一次弹起
  const bounces = e.drainEvents().filter((ev) => ev.type === 'HERO_BOUNCE').length;
  expect(bounces).toBe(1);
  // 立刻再落一次（模拟冷却内）
  hero.vy = 50;
  hero.feetY = 399;
  hero.grounded = false;
  e.tick(DT);
  // 冷却内 → 作为实体平台落地
  expect(hero.grounded).toBe(true);
});

it('P8 拖拽时全局慢放 0.22', () => {
  const e = createEngine(0);
  expect(e.timeScale()).toBe(1);
  e.beginDrag('BUTTON_CONTINUE');
  expect(e.phase()).toBe('DRAGGING');
  expect(e.timeScale()).toBeCloseTo(0.22, 5);
});

it('P9 清理线追上角色 → FAIL 一次', () => {
  const e = createEngine(0);
  // 清理波 2.5s 后以 36/s 推进；英雄被高台卡住最终坠落/被追
  e.setModuleRect('HEADLINE', { x: 300, y: 200, w: 250, h: 64 });
  const ok = runUntil(e, () => e.phase() === 'LEVEL_FAIL', 60);
  expect(ok).toBe(true);
  expect(e.phase()).toBe('LEVEL_FAIL');
  const fails = e.drainEvents().filter((ev) => ev.type === 'LEVEL_FAIL');
  // 后续 tick 不再结算
  for (let i = 0; i < 120; i++) e.tick(DT);
  expect(e.drainEvents().filter((ev) => ev.type === 'LEVEL_FAIL').length).toBe(0);
  void fails;
});

it('P10 出口判定优先于清理（同帧先赢）', () => {
  const e = createEngine(0);
  const hero = e.hero;
  hero.x = e.level.exitX + 5;
  hero.feetY = 520;
  e.tick(DT);
  expect(e.phase()).toBe('LEVEL_SUCCESS');
});

it('P11 坠入虚空 → FAIL(fall)', () => {
  const e = createEngine(0);
  const hero = e.hero;
  hero.x = 300; // 地面 A 右侧外
  hero.grounded = false;
  hero.groundedOn = null;
  hero.vy = 0;
  const ok = runUntil(e, () => e.phase() === 'LEVEL_FAIL', 10);
  expect(ok).toBe(true);
  expect(e.phase()).toBe('LEVEL_FAIL');
});

it('P12 合法锚点释放计一次 edit；原槽/取消不计', () => {
  const e = createEngine(0);
  e.beginDrag('BUTTON_CONTINUE');
  e.previewDrag(-90, 120); // 靠近 (555,416)？
  // 初始 (650,290)，移到 (560,410) → 距 (555,416) ≈ 8 < 30 → snap
  const r = e.finishDrag();
  expect(r).toBe('snap');
  expect(e.edits()).toBe(1);
  // 再拖回原位
  e.beginDrag('BUTTON_CONTINUE');
  e.previewDrag(90, -120);
  const r2 = e.finishDrag();
  expect(r2).toBe('snap');
  expect(e.edits()).toBe(2);
  // 原地小拖动 → 取消不计
  e.beginDrag('HEADLINE');
  e.previewDrag(2, 2);
  const r3 = e.finishDrag();
  expect(r3).toBe('cancel');
  expect(e.edits()).toBe(2);
});

it('P13 pointercancel 语义：finishDrag 无锚点回原槽', () => {
  const e = createEngine(0);
  e.beginDrag('BUTTON_CONTINUE');
  e.previewDrag(400, 300); // 拖到荒谬位置
  const before = JSON.stringify(e.modules().find((m) => m.id === 'BUTTON_CONTINUE')!.rect);
  e.finishDrag();
  const after = JSON.stringify(e.modules().find((m) => m.id === 'BUTTON_CONTINUE')!.rect);
  expect(before).not.toBe(after); // 弹回
  expect(e.edits()).toBe(0);
  expect(e.phase()).toBe('RUNNING');
});

it('P14 平台携带：拖动中的平台带着角色走', () => {
  const e = createEngine(0);
  const hero = e.hero;
  hero.x = 300;
  hero.feetY = 444;
  hero.grounded = true;
  hero.groundedOn = 'HEADLINE';
  e.beginDrag('HEADLINE');
  e.previewDrag(40, 0);
  e.tick(DT);
  expect(hero.groundedOn).toBe('HEADLINE');
  expect(hero.x).toBeGreaterThan(300);
});

it('P15 面板折叠：高度真实变化并计 edit', () => {
  const e = createEngine(1);
  const panel = e.modules().find((m) => m.id === 'PANEL')!;
  expect(panel.rect.h).toBe(80);
  e.togglePanel('PANEL');
  expect(panel.rect.h).toBe(42);
  expect(e.edits()).toBe(1);
  e.togglePanel('PANEL');
  expect(panel.rect.h).toBe(80);
  expect(e.edits()).toBe(2);
});

it('P16 网格切换：矩形集合真实改变（引擎驱动 0.26s 重排动画）', () => {
  const e = createEngine(2);
  expect(e.gridMode()).toBe('gallery');
  const g0 = e.gridRects()[1]!.x;
  e.setGridMode('bridge');
  expect(e.gridMode()).toBe('bridge');
  expect(e.gridTweenActive()).toBe(true);
  expect(e.edits()).toBe(1);
  // 动画期间坐标已在插值
  let steps = 0;
  while (e.gridTweenActive() && steps < 100) {
    e.tick(1 / 60);
    steps++;
  }
  expect(steps).toBeGreaterThan(4); // 经历了过渡帧
  expect(e.gridRects()[1]!.x).not.toBe(g0);
  expect(e.gridRects()[1]!.x).toBeCloseTo(420, 0); // bridge 目标位
});

it('P17 isReachable 对正常台阶可达', () => {
  const r = isReachable(100, 520, { x: 160, y: 490, w: 150, h: 46 });
  expect(r).not.toBeNull();
});
