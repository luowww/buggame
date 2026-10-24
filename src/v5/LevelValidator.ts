/**
 * LevelValidator：离散 BFS 求解器（规格 §19.2）。
 * dt=0.1s，控制动作 = 切到某断点（或保持），状态键含 tick/mode/x/残影剩余寿命/reflows。
 * 每关必须求出至少一条可行序列；同时验证反例（不用机制不可通）。
 */
import type { BreakpointId, LevelConfig, PlatformInterval } from './types';

interface GhostState {
  gen: number;
  x: number;
  w: number;
  expiresTick: number;
}

interface SearchNode {
  tick: number;
  x: number;
  unsupported: number;
  mode: BreakpointId;
  ghosts: GhostState[];
  refCount: number;
  lastFlipTick: number;
  actions: Array<{ atTick: number; mode: BreakpointId }>;
}

export interface SolveResult {
  solvable: boolean;
  actions: Array<{ atSec: number; mode: BreakpointId }>;
  explored: number;
  winTimeSec: number;
}

const DT = 0.1;
const MAX_TICKS = 260; // 26 秒
const PAD = 5; // 与引擎 SUPPORT_PAD 一致
const MIN_FLIP_TICKS = 3; // 0.28s ≈ 3 tick

function supported(x: number, level: LevelConfig, mode: BreakpointId, ghosts: GhostState[]): boolean {
  for (const f of level.floors) {
    if (x >= f.x - PAD && x <= f.x + f.w + PAD) return true;
  }
  for (const p of level.geometryByMode[mode]) {
    if (x >= p.x - PAD && x <= p.x + p.w + PAD) return true;
  }
  for (const g of ghosts) {
    if (x >= g.x - PAD && x <= g.x + g.w + PAD) return true;
  }
  return false;
}

function spawnGhosts(
  level: LevelConfig,
  from: BreakpointId,
  nowTick: number,
  prevGhosts: GhostState[],
  gen: number,
): GhostState[] {
  const kept = level.geometryByMode[from].filter((p) => p.w >= 40 && p.w <= 400);
  if (!kept.length) return prevGhosts;
  const next = [
    ...prevGhosts.filter((g) => g.expiresTick > nowTick),
    ...kept.map((p) => ({
      gen,
      x: p.x,
      w: p.w,
      expiresTick: nowTick + Math.round(level.ghostTtl / DT),
    })),
  ];
  const gens = [...new Set(next.map((g) => g.gen))];
  if (gens.length > level.maxGhostGen) {
    const drop = Math.min(...gens);
    return next.filter((g) => g.gen !== drop);
  }
  return next;
}

function stepNode(
  level: LevelConfig,
  node: SearchNode,
  targetMode: BreakpointId | null,
  geometry: Record<BreakpointId, PlatformInterval[]>,
): SearchNode | null {
  const isFlip = targetMode !== null && targetMode !== node.mode;
  const tick = node.tick + 1;
  if (isFlip && tick - node.lastFlipTick < MIN_FLIP_TICKS) return null;

  let ghosts = node.ghosts.filter((g) => g.expiresTick > tick);
  let refCount = node.refCount;
  let lastFlip = node.lastFlipTick;
  const mode = targetMode ?? node.mode;
  const actions = isFlip
    ? [...node.actions, { atTick: tick, mode: targetMode as BreakpointId }]
    : node.actions;
  if (isFlip) {
    ghosts = spawnGhosts(level, node.mode, tick, ghosts, refCount + 1);
    refCount++;
    lastFlip = tick;
  }
  void geometry;

  const x = node.x + level.hero.speed * DT;
  // 清理线追上即删（与 RunnerSim 相同阈值）
  const cleanerX =
    level.cleaner && level.cleaner.speed > 0
      ? level.cleaner.startX + level.cleaner.speed * tick * DT
      : -1e9;
  if (x - cleanerX < 16) return null;
  const ok = supported(x, level, mode, ghosts);
  const unsupported = ok ? 0 : node.unsupported + 1;
  if (unsupported * DT > level.hero.coyote) return null;
  if (x >= level.hero.goalX) {
    return { ...node, tick, x, unsupported, mode, ghosts, refCount, lastFlipTick: lastFlip, actions };
  }
  return { tick, x, unsupported, mode, ghosts, refCount, lastFlipTick: lastFlip, actions };
}

function keyOf(n: SearchNode): string {
  const ghostKey = n.ghosts
    .map((g) => `${g.gen}:${g.x}:${Math.max(0, g.expiresTick - n.tick)}`)
    .sort()
    .join('|');
  return `${n.tick}|${n.mode}|${Math.round(n.x / 4)}|${ghostKey}|${n.refCount}`;
}

/** 求解：返回可行动作序列（可能为多条切换）。allowedModes 限定可用的断点档。 */
export function solveLevel(
  level: LevelConfig,
  allowedModes: BreakpointId[],
  opts: { firstMode?: BreakpointId; maxReflows?: number } = {},
): SolveResult {
  const first = opts.firstMode ?? 'wide';
  const maxRef = opts.maxReflows ?? 3;
  const initial: SearchNode = {
    tick: 0,
    x: level.hero.startX,
    unsupported: 0,
    mode: first,
    ghosts: [],
    refCount: 0,
    lastFlipTick: -99,
    actions: [],
  };
  const queue: SearchNode[] = [initial];
  const visited = new Set<string>([keyOf(initial)]);
  let explored = 0;
  while (queue.length) {
    // best-first：优先探索切换更少的分支（快速找到最短解，防止状态爆炸）
    queue.sort((a, b) => a.refCount - b.refCount || a.tick - b.tick);
    const n = queue.shift()!;
    explored++;
    if (n.x >= level.hero.goalX) {
      return {
        solvable: true,
        actions: n.actions.map((a) => ({ atSec: a.atTick * DT, mode: a.mode })),
        explored,
        winTimeSec: n.tick * DT,
      };
    }
    if (n.tick >= MAX_TICKS) continue;
    for (const mode of [null, ...allowedModes] as Array<BreakpointId | null>) {
      if (n.refCount >= maxRef && mode !== null && mode !== n.mode) continue;
      const next = stepNode(level, n, mode, level.geometryByMode);
      if (!next) continue;
      const key = keyOf(next);
      if (visited.has(key)) continue;
      visited.add(key);
      queue.push(next);
    }
  }
  return { solvable: false, actions: [], explored, winTimeSec: 0 };
}
