/** V5 三关求解器验证 + 安全窗口模拟（规格 §19.3 每关正反证据） */
import { describe, expect, it } from 'vitest';
import { LEVELS_V5, generateLevelCss, l3GeometryWithDetails } from '../src/v5/levels';
import { solveLevel } from '../src/v5/LevelValidator';
import { classifyWidth } from '../src/v5/rules';
import type { LevelConfig } from '../src/v5/types';

const L1 = LEVELS_V5[0] as LevelConfig;
const L2 = LEVELS_V5[1] as LevelConfig;
const L3 = LEVELS_V5[2] as LevelConfig;

describe('断点分类与宽度范围', () => {
  it('L1（1050 两档）', () => {
    expect(classifyWidth(1440, L1.cutoffs)).toBe('wide');
    expect(classifyWidth(700, L1.cutoffs)).toBe('compact');
    expect(classifyWidth(1040, L1.cutoffs)).toBe('compact');
  });
  it('L2（1050/800 三档）', () => {
    expect(classifyWidth(1440, L2.cutoffs)).toBe('wide');
    expect(classifyWidth(1000, L2.cutoffs)).toBe('medium');
    expect(classifyWidth(700, L2.cutoffs)).toBe('compact');
  });
  it('M01：wide 与 compact 第一块移动桥 x 相差 ≥150', () => {
    const bWide = L1.geometryByMode.wide.find((p) => p.id === 'cardB')!;
    const bCompact = L1.geometryByMode.compact.find((p) => p.id === 'cardB')!;
    expect(Math.abs(bCompact.x - bWide.x)).toBeGreaterThanOrEqual(150);
  });
});

describe('L1「那座刚刚消失的桥」正反证据（PAR 2）', () => {
  it('两次切换（→手机→电脑）可解，且为最少切换数', () => {
    const r = solveLevel(L1, ['compact', 'wide'], { maxReflows: 2 });
    expect(r.solvable).toBe(true);
    expect(r.actions.map((a) => a.mode)).toEqual(['compact', 'wide']);
  });
  it('反例：不切换不可解', () => {
    expect(solveLevel(L1, [], { maxReflows: 0 }).solvable).toBe(false);
  });
  it('反例：只切一次不可解（残影必要段）', () => {
    const one = solveLevel(L1, ['compact'], { maxReflows: 1 });
    expect(one.solvable).toBe(false);
  });
  it('CSS 含 1050 断点；稳态桥两档同位', () => {
    const css = generateLevelCss(L1);
    expect(css).toContain('@container stage-page (max-width:1050px)');
    const aW = L1.geometryByMode.wide.find((p) => p.id === 'cardA')!;
    const aC = L1.geometryByMode.compact.find((p) => p.id === 'cardA')!;
    expect(aW.x).toBe(aC.x);
  });
});

describe('L2「一段路，两份过去」正反证据', () => {
  it('可解：求解器给出最短参考解（≤4 次切换）', () => {
    const r = solveLevel(L2, ['medium', 'compact', 'wide'], { maxReflows: 4 });
    expect(r.solvable).toBe(true);
    expect(r.actions.length).toBeLessThanOrEqual(4);
    expect(r.actions.length).toBeGreaterThanOrEqual(1);
  });
  it('反例：不切换不可解', () => {
    expect(solveLevel(L2, [], { maxReflows: 0 }).solvable).toBe(false);
  });
});

describe('L3「不要删除那条规则」正反证据', () => {
  it('展开 details 后可解（≤2 次切换）', () => {
    const open = l3GeometryWithDetails(true);
    const r = solveLevel(open, ['compact', 'wide'], { maxReflows: 2 });
    expect(r.solvable).toBe(true);
    expect(r.actions.length).toBeLessThanOrEqual(2);
  });
  it('反例：不展开 details 不可解（规则卡片悬空在错误位置）', () => {
    const closed = l3GeometryWithDetails(false);
    expect(solveLevel(closed, ['compact', 'wide'], { maxReflows: 3 }).solvable).toBe(false);
  });
  it('details 展开使 cardE 位移 240（CSS 兄弟选择器因果）', () => {
    const css = generateLevelCss(L3);
    expect(css).toContain('.rule-details[open] ~ .site-card[data-pid="cardE"]{left:260px}');
    const open = l3GeometryWithDetails(true);
    const closed = l3GeometryWithDetails(false);
    const eOpen = open.geometryByMode.wide.find((p) => p.id === 'cardE')!;
    const eClosed = closed.geometryByMode.wide.find((p) => p.id === 'cardE')!;
    expect(eClosed.x - eOpen.x).toBe(240);
  });
});

