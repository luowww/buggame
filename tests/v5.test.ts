/** V5 求解器与残影规则验证（规格 §19.3 每关正反证据） */
import { describe, expect, it } from 'vitest';
import { LEVELS_V5, generateLevelCss } from '../src/v5/levels';
import { solveLevel } from '../src/v5/LevelValidator';
import { classifyWidth } from '../src/v5/rules';
import type { LevelConfig } from '../src/v5/types';

const L1 = LEVELS_V5[0] as LevelConfig;
const L2 = LEVELS_V5[1] as LevelConfig;

describe('断点分类（含迟滞）', () => {
  it('L1：≤680 → compact，>690 → wide，无中间档', () => {
    expect(classifyWidth(840, L1.cutoffs)).toBe('wide');
    expect(classifyWidth(600, L1.cutoffs)).toBe('compact');
    expect(classifyWidth(680, L1.cutoffs)).toBe('compact');
    expect(classifyWidth(700, L1.cutoffs)).toBe('wide');
  });
  it('L2：三档 700/520', () => {
    expect(classifyWidth(840, L2.cutoffs)).toBe('wide');
    expect(classifyWidth(600, L2.cutoffs)).toBe('medium');
    expect(classifyWidth(480, L2.cutoffs)).toBe('compact');
  });
  it('L1 宽屏与窄屏的第一块平台 x 相差 ≥150 世界单位（M01）', () => {
    const aWide = L1.geometryByMode.wide[0]!;
    const aCompact = L1.geometryByMode.compact[0]!;
    expect(aCompact.x - aWide.x).toBeGreaterThanOrEqual(150);
  });
});

describe('L1「那座刚刚消失的桥」正反证据', () => {
  it('M06：一次切换（wide→compact）可以通关', () => {
    const r = solveLevel(L1, ['compact'], { maxReflows: 1 });
    expect(r.solvable).toBe(true);
    expect(r.actions).toHaveLength(1);
    // hero 离开旧桥 pad（485，≈2.0s）后有 0.42s coyote 飞行窗 → 最晚 ≈2.5s 切换
    expect(r.actions[0]!.atSec).toBeLessThanOrEqual(2.6);
    expect(r.actions[0]!.atSec).toBeGreaterThanOrEqual(0.3);
  });
  it('M07：不切换无法通关', () => {
    const r = solveLevel(L1, [], { maxReflows: 0 });
    expect(r.solvable).toBe(false);
  });
  it('CSS：L1 生成的容器查询规则包含 compact 断点', () => {
    const css = generateLevelCss(L1);
    expect(css).toContain('@container stage-page (max-width:690px)');
    expect(css).not.toContain('max-width:0px');
  });
});

describe('L2「一段路，两份过去」正反证据', () => {
  it('W→M→S 序列可解（两代残影接力）', () => {
    const r = solveLevel(L2, ['medium', 'compact'], { maxReflows: 2 });
    expect(r.solvable).toBe(true);
    expect(r.actions.map((a) => a.mode)).toEqual(['medium', 'compact']);
    // 最短通关路径上的两次切换都落在可操作窗口内
    expect(r.actions[0]!.atSec).toBeGreaterThanOrEqual(0.3);
    expect(r.actions[0]!.atSec).toBeLessThanOrEqual(2.5);
    expect(r.actions[1]!.atSec).toBeGreaterThan(r.actions[0]!.atSec);
    expect(r.actions[1]!.atSec).toBeLessThanOrEqual(5.0);
  });
  it('反例：只切一次（W→S 直接跳档）不可通', () => {
    const r = solveLevel(L2, ['compact'], { maxReflows: 1 });
    expect(r.solvable).toBe(false);
  });
  it('反例：不切换不可通', () => {
    const r = solveLevel(L2, [], { maxReflows: 0 });
    expect(r.solvable).toBe(false);
  });
  it('反例：只切 W→M（不到 compact）不可通', () => {
    const r = solveLevel(L2, ['medium'], { maxReflows: 1 });
    expect(r.solvable).toBe(false);
  });
});

