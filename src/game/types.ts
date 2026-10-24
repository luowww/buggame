/** 核心类型：纯数据。引擎不依赖 DOM；DOM 桥负责测量与呈现。 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type ModuleKind = 'solid' | 'bounce' | 'panel';
export type Phase =
  | 'BOOT'
  | 'MENU'
  | 'INTRO'
  | 'READY'
  | 'RUNNING'
  | 'DRAGGING'
  | 'PAUSED'
  | 'LEVEL_SUCCESS'
  | 'LEVEL_FAIL'
  | 'VICTORY';

export interface Anchor {
  x: number;
  y: number;
}

/** 关卡中的可编辑模块定义（真实 DOM 元素的规格） */
export interface ModuleDef {
  id: string;
  kind: ModuleKind;
  /** 真实 HTML 标签：h1 / button / article */
  tag: 'h1' | 'button' | 'article';
  /** 显示文案 */
  label: string;
  sublabel?: string;
  w: number;
  h: number;
  initial: Anchor;
  anchors: Anchor[];
  /** 面板折叠后的高度（kind=panel） */
  collapsedH?: number;
  /** 弹跳冷却（bounce） */
  cooldown?: number;
  /** 不可拖动（如第三幕网格块） */
  locked?: boolean;
}

export interface FixedDef {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  kind?: 'solid' | 'wall';
}

/** 第三幕：一组真实 DOM 块的两种排版模式 */
export interface GridMode {
  /** 各块位置（顺序对应 blocks） */
  rects: Array<{ x: number; y: number }>;
}
export interface GridLayoutDef {
  id: string;
  blocks: Array<{ id: string; label: string; w: number; h: number }>;
  modes: { gallery: GridMode; bridge: GridMode };
}

export interface LevelDef {
  id: string;
  act: 1 | 2 | 3;
  name: string;
  goal: string;
  hint: string;
  heroStart: { x: number; feetY: number };
  exitX: number;
  cleanerSpeed: number;
  cleanerDelay: number;
  fixed: FixedDef[];
  modules: ModuleDef[];
  grid?: GridLayoutDef;
}

export interface ModuleState {
  id: string;
  kind: ModuleKind;
  rect: Rect;
  /** 当前占据的锚点索引；-1 = 自由/初始 */
  anchorIndex: number;
  homeRect: Rect;
  collapsed: boolean;
  expandedH: number;
  collapsedH: number;
  cooldown: number;
  erased: boolean;
  moving: boolean;
  prevRect: Rect;
  locked: boolean;
}

export interface HeroState {
  x: number;
  feetY: number;
  vx: number;
  vy: number;
  grounded: boolean;
  groundedOn: string | null;
  coyote: number;
  /** 站台边缘犹豫计时（0.28s 后继续跑） */
  hesitate: number;
  hesitateStage: 0 | 1 | 2;
  facing: 1 | -1;
  squash: number;
  blinkTimer: number;
  blinkL: number;
  blinkR: number;
  step: number;
  airTime: number;
}

export interface CleanerState {
  x: number;
  delay: number;
  speed: number;
  active: boolean;
}

export interface GameEvent {
  type:
    | 'HERO_LAND'
    | 'HERO_JUMP'
    | 'HERO_BOUNCE'
    | 'HERO_FALL_START'
    | 'DRAG_START'
    | 'DRAG_SNAP'
    | 'DRAG_CANCEL'
    | 'PANEL_TOGGLE'
    | 'GRID_TOGGLE'
    | 'ERASE_MODULE'
    | 'CLEANER_NEAR'
    | 'LEVEL_SUCCESS'
    | 'LEVEL_FAIL'
    | 'VICTORY';
  data?: Record<string, unknown>;
}
