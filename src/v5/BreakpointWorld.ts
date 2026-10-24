/**
 * BreakpointWorld：虚拟视口宽度 → 真实 CSS 重排的严格事务（规格 §15.3）。
 * 只有跨断点且满足最小间隔时才生成残影；旧几何必须在新布局生效前采样。
 */
import { classifyWidth } from './rules';
import type { BreakpointId, LevelConfig, WorldRect } from './types';
import type { EchoManager } from './EchoManager';

export interface WidthCommit {
  width: number;
  mode: BreakpointId;
  crossed: boolean;
}

export class BreakpointWorld {
  private level: LevelConfig;
  private echo: EchoManager;
  private readLiveRects: () => Array<WorldRect & { id: string }>;
  private applyWidth: (px: number) => void;
  private width: number;
  private mode: BreakpointId;
  private worldTime: () => number;
  private lastBreakpointAt = -999;
  private reflows = 0;
  private onCross?: (from: BreakpointId, to: BreakpointId) => void;

  constructor(args: {
    level: LevelConfig;
    echo: EchoManager;
    readLiveRects: () => Array<WorldRect & { id: string }>;
    applyWidth: (px: number) => void;
    worldTime: () => number;
    onCross?: (from: BreakpointId, to: BreakpointId) => void;
  }) {
    this.level = args.level;
    this.echo = args.echo;
    this.readLiveRects = args.readLiveRects;
    this.applyWidth = args.applyWidth;
    this.worldTime = args.worldTime;
    this.onCross = args.onCross;
    this.width = this.level.sim.width;
    this.mode = 'wide';
  }

  get currentWidth(): number {
    return this.width;
  }

  get currentMode(): BreakpointId {
    return this.mode;
  }

  get reflowCount(): number {
    return this.reflows;
  }

  reset(): void {
    this.width = this.level.sim.width;
    this.mode = 'wide';
    this.lastBreakpointAt = -999;
    this.reflows = 0;
    this.applyWidth(this.width);
  }

  /** 提交新宽度（滑块/预设都会走到这里）。running 状态跨断点时先快照旧布局再改宽度。 */
  commit(nextRaw: number, running: boolean): WidthCommit {
    const next = Math.max(
      700,
      Math.min(1440, Math.round(Number(nextRaw) / 10) * 10),
    );
    const now = this.worldTime();
    const nextMode = classifyWidth(next, this.level.cutoffs, this.mode);
    const before = this.mode;
    const crossing = nextMode !== before;
    const canSpawn =
      crossing && running && now - this.lastBreakpointAt >= this.level.minReflowInterval;
    // 严格事务：先读旧权威 DOM，再改宽度
    const previous = canSpawn ? this.readLiveRects() : [];
    this.applyWidth(next);
    this.width = next;
    this.mode = nextMode;
    const out: WidthCommit = { width: next, mode: nextMode, crossed: crossing && running };
    if (!canSpawn || !previous.length) return out;
    this.echo.spawn({
      rects: previous,
      now,
      ttl: this.level.ghostTtl,
      maxGen: this.level.maxGhostGen,
    });
    this.reflows++;
    this.lastBreakpointAt = now;
    this.onCross?.(before, nextMode);
    return out;
  }
}
