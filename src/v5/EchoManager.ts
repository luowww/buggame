/**
 * EchoManager：跨断点旧布局残影（规格 §15.4）。
 * 残影生命周期完全由世界时钟决定；最多两代；过期只发一次事件。
 */
import type { GhostPlatform, SimEvent, WorldRect } from './types';

interface SpawnArgs {
  rects: ReadonlyArray<WorldRect & { id: string }>;
  now: number;
  ttl: number;
  maxGen: number;
}

export class EchoManager {
  private ghosts: GhostPlatform[] = [];
  private lastGen = 0;
  private dyingNotified = new Set<number>();
  private events: SimEvent[] = [];

  get list(): readonly GhostPlatform[] {
    return this.ghosts;
  }

  drainEvents(): SimEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  reset(): void {
    this.ghosts = [];
    this.lastGen = 0;
    this.dyingNotified.clear();
    this.events = [];
  }

  /** 跨断点时用「切换前的真实 DOMRect」生成一代残影；只有承重高度的矩形被保留 */
  spawn(args: SpawnArgs): GhostPlatform[] {
    const kept = args.rects.filter(
      (r) => r.w >= 40 && r.w <= 400 && r.y > 300 && r.y < 430,
    );
    if (!kept.length) return this.ghosts;
    const gen = ++this.lastGen;
    this.ghosts.push(
      ...kept.map((r) => ({
        id: r.id,
        x: r.x,
        w: r.w,
        deadline: args.now + args.ttl,
        gen,
      })),
    );
    // 代数上限：挤掉最早一代（按 gen 分组）
    const gens = [...new Set(this.ghosts.map((g) => g.gen))];
    if (gens.length > args.maxGen) {
      const drop = Math.min(...gens);
      this.ghosts = this.ghosts.filter((g) => g.gen !== drop);
    }
    this.events.push({ type: 'ECHO_SPAWNED', gen, ttl: args.ttl });
    return this.ghosts;
  }

  /** 世界时钟推进：清理过期残影（视觉淡出不能延长碰撞寿命） */
  tick(now: number): readonly GhostPlatform[] {
    // 剩余 <1s 的代发一次 Dying 提示（声音/视觉倒计时）
    for (const g of this.ghosts) {
      const remain = g.deadline - now;
      if (remain < 1 && remain > 0 && !this.dyingNotified.has(g.gen)) {
        this.dyingNotified.add(g.gen);
        this.events.push({ type: 'ECHO_DYING', gen: g.gen, remain });
      }
    }
    const expired = this.ghosts.filter((g) => g.deadline <= now);
    this.ghosts = this.ghosts.filter((g) => g.deadline > now);
    for (const g of expired) {
      this.events.push({ type: 'ECHO_EXPIRED', gen: g.gen });
    }
    return this.ghosts;
  }

  /** 当前可用于碰撞的残影区间 */
  active(now: number): readonly GhostPlatform[] {
    return this.ghosts.filter((g) => g.deadline > now);
  }
}