/** 正向模拟（规格 §19.3：验证至少两组安全切换时间窗口） */
import { EchoManager } from '../src/v5/EchoManager';
import { BreakpointWorld } from '../src/v5/BreakpointWorld';
import { RunnerSim } from '../src/v5/RunnerSim';
import type { BreakpointId } from '../src/v5/types';

function simulate(level: LevelConfig, switches: Array<{ atSec: number; to: BreakpointId }>): 'won' | 'lost' {
  const echo = new EchoManager();
  const sim = new RunnerSim(level);
  let curMode: BreakpointId = 'wide';
  const world = new BreakpointWorld({
    level,
    echo,
    // 无 DOM 环境：用权威区间表伪装实时读数
    readLiveRects: () =>
      level.geometryByMode[curMode].map((p) => ({ id: p.id, x: p.x, y: 390, w: p.w, h: 48 })),
    applyWidth: () => {},
    worldTime: () => sim.time,
  });
  const queues = [...switches].sort((a, b) => a.atSec - b.atSec);
  const dt = 1 / 60;
  for (let i = 0; i < 60 * 40 && !sim.done; i++) {
    while (queues.length && queues[0]!.atSec <= sim.time) {
      const s = queues.shift()!;
      const preset = level.presets.find((p) => p.mode === s.to);
      if (preset) world.commit(preset.width, true);
      curMode = s.to;
      sim.noteReflow();
    }
    echo.tick(sim.time);
    sim.tick(dt, {
      platforms: level.geometryByMode[curMode],
      ghosts: echo.active(sim.time),
    });
  }
  return sim.done && sim.hero.x >= level.hero.goalX ? 'won' : 'lost';
}

describe('安全切换窗口（正向模拟，多组时刻验证）', () => {
  it('L1：0.8s / 1.4s / 2.4s 三组时刻切换都能赢；3.2s 太晚输', () => {
    expect(simulate(L1, [{ atSec: 0.8, to: 'compact' }])).toBe('won');
    expect(simulate(L1, [{ atSec: 1.4, to: 'compact' }])).toBe('won');
    expect(simulate(L1, [{ atSec: 2.4, to: 'compact' }])).toBe('won');
    expect(simulate(L1, [{ atSec: 3.2, to: 'compact' }])).toBe('lost');
  });
  it('L2：两组 W→M→S 时序都能赢', () => {
    expect(
      simulate(L2, [
        { atSec: 0.7, to: 'medium' },
        { atSec: 2.1, to: 'compact' },
      ]),
    ).toBe('won');
    expect(
      simulate(L2, [
        { atSec: 1.2, to: 'medium' },
        { atSec: 2.8, to: 'compact' },
      ]),
    ).toBe('won');
  });
  it('L2：W→S 直跳（0.8s）输；不切输', () => {
    expect(simulate(L2, [{ atSec: 0.8, to: 'compact' }])).toBe('lost');
    expect(simulate(L2, [])).toBe('lost');
  });
});

describe('权威几何区间表（供 Playwright 校准）', () => {
  it('L1 区间与规格 §6.1 表格一致', () => {
    const g = L1.geometryByMode;
    expect(g.wide.find((p) => p.id === 'cardA')!.x).toBe(260);
    expect(g.wide.find((p) => p.id === 'cardA')!.x + g.wide.find((p) => p.id === 'cardA')!.w).toBe(480);
    expect(g.compact.find((p) => p.id === 'cardA')!.x).toBe(480);
    expect(g.wide.find((p) => p.id === 'cardB')!.x).toBe(715);
    expect(g.compact.find((p) => p.id === 'cardB')!.x).toBe(700);
  });
  it('L2 区间与规格 §7 表格一致', () => {
    const g = L2.geometryByMode;
    expect(g.wide.find((p) => p.id === 'cardA')!.x).toBe(230);
    expect(g.medium.find((p) => p.id === 'cardA')!.x).toBe(430);
    expect(g.compact.find((p) => p.id === 'cardA')!.x).toBe(650);
    expect(g.compact.find((p) => p.id === 'cardB')!.x + g.compact.find((p) => p.id === 'cardB')!.w).toBe(1070);
  });
});
