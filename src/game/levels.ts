import type { LevelDef } from './types';

/**
 * 三幕关卡数据（世界 1200×620，坐标=左上角）。
 * 几何全部经过 engine 单测的抛物线验证：
 * - 不编辑 → 必败（自动跳跃规划找不到落点，坠入虚空或被清理波追上）
 * - 参考解 → 必胜（见 tests/levels.test.ts）
 */

export const WORLD = { width: 1200, height: 620 } as const;

export const PHYSICS = {
  fixedStep: 1 / 60,
  gravity: 1700,
  heroRunSpeed: 195,
  heroJumpImpulse: -690,
  bounceImpulse: -890,
  heroWidth: 30,
  heroHeight: 44,
  coyoteTime: 0.09,
  cleanerSpeed: 36,
  cleanerDelay: 2.5,
  dragTimeScale: 0.22,
  maxFrameDt: 0.1,
  snapThreshold: 30,
  edgeLookahead: 14,
  maxJumpGap: 175,
  hesitateTime: 0.45,
  catchDistance: 18,
  voidY: 720,
} as const;

export const LEVELS: LevelDef[] = [
  // ---------- 第一幕「标题之桥」 ----------
  {
    id: 'ACT1',
    act: 1,
    name: 'STAGE 01 · 标题之桥',
    goal: '把「继续阅读」按钮拖到标题和卡片中间',
    hint: '按住模块右上角的 ≡ 手柄拖动，松手吸附',
    heroStart: { x: 94, feetY: 520 },
    exitX: 1140,
    cleanerSpeed: 36,
    cleanerDelay: 2.5,
    fixed: [
      { id: 'GROUND_A', x: 0, y: 520, w: 195, h: 100, label: '/footer · index' },
      { id: 'GROUND_B', x: 1085, y: 520, w: 115, h: 100, label: '/saved' },
    ],
    modules: [
      {
        id: 'HEADLINE',
        kind: 'solid',
        tag: 'h1',
        label: 'NOT FOUND',
        w: 250,
        h: 64,
        initial: { x: 245, y: 444 },
        anchors: [
          { x: 245, y: 444 },
          { x: 220, y: 450 },
          { x: 300, y: 400 },
        ],
      },
      {
        id: 'BUTTON_CONTINUE',
        kind: 'bounce',
        tag: 'button',
        label: 'CONTINUE →',
        sublabel: '继续阅读',
        w: 215,
        h: 56,
        initial: { x: 650, y: 290 },
        cooldown: 0.5,
        anchors: [
          { x: 650, y: 290 },
          { x: 510, y: 434 },
          { x: 555, y: 416 },
          { x: 620, y: 350 },
        ],
      },
      {
        id: 'ARTICLE_SAVE',
        kind: 'solid',
        tag: 'article',
        label: 'SAVE THIS PAGE',
        sublabel: '这篇文章还想再活一天',
        w: 240,
        h: 65,
        initial: { x: 810, y: 454 },
        anchors: [
          { x: 810, y: 454 },
          { x: 838, y: 451 },
          { x: 898, y: 414 },
        ],
      },
    ],
  },

  // ---------- 第二幕「弹跳阅读」 ----------
  {
    id: 'ACT2',
    act: 2,
    name: 'STAGE 02 · 弹跳阅读',
    goal: '按钮摆到墙前起跳点，借弹跳越过删除墙',
    hint: '踩到按钮会弹起 · 面板右上角可折叠',
    heroStart: { x: 84, feetY: 520 },
    exitX: 1140,
    cleanerSpeed: 42,
    cleanerDelay: 2.0,
    fixed: [
      { id: 'GROUND_A', x: 0, y: 520, w: 190, h: 100, label: '/footer' },
      { id: 'GROUND_B', x: 1080, y: 520, w: 120, h: 100, label: '/saved' },
      { id: 'WALL', x: 740, y: 310, w: 42, h: 210, label: 'DELETE', kind: 'wall' },
    ],
    modules: [
      {
        id: 'TITLE',
        kind: 'solid',
        tag: 'h1',
        label: 'KEEP',
        w: 220,
        h: 62,
        initial: { x: 220, y: 450 },
        anchors: [
          { x: 220, y: 450 },
          { x: 270, y: 450 },
        ],
      },
      {
        id: 'BOUNCE_BUTTON',
        kind: 'bounce',
        tag: 'button',
        label: 'SUBSCRIBE',
        sublabel: '弹跳订阅',
        w: 180,
        h: 44,
        initial: { x: 350, y: 458 },
        cooldown: 0.5,
        anchors: [
          { x: 350, y: 458 },
          { x: 570, y: 452 },
        ],
      },
      {
        id: 'PANEL',
        kind: 'panel',
        tag: 'article',
        label: 'ARCHIVE · 档案面板',
        sublabel: '右上角 ⇕ 可折叠',
        w: 250,
        h: 80,
        initial: { x: 780, y: 430 },
        collapsedH: 42,
        anchors: [{ x: 780, y: 430 }],
      },
    ],
  },

  // ---------- 第三幕「响应式风暴」 ----------
  {
    id: 'ACT3',
    act: 3,
    name: 'STAGE 03 · 响应式风暴',
    goal: '切换布局模式，让目录重排成一座桥',
    hint: '右上角 LAYOUT 开关：gallery 杂志目录 ↔ bridge 阶梯',
    heroStart: { x: 84, feetY: 520 },
    exitX: 1140,
    cleanerSpeed: 50,
    cleanerDelay: 2.0,
    fixed: [
      { id: 'GROUND_A', x: 0, y: 520, w: 185, h: 100, label: '/footer' },
      { id: 'GROUND_B', x: 1090, y: 520, w: 110, h: 100, label: '/saved' },
    ],
    modules: [],
    grid: {
      id: 'GRID',
      blocks: [
        { id: 'GB1', label: 'A-01', w: 150, h: 46 },
        { id: 'GB2', label: 'B-02', w: 150, h: 46 },
        { id: 'GB3', label: 'C-03', w: 150, h: 46 },
        { id: 'GB4', label: 'D-04', w: 150, h: 46 },
        { id: 'GB5', label: 'E-05', w: 150, h: 46 },
      ],
      modes: {
        // 杂志目录：散乱排布，从 GROUND/B1 出发全部够不着 → 必须切换
        gallery: {
          rects: [
            { x: 230, y: 470 },
            { x: 560, y: 340 },
            { x: 700, y: 280 },
            { x: 430, y: 270 },
            { x: 830, y: 300 },
          ],
        },
        // 阶梯：40 间距 30 落差的连续桥 → 可通行
        bridge: {
          rects: [
            { x: 230, y: 470 },
            { x: 420, y: 440 },
            { x: 610, y: 410 },
            { x: 800, y: 380 },
            { x: 960, y: 350 },
          ],
        },
      },
    },
  },
];
