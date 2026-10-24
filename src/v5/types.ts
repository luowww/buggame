/** V5「消失的排版」核心类型。世界固定 1120×520 世界单位，渲染只做 transform 缩放。 */

export type BreakpointId = 'wide' | 'medium' | 'compact';

export interface WorldRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 关卡里一块真实 DOM 平台（h2/button 等）在不同断点下的位置 */
export interface PlatformDef {
  id: string;
  /** 视觉类型：heading 白卡 / button 酸柠卡 / article 卡片 */
  kind: 'heading' | 'button' | 'article';
  text: string;
  /** 悬浮标注（data-label） */
  label: string;
  w: number;
  h: number;
  /** 相对 sim-browser 的 top（世界单位） */
  top: number;
  /** 各断点下相对 sim-browser 的 left（世界单位）——权威来源是生成的 @container CSS（L1 无 medium 档） */
  leftByMode: Partial<Record<BreakpointId, number>>;
}

/** 权威几何区间（由 CSS 推导；Playwright 实测校准，供求解器离线验证） */
export interface PlatformInterval {
  id: string;
  x: number;
  w: number;
}

export interface FloorDef {
  x: number;
  w: number;
  label?: string;
}

export interface PresetDef {
  mode: BreakpointId;
  label: string;
  width: number;
}

export interface LevelConfig {
  id: 'L1' | 'L2';
  title: string;
  subtitle: string;
  /** sim-browser 在世界中的锚定 */
  sim: { left: number; top: number; width: number; height: number };
  /** 容器断点上限：≤ cutoffs.compact → compact；≤ cutoffs.medium → medium；否则 wide */
  cutoffs: { medium: number; compact: number };
  presets: PresetDef[];
  hero: { startX: number; goalX: number; speed: number; coyote: 0.42 };
  ghostTtl: number;
  maxGhostGen: number;
  minReflowInterval: number;
  floors: FloorDef[];
  platforms: PlatformDef[];
  /** 每种断点下的平台区间（世界坐标），单测与求解器用 */
  geometryByMode: Record<BreakpointId, PlatformInterval[]>;
  intro: string;
  /** 失败提示（照规格 §5.5 公平性合同：原因与几何对应） */
  failHints: { noSwitch: string; ghostExpired: string; gap: string };
}

/** 一块残影平台：来自切换断点前的真实 DOMRect 快照 */
export interface GhostPlatform {
  id: string;
  x: number;
  w: number;
  /** 世界时钟到期时刻 */
  deadline: number;
  /** 第几代（1=蓝虚线 2=紫波纹） */
  gen: number;
}

export type SimPhase = 'ready' | 'running' | 'paused' | 'won' | 'lost';

/** 引擎事件（main.ts 消费：声画/HUD/场景推进） */
export type SimEvent =
  | { type: 'BREAKPOINT_CROSSED'; from: BreakpointId; to: BreakpointId; reflows: number }
  | { type: 'ECHO_SPAWNED'; gen: number; ttl: number }
  | { type: 'ECHO_EXPIRED'; gen: number }
  | { type: 'ECHO_DYING'; gen: number; remain: number }
  | { type: 'LAND'; platformId: string }
  | { type: 'GAME_WON'; elapsed: number; reflows: number }
  | { type: 'GAME_LOST'; reason: 'no-switch' | 'ghost-expired' | 'gap' };