describe('清理线公平性', () => {
  it('每关清理线在参考解通关时刻之前不会追上零四', () => {
    for (const lv of [L1, L2, l3GeometryWithDetails(true)]) {
      const modes: Array<'medium' | 'compact' | 'wide'> = lv.id === 'L2' ? ['medium', 'compact', 'wide'] : ['compact', 'wide'];
      const r = solveLevel(lv, modes, { maxReflows: 4 });
      expect(r.solvable).toBe(true);
      const winT = r.winTimeSec;
      const cleanerAt = lv.cleaner.startX + lv.cleaner.speed * winT;
      expect(lv.hero.goalX - cleanerAt).toBeGreaterThan(40);
    }
  });
});

/** 正向模拟（安全切换窗口验证，多组时刻） */
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
    readLiveRects: () =>
      level.geometryByMode[curMode].map((p) => ({ id: p.id, x: p.x, y: 390, w: p.w, h: 48 })),
    applyWidth: () => {},
    worldTime: () => sim.time,
  });
  const queues = [...switches].sort((a, b) => a.atSec - b.atSec);
  const dt = 1 / 60;
  for (let i = 0; i < 60 * 45 && !sim.done; i++) {
    while (queues.length && queues[0]!.atSec <= sim.time) {
      const sw = queues.shift()!;
      const preset = level.presets.find((p) => p.mode === sw.to);
      if (preset) world.commit(preset.width, true);
      curMode = sw.to;
    }
    echo.tick(sim.time);
    sim.tick(dt, {
      platforms: level.geometryByMode[curMode],
      ghosts: echo.active(sim.time),
    });
  }
  return sim.done && sim.hero.x >= level.hero.goalX ? 'won' : 'lost';
}

describe('安全切换窗口（正向模拟）', () => {
  it('L1：两组时刻的 →手机→电脑 序列都能赢', () => {
    expect(simulate(L1, [{ atSec: 1.2, to: 'compact' }, { atSec: 6.2, to: 'wide' }])).toBe('won');
    expect(simulate(L1, [{ atSec: 2.0, to: 'compact' }, { atSec: 6.8, to: 'wide' }])).toBe('won');
  });
  it('L1：只切一次输（掉进残影段之后的裂缝）', () => {
    expect(simulate(L1, [{ atSec: 1.2, to: 'compact' }])).toBe('lost');
  });
  it('L2：两组 W→M→S→M→W 设计路线都能赢（宽窗）', () => {
    expect(
      simulate(L2, [
        { atSec: 1.4, to: 'medium' },
        { atSec: 2.6, to: 'compact' },
        { atSec: 4.6, to: 'medium' },
        { atSec: 6.2, to: 'wide' },
      ]),
    ).toBe('won');
    expect(
      simulate(L2, [
        { atSec: 2.0, to: 'medium' },
        { atSec: 3.4, to: 'compact' },
        { atSec: 5.4, to: 'medium' },
        { atSec: 6.8, to: 'wide' },
      ]),
    ).toBe('won');
  });
  it('L2：少切换的时序大多会输（设计路线才是宽窗）', () => {
    expect(simulate(L2, [{ atSec: 1.4, to: 'medium' }])).toBe('lost');
    expect(simulate(L2, [{ atSec: 2.0, to: 'medium' }])).toBe('lost');
    expect(simulate(L2, [{ atSec: 3.0, to: 'medium' }])).toBe('lost');
  });
  it('L3：展开 details + 两组时序赢；不展开输', () => {
    const open = l3GeometryWithDetails(true);
    expect(
      simulate(open, [{ atSec: 3.2, to: 'compact' }, { atSec: 4.6, to: 'wide' }]),
    ).toBe('won');
    expect(
      simulate(open, [{ atSec: 2.8, to: 'compact' }, { atSec: 5.2, to: 'wide' }]),
    ).toBe('won');
    const closed = l3GeometryWithDetails(false);
    expect(
      simulate(closed, [{ atSec: 3.2, to: 'compact' }, { atSec: 4.6, to: 'wide' }]),
    ).toBe('lost');
  });
});
