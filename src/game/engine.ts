import { LEVELS, PHYSICS, WORLD } from './levels';
import type {
  Anchor,
  GameEvent,
  HeroState,
  LevelDef,
  ModuleState,
  Rect,
} from './types';

/**
 * 纯逻辑引擎：权威数值。不 import DOM/Phaser。
 * DOM 桥每帧把测量到的真实矩形喂进来（setModuleRect / setGridRects），
 * 引擎用这些矩形裁决一切碰撞。
 */

export interface Engine {
  readonly level: LevelDef;
  readonly hero: HeroState;
  phase(): string;
  snapshot(): EngineSnapshot;
  tick(dt: number): void;
  beginDrag(moduleId: string): boolean;
  previewDrag(dx: number, dy: number): void;
  finishDrag(): 'snap' | 'cancel';
  togglePanel(moduleId: string): void;
  setGridMode(mode: 'gallery' | 'bridge'): void;
  gridMode(): 'gallery' | 'bridge';
  setModuleRect(id: string, rect: Rect): void;
  setGridRects(rects: Rect[]): void;
  timeScale(): number;
  cleanerX(): number;
  edits(): number;
  gameTime(): number;
  modules(): ModuleState[];
  gridRects(): Rect[];
  gridTweenActive(): boolean;
  drainEvents(): GameEvent[];
  /** 调试/测试：直接把模块放到指定锚点 */
  placeAtAnchor(moduleId: string, anchorIndex: number): void;
}

export interface EngineSnapshot {
  phase: string;
  heroX: number;
  heroFeetY: number;
  cleanerX: number;
  edits: number;
}

interface FixedState extends Rect {
  id: string;
  label: string;
  kind: 'solid' | 'wall';
  erased: boolean;
}

const HERO_HALF: number = PHYSICS.heroWidth / 2;

function rectsOverlap(a: Rect, b: Rect): number {
  const left = Math.max(a.x, b.x);
  const right = Math.min(a.x + a.w, b.x + b.w);
  return right - left;
}

/**
 * 抛物线落点求解（规格书 §10.3）：
 * 从 (x0, feetY0) 以 vx 向右起跳 vy，求下降段穿过目标 top 的时刻，
 * 返回落点 x；无解返回 null。
 */
export function landingX(
  x0: number,
  feetY0: number,
  vx: number,
  vy: number,
  targetTop: number,
): number | null {
  const dy = targetTop - feetY0; // 向下为正
  const disc = vy * vy + 2 * PHYSICS.gravity * dy;
  if (disc < 0) return null;
  // 下降段根：vy<0 起跳，落点取较大根
  const t = (-vy + Math.sqrt(disc)) / PHYSICS.gravity;
  if (t <= 0) return null;
  return x0 + vx * t;
}

export function isReachable(
  x0: number,
  feetY0: number,
  target: Rect,
): number | null {
  const lx = landingX(x0, feetY0, PHYSICS.heroRunSpeed, PHYSICS.heroJumpImpulse, target.y);
  if (lx === null) return null;
  // 中心落在平台 x 范围（含半身容差，保证 overlap>=8）
  if (lx < target.x - HERO_HALF + 8 || lx > target.x + target.w + HERO_HALF - 8) return null;
  // 水平间距约束
  if (target.x - x0 > PHYSICS.maxJumpGap || target.x + target.w < x0 - 4) return null;
  const t = (lx - x0) / PHYSICS.heroRunSpeed;
  if (t > 1.4) return null;
  return lx;
}

