/**
 * RunnerSim：1D 自动跑桥物理（移植自已验证原型 update/support 逻辑，规格 §16.2）。
 * 纯逻辑、不碰 DOM：几何由外部（StageView 实测 / 关卡权威表）提供。
 */
import { RULES } from './rules';
import type { GhostPlatform, LevelConfig, PlatformInterval, SimEvent } from './types';

export interface SimState {
  x: number;
  /** 无支撑累计时间 */
  coyote: number;
  /** 掉落视觉下沉（0..FALL_SINK，仅渲染） */
  fallSink: number;
  landedOn: string | null;
}

export interface SupportGeometry {
  platforms: readonly PlatformInterval[];
  ghosts: readonly GhostPlatform[];
}

export class RunnerSim {
  private state: SimState = { x: 0, coyote: 0, fallSink: 0, landedOn: null };
  private finished = false;
  private worldTime = 0;
  private events: SimEvent[] = [];
  private level: LevelConfig;

  constructor(level: LevelConfig) {
    this.level = level;
    this.reset();
  }

  reset(): void {
    this.state = { x: this.level.hero.startX, coyote: 0, fallSink: 0, landedOn: 'floor' };
    this.finished = false;
    this.worldTime = 0;
    this.events = [];
  }

  get hero(): SimState {
    return this.state;
  }

  get time(): number {
    return this.worldTime;
  }

  get done(): boolean {
    return this.finished;
  }

  drainEvents(): SimEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  /** 是否站在承重物上：地面 / 平台（±5，deck±12）/ 残影（±5） */
  private supportAt(x: number, geo: SupportGeometry): string | null {
    for (const f of this.level.floors) {
      if (x >= f.x - RULES.SUPPORT_PAD && x <= f.x + f.w + RULES.SUPPORT_PAD) return `floor:${f.x}`;
    }
    for (const p of geo.platforms) {
      if (
        x >= p.x - RULES.SUPPORT_PAD &&
        x <= p.x + p.w + RULES.SUPPORT_PAD
      ) {
        return p.id;
      }
    }
    for (const g of geo.ghosts) {
      if (x >= g.x - RULES.SUPPORT_PAD && x <= g.x + g.w + RULES.SUPPORT_PAD) return `ghost:${g.id}`;
    }
    return null;
  }

  /** 固定步长推进（主循环 1/60；求解器 0.1 也走这里） */
  tick(dt: number, geo: SupportGeometry): void {
    if (this.finished) return;
    this.worldTime += dt;
    this.state.x += this.level.hero.speed * dt;
    const on = this.supportAt(this.state.x, geo);
    if (on) {
      if (this.state.landedOn !== on) {
        this.events.push({ type: 'LAND', platformId: on });
      }
      this.state.coyote = 0;
      this.state.fallSink = Math.max(0, this.state.fallSink - 30 * dt);
      this.state.landedOn = on;
    } else {
      this.state.coyote += dt;
      this.state.fallSink = Math.min(RULES.FALL_SINK, Math.max(0, (this.state.coyote - 0.06) * 75));
      this.state.landedOn = null;
    }
    if (this.state.x >= this.level.hero.goalX) {
      this.finished = true;
      this.events.push({ type: 'GAME_WON', elapsed: this.worldTime, reflows: -1 });
      return;
    }
    if (this.state.coyote > this.level.hero.coyote) {
      this.finished = true;
      this.events.push({ type: 'GAME_LOST', reason: this.classifyFail(geo) });
    }
  }

  /** 失败原因与实际几何对应（规格 M25：不误导玩家） */
  private classifyFail(geo: SupportGeometry): 'no-switch' | 'ghost-expired' | 'gap' {
    const { x } = this.state;
    // 身后不远处曾有残影覆盖/接近此区间 → 旧桥结束
    const nearGhost = this.level.platforms.some((p) => {
      const ahead = geo.platforms.find((q) => q.id === p.id);
      return ahead && ahead.x - x > 6 && ahead.x - x < 220;
    });
    const anyGhostEver = this.ghostSeen;
    if (anyGhostEver && nearGhost) return 'ghost-expired';
    // 从未跨过断点 → 没用机制
    if (this.reflowCount === 0) return 'no-switch';
    return 'gap';
  }

  private ghostSeen = false;
  private reflowCount = 0;

  /** 由 main 在 BREAKPOINT_CROSSED 时同步（用于失败原因分类） */
  noteReflow(): void {
    this.reflowCount++;
  }
  noteGhost(): void {
    this.ghostSeen = true;
  }
}