export function createEngine(levelIndex: number): Engine {
  const level: LevelDef = LEVELS[levelIndex]!;

  // ---- 模块状态 ----
  const mods: ModuleState[] = level.modules.map((m) => {
    const rect: Rect = { x: m.initial.x, y: m.initial.y, w: m.w, h: m.h };
    const initAnchor = m.anchors.findIndex(
      (a) => Math.abs(a.x - m.initial.x) <= 0.5 && Math.abs(a.y - m.initial.y) <= 0.5,
    );
    return {
      id: m.id,
      kind: m.kind,
      rect: { ...rect },
      anchorIndex: initAnchor >= 0 ? initAnchor : -1,
      homeRect: { ...rect },
      collapsed: false,
      expandedH: m.h,
      collapsedH: m.collapsedH ?? m.h,
      cooldown: 0,
      erased: false,
      moving: false,
      prevRect: { ...rect },
      locked: m.locked ?? false,
    };
  });
  const modDef = new Map(level.modules.map((m) => [m.id, m]));

  // ---- 固定平台 ----
  const fixed: FixedState[] = level.fixed.map((f) => ({
    ...f,
    erased: false,
    kind: f.kind ?? 'solid',
  }));

  // ---- 网格（第三幕） ----
  let gridMode: 'gallery' | 'bridge' = 'gallery';
  let gridRects: Rect[] = level.grid
    ? level.grid.modes.gallery.rects.map((r, i) => ({
        x: r.x,
        y: r.y,
        w: level.grid!.blocks[i]!.w,
        h: level.grid!.blocks[i]!.h,
      }))
    : [];
  let gridPrev: Rect[] = gridRects.map((r) => ({ ...r }));
  // 重排过渡：引擎内驱动（后台标签页 CSS transition 会冻结，物理不能依赖它）
  let gridTween: { from: Rect[]; to: Rect[]; t: number; dur: number } | null = null;
  const gridIds: string[] = level.grid ? level.grid.blocks.map((b) => b.id) : [];

  // ---- 状态 ----
  let phase:
    | 'BOOT' | 'MENU' | 'INTRO' | 'READY' | 'RUNNING' | 'DRAGGING'
    | 'PAUSED' | 'LEVEL_SUCCESS' | 'LEVEL_FAIL' | 'VICTORY' = 'RUNNING';
  let gameTime = 0;
  let edits = 0;
  let endLocked = false;
  let cleanerWarned = false;

  const hero: HeroState = {
    x: level.heroStart.x,
    feetY: level.heroStart.feetY,
    vx: PHYSICS.heroRunSpeed,
    vy: 0,
    grounded: true,
    groundedOn: 'GROUND_A',
    coyote: 0,
    hesitate: 0,
    hesitateStage: 0,
    facing: 1,
    squash: 0,
    blinkTimer: 1.6,
    blinkL: 0,
    blinkR: 0,
    step: 0,
    airTime: 0,
  };

  const cleaner = { x: -80, delay: level.cleanerDelay, speed: level.cleanerSpeed, active: false };

  // 拖拽
  let dragModule: string | null = null;
  let dragStartAnchor = -1;
  let dragGrab = { x: 0, y: 0 };

  const events: GameEvent[] = [];
  const emit = (type: GameEvent['type'], data?: Record<string, unknown>): void => {
    events.push({ type, data });
  };

  // ---- 平台集合（含固定 + 模块 + 网格块） ----
  interface Plat extends Rect {
    id: string;
    kind: 'solid' | 'bounce' | 'panel';
    cooldown: number;
  }
  const platforms = (): Plat[] => {
    const out: Plat[] = [];
    for (const f of fixed) {
      if (!f.erased) out.push({ ...f, kind: f.kind === 'wall' ? 'solid' : 'solid', cooldown: 0 });
    }
    for (const m of mods) {
      if (m.erased) continue;
      out.push({ x: m.rect.x, y: m.rect.y, w: m.rect.w, h: m.rect.h, id: m.id, kind: m.kind, cooldown: m.cooldown });
    }
    gridRects.forEach((r, i) => {
      out.push({ ...r, id: gridIds[i] ?? `G${i}`, kind: 'solid', cooldown: 0 });
    });
    return out;
  };

  const platById = (id: string | null): Plat | null => {
    if (!id) return null;
    return platforms().find((p) => p.id === id) ?? null;
  };

  // ---- 携带：平台移动时带角色 ----
  const applyCarry = (): void => {
    if (!hero.groundedOn) return;
    for (const m of mods) {
      if (m.id !== hero.groundedOn) continue;
      const dx = m.rect.x - m.prevRect.x;
      const dy = m.rect.y - m.prevRect.y;
      if (dx !== 0 || dy !== 0) {
        const cappedDx = Math.max(-120, Math.min(120, dx));
        const cappedDy = Math.max(-120, Math.min(120, dy));
        hero.x += cappedDx;
        hero.feetY += cappedDy;
      }
      return;
    }
    const gi = gridIds.indexOf(hero.groundedOn);
    if (gi >= 0) {
      const dx = gridRects[gi]!.x - gridPrev[gi]!.x;
      const dy = gridRects[gi]!.y - gridPrev[gi]!.y;
      const cappedDx = Math.max(-120, Math.min(120, dx));
      const cappedDy = Math.max(-120, Math.min(120, dy));
      hero.x += cappedDx;
      hero.feetY += cappedDy;
    }
  };

  // ---- 自动跳跃规划 ----
  const planJump = (): void => {
    const current = platById(hero.groundedOn);
    const rightEdge = current ? current.x + current.w : hero.x;
    const distToEdge = rightEdge - hero.x;
    if (distToEdge > PHYSICS.edgeLookahead || distToEdge < -4) return;

    // 找前方可落平台：最近可到达者
    let best: { plat: Plat; lx: number } | null = null;
    for (const p of platforms()) {
      if (p.id === hero.groundedOn) continue;
      if (p.x + p.w < rightEdge - 6) continue; // 只看前方
      if (p.y > hero.feetY + 200) continue; // 太低不主动跳（会自然走落）
      const lx = isReachable(hero.x, hero.feetY, p);
      if (lx !== null) {
        if (!best || lx < best.lx) best = { plat: p, lx };
      }
    }
    if (best) {
      hero.vy = PHYSICS.heroJumpImpulse;
      hero.grounded = false;
      hero.groundedOn = null;
      hero.coyote = 0;
      hero.hesitate = 0;
      hero.hesitateStage = 0;
      emit('HERO_JUMP', { from: hero.x, target: best.plat.id });
    } else if (hero.hesitateStage === 0) {
      hero.hesitateStage = 1;
      hero.hesitate = PHYSICS.hesitateTime;
    }
  };

  // ---- 主 tick ----
  const tick = (dt: number): void => {
    if (dt <= 0) return;
    if (phase !== 'RUNNING' && phase !== 'DRAGGING') return;
    gameTime += dt;

    // 清理波
    if (!cleaner.active) {
      cleaner.delay -= dt;
      if (cleaner.delay <= 0) cleaner.active = true;
    } else {
      cleaner.x += cleaner.speed * dt;
    }

    // 擦除被清理线吞掉的模块
    for (const m of mods) {
      if (!m.erased && m.rect.x + m.rect.w < cleaner.x) {
        m.erased = true;
        if (hero.groundedOn === m.id) {
          hero.grounded = false;
          hero.groundedOn = null;
          hero.coyote = PHYSICS.coyoteTime;
        }
        emit('ERASE_MODULE', { id: m.id });
      }
    }
    for (const f of fixed) {
      if (!f.erased && f.x + f.w < cleaner.x) {
        f.erased = true;
        if (hero.groundedOn === f.id) {
          hero.grounded = false;
          hero.groundedOn = null;
          hero.coyote = PHYSICS.coyoteTime;
        }
      }
    }
    // 清理波逼近警告
    if (!cleanerWarned && cleaner.active && hero.x - cleaner.x < 240) {
      cleanerWarned = true;
      emit('CLEANER_NEAR', { dist: hero.x - cleaner.x });
    }

    // 冷却
    for (const m of mods) if (m.cooldown > 0) m.cooldown = Math.max(0, m.cooldown - dt);

    // 网格重排动画推进（ease-expo 曲线与 CSS 一致）
    if (gridTween) {
      gridTween.t += dt;
      const raw = Math.min(1, gridTween.t / gridTween.dur);
      const e = raw >= 1 ? 1 : 1 - Math.pow(2, -10 * raw);
      gridRects = gridTween.from.map((f, i) => {
        const t = gridTween!.to[i]!;
        return { x: f.x + (t.x - f.x) * e, y: f.y + (t.y - f.y) * e, w: t.w, h: t.h };
      });
      if (raw >= 1) gridTween = null;
    }

    // 携带（拖动/重排中的平台）
    applyCarry();
    for (const m of mods) m.prevRect = { ...m.rect };
    gridPrev = gridRects.map((r) => ({ ...r }));

    // ---- 角色水平移动（犹豫机制） ----
    if (hero.grounded && hero.hesitateStage === 1) {
      hero.hesitate -= dt;
      hero.vx = 0;
      if (hero.hesitate <= 0) {
        hero.hesitateStage = 2; // 继续跑（可能坠落）
        hero.vx = PHYSICS.heroRunSpeed;
      }
    } else {
      hero.vx = PHYSICS.heroRunSpeed;
      hero.facing = 1;
    }

    hero.x += hero.vx * dt;

    // ---- 垂直物理 ----
    const prevFeet = hero.feetY;
    if (!hero.grounded) {
      hero.vy += PHYSICS.gravity * dt;
      hero.feetY += hero.vy * dt;
      hero.airTime += dt;
      if (hero.coyote > 0) hero.coyote -= dt;
    } else {
      hero.airTime = 0;
    }

    // ---- 单向平台碰撞（仅下落穿过顶面） ----
    if (!hero.grounded && hero.vy >= 0) {
      const heroBox: Rect = { x: hero.x - HERO_HALF, y: hero.feetY - PHYSICS.heroHeight, w: PHYSICS.heroWidth, h: PHYSICS.heroHeight };
      let landed: Plat | null = null;
      for (const p of platforms()) {
        if (prevFeet <= p.y + 1 && hero.feetY >= p.y) {
          const ov = rectsOverlap(heroBox, p);
          if (ov >= 8) {
            if (!landed || p.y < landed.y) landed = p;
          }
        }
      }
      if (landed) {
        hero.feetY = landed.y;
        if (landed.kind === 'bounce' && landed.cooldown <= 0) {
          hero.vy = PHYSICS.bounceImpulse;
          hero.grounded = false;
          hero.groundedOn = landed.id;
          hero.airTime = 0;
          const m = mods.find((mm) => mm.id === landed!.id);
          if (m) m.cooldown = modDef.get(landed.id)?.cooldown ?? 0.5;
          hero.squash = -0.5;
          emit('HERO_BOUNCE', { id: landed.id });
        } else {
          hero.vy = 0;
          hero.grounded = true;
          hero.groundedOn = landed.id;
          hero.squash = 0.42;
          hero.hesitateStage = 0;
          emit('HERO_LAND', { id: landed.id, x: hero.x });
        }
      }
    } else if (hero.grounded) {
      // 站立检测：平台还在脚下吗
      const p = platById(hero.groundedOn);
      const heroBox: Rect = { x: hero.x - HERO_HALF, y: hero.feetY - PHYSICS.heroHeight, w: PHYSICS.heroWidth, h: PHYSICS.heroHeight };
      if (!p || rectsOverlap(heroBox, p) < 4 || Math.abs(hero.feetY - p.y) > 2) {
        hero.grounded = false;
        hero.groundedOn = null;
        hero.coyote = PHYSICS.coyoteTime;
        hero.vy = 0;
        emit('HERO_FALL_START', { x: hero.x });
      }
    }

    // ---- 自动跳跃 ----
    if (hero.grounded) planJump();

    // ---- 眨眼动画计时 ----
    hero.blinkTimer -= dt;
    if (hero.blinkTimer <= 0) {
      hero.blinkTimer = 1.4 + Math.random() * 2.2;
      hero.blinkL = 0.14;
      hero.blinkR = 0.1;
    }
    if (hero.blinkL > 0) hero.blinkL -= dt;
    if (hero.blinkR > 0) hero.blinkR -= dt;
    if (hero.grounded && hero.vx > 0) hero.step += dt * 14;
    if (hero.squash !== 0) hero.squash *= Math.max(0, 1 - dt * 9);

    // ---- 胜负裁决 ----
    if (endLocked) return;
    if (hero.x >= level.exitX && hero.feetY <= 560) {
      endLocked = true;
      if (level.act === 3) {
        phase = 'VICTORY';
        emit('VICTORY', { edits, time: gameTime });
      } else {
        phase = 'LEVEL_SUCCESS';
        emit('LEVEL_SUCCESS', { act: level.act, edits, time: gameTime });
      }
      return;
    }
    if (cleaner.active && hero.x - cleaner.x <= PHYSICS.catchDistance) {
      endLocked = true;
      phase = 'LEVEL_FAIL';
      emit('LEVEL_FAIL', { reason: 'caught', cleanerX: cleaner.x, heroX: hero.x });
      return;
    }
    if (hero.feetY > PHYSICS.voidY) {
      endLocked = true;
      phase = 'LEVEL_FAIL';
      emit('LEVEL_FAIL', { reason: 'fall', x: hero.x });
      return;
    }
    if (hero.x > WORLD.width + 60) {
      endLocked = true;
      phase = 'LEVEL_FAIL';
      emit('LEVEL_FAIL', { reason: 'fall', x: hero.x });
    }
  };

  // ---- 拖拽 ----
  const beginDrag = (moduleId: string): boolean => {
    if (phase !== 'RUNNING') return false;
    const m = mods.find((mm) => mm.id === moduleId);
    if (!m || m.locked || m.erased) return false;
    dragModule = moduleId;
    dragStartAnchor = m.anchorIndex;
    dragGrab = { x: m.rect.x, y: m.rect.y };
    m.moving = true;
    phase = 'DRAGGING';
    emit('DRAG_START', { id: moduleId });
    return true;
  };

  const previewDrag = (dx: number, dy: number): void => {
    if (!dragModule) return;
    const m = mods.find((mm) => mm.id === dragModule);
    if (!m) return;
    m.rect.x = Math.max(-40, Math.min(WORLD.width - 20, dragGrab.x + dx));
    m.rect.y = Math.max(30, Math.min(WORLD.height - 20, dragGrab.y + dy));
  };

  const finishDrag = (): 'snap' | 'cancel' => {
    if (!dragModule) return 'cancel';
    const m = mods.find((mm) => mm.id === dragModule);
    if (!m) return 'cancel';
    m.moving = false;
    const def = modDef.get(m.id)!;
    // 找吸附锚点
    let bestIdx = -1;
    let bestDist: number = PHYSICS.snapThreshold;
    def.anchors.forEach((a: Anchor, i: number) => {
      const d = Math.hypot(a.x - m!.rect.x, a.y - m!.rect.y);
      if (d <= bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    });
    if (bestIdx >= 0 && bestIdx !== dragStartAnchor) {
      m.rect.x = def.anchors[bestIdx]!.x;
      m.rect.y = def.anchors[bestIdx]!.y;
      m.anchorIndex = bestIdx;
      edits++;
      phase = 'RUNNING';
      dragModule = null;
      emit('DRAG_SNAP', { id: m.id, anchor: bestIdx, edits });
      return 'snap';
    }
    // 回到拖拽起始锚点
    if (dragStartAnchor >= 0) {
      m.rect.x = def.anchors[dragStartAnchor]!.x;
      m.rect.y = def.anchors[dragStartAnchor]!.y;
    } else {
      m.rect.x = dragGrab.x;
      m.rect.y = dragGrab.y;
    }
    phase = 'RUNNING';
    dragModule = null;
    emit('DRAG_CANCEL', { id: m.id });
    return 'cancel';
  };

  const placeAtAnchor = (moduleId: string, anchorIndex: number): void => {
    const m = mods.find((mm) => mm.id === moduleId);
    const def = modDef.get(moduleId);
    if (!m || !def) return;
    const a = def.anchors[anchorIndex];
    if (!a) return;
    const wasSame = m.anchorIndex === anchorIndex;
    m.rect.x = a.x;
    m.rect.y = a.y;
    m.anchorIndex = anchorIndex;
    if (!wasSame) edits++;
  };

  const togglePanel = (moduleId: string): void => {
    const m = mods.find((mm) => mm.id === moduleId);
    if (!m || m.kind !== 'panel') return;
    m.collapsed = !m.collapsed;
    m.rect.h = m.collapsed ? m.collapsedH : m.expandedH;
    edits++;
    emit('PANEL_TOGGLE', { id: moduleId, collapsed: m.collapsed });
  };

  const setGridMode = (mode: 'gallery' | 'bridge'): void => {
    if (!level.grid || mode === gridMode) return;
    gridMode = mode;
    const defs = level.grid.modes[mode].rects;
    const target = defs.map((r, i) => ({
      x: r.x,
      y: r.y,
      w: level.grid!.blocks[i]!.w,
      h: level.grid!.blocks[i]!.h,
    }));
    gridTween = { from: gridRects.map((r) => ({ ...r })), to: target, t: 0, dur: 0.26 };
    edits++;
    emit('GRID_TOGGLE', { mode });
  };

  const setModuleRect = (id: string, rect: Rect): void => {
    const m = mods.find((mm) => mm.id === id);
    if (!m) return;
    // DOM 测量是权威（网格块/折叠后的真实尺寸）；拖拽中模块以引擎预览为准
    if (m.moving) {
      m.rect.w = rect.w;
      m.rect.h = rect.h;
      return;
    }
    m.rect = { ...rect };
  };

  const setGridRects = (rects: Rect[]): void => {
    if (gridTween) return; // 重排动画期间引擎为权威
    if (rects.length !== gridRects.length) return;
    gridRects = rects.map((r) => ({ ...r }));
  };

  const timeScale = (): number => (phase === 'DRAGGING' ? PHYSICS.dragTimeScale : 1);

  return {
    level,
    hero,
    phase: () => phase,
    snapshot: (): EngineSnapshot => ({
      phase,
      heroX: hero.x,
      heroFeetY: hero.feetY,
      cleanerX: cleaner.x,
      edits,
    }),
    tick,
    beginDrag,
    previewDrag,
    finishDrag,
    togglePanel,
    setGridMode,
    gridMode: () => gridMode,
    setModuleRect,
    setGridRects,
    timeScale,
    cleanerX: () => cleaner.x,
    edits: () => edits,
    gameTime: () => gameTime,
    modules: () => mods,
    gridRects: () => gridRects,
    gridTweenActive: () => gridTween !== null,
    drainEvents: () => events.splice(0, events.length),
    placeAtAnchor,
  };
}

/** 供测试读取失败原因 */
export function lastFailReason(events: GameEvent[]): string | null {
  const ev = [...events].reverse().find((e) => e.type === 'LEVEL_FAIL');
  return ev ? ((ev.data?.reason as string) ?? null) : null;
}
