/**
 * V5 三关定义（世界 1680×520，深度版）。
 * 平台位置的权威来源是 generateLevelCss() 生成的真实 @container 规则；
 * geometryByMode 是由 CSS 推导的世界区间表，供 LevelValidator 离线求解，
 * 并由 Playwright E2E 校准真实 DOMRect 与表一致（M01/M02）。
 * sim-browser 覆盖约束：compact(700) 档平台 rel ≤ 480；medium(1000) 档 rel ≤ 780。
 */
import type { BreakpointId, LevelConfig, PlatformDef } from './types';

function intervals(
  simLeft: number,
  platforms: PlatformDef[],
): Record<BreakpointId, Array<{ id: string; x: number; w: number }>> {
  const out: Record<BreakpointId, Array<{ id: string; x: number; w: number }>> = {
    wide: [],
    medium: [],
    compact: [],
  };
  for (const p of platforms) {
    for (const mode of ['wide', 'medium', 'compact'] as const) {
      const left = p.leftByMode[mode];
      if (left === undefined) continue;
      out[mode].push({ id: p.id, x: simLeft + left, w: p.w });
    }
  }
  for (const k of ['wide', 'medium', 'compact'] as const) out[k].sort((a, b) => a.x - b.x);
  return out;
}

/**
 * 第一关「那座刚刚消失的桥」（PAR 2）：
 * 走廊：地面[0,240] → A 稳态桥[240,460] →（切手机）B_c[460,680] →
 *       B_w 残影[700,920] → C_c[940,1160] →（切电脑）C_w[1200,1420] → 地面[1460,1680]
 * 残影必要段：B_wide 残影 680→920，任何单档布局都无法通过。
 */
const L1Base: Omit<LevelConfig, 'geometryByMode'> = {
  id: 'L1',
  title: '那座刚刚消失的桥',
  subtitle: 'CASE 01 · THE MISSING BRIDGE',
  worldW: 1680,
  cleaner: { startX: -120, speed: 62 },
  par: 2,
  sim: { left: 200, top: 119, width: 1440, height: 318 },
  cutoffs: { medium: 0, compact: 1050 }, // 两档：>1050 wide / ≤1040 compact
  presets: [
    { mode: 'wide', label: '▤ 电脑布局', width: 1440 },
    { mode: 'compact', label: '▥ 手机布局', width: 700 },
  ],
  hero: { startX: 200, goalX: 1560, speed: 140, coyote: 0.42 },
  ghostTtl: 4.4,
  maxGhostGen: 2,
  minReflowInterval: 0.28,
  floors: [
    { x: 0, w: 240, label: '/footer · index' },
    { x: 1440, w: 240, label: '/saved' },
  ],
  platforms: [
    {
      id: 'cardA',
      kind: 'heading',
      text: 'THIS IS A BRIDGE ↗',
      label: 'H1 · 稳态桥（不随断点移动）',
      w: 220,
      h: 48,
      top: 271,
      leftByMode: { wide: 40, compact: 40 },
    },
    {
      id: 'cardB',
      kind: 'button',
      text: 'TAKE ME HOME →',
      label: 'CTA · 手机档左移',
      w: 220,
      h: 48,
      top: 271,
      leftByMode: { wide: 500, compact: 260 },
    },
    {
      id: 'cardC',
      kind: 'article',
      text: 'SAVE THIS PAGE',
      label: '卡片 · 两档接力',
      w: 220,
      h: 48,
      top: 271,
      leftByMode: { wide: 970, compact: 740 },
    },
  ],
  decos: [
    { id: 'deco1', text: 'NAV · ABOUT · ARCHIVE', left: 300, top: 60, w: 300, h: 26 },
    { id: 'deco2', text: 'RECOMMENDED', left: 1180, top: 60, w: 200, h: 26 },
    { id: 'deco3', text: '// 不承重 · 装饰内容', left: 980, top: 452, w: 260, h: 26 },
  ],
  intro:
    '标题桥是稳态；按钮和卡片会随断点换位。手机档下按钮桥左移、卡片桥补位——但中段只能靠电脑档旧桥的残影通过。',
  failHints: {
    noSwitch: '不切换排版，中段的裂缝跨不过去。踩上标题桥后，及时切到手机布局。',
    ghostExpired: '旧桥残影已经结束。切换要更早——蓝色残影只保留几秒，走完残影要趁早。',
    gap: '新布局没接上。观察按钮/卡片在两档布局里各自的位置，让残影和新桥首尾相接。',
    cleaner: '清理线追上了它。犹豫的每一秒，删除都在推进——提前规划下一段切换。',
  },
};

/**
 * 第二关「一段路，两份过去」（PAR 4）：三档断点，五段布局四代接力。
 * 走廊：地面[0,230] → A_w[240,460] →（切平板）A_m[460,680] →（切手机）B_s[560,780]
 *       →（切平板）C_m[820,1040] → D_m[960,1180] →（切电脑）D_w[1200,1420] → 地面[1460,1680]
 * 手机档所有桥被挤回左半页 [200,900]——右半页只能靠「过去」通过。
 */
const L2Base: Omit<LevelConfig, 'geometryByMode'> = {
  id: 'L2',
  title: '一段路，两份过去',
  subtitle: 'CASE 02 · TWO PASTS, ONE ROAD',
  worldW: 1680,
  cleaner: { startX: -160, speed: 74 },
  par: 4,
  sim: { left: 200, top: 119, width: 1440, height: 318 },
  cutoffs: { medium: 1050, compact: 800 },
  presets: [
    { mode: 'wide', label: '▤ 电脑布局', width: 1440 },
    { mode: 'medium', label: '▥ 平板布局', width: 1000 },
    { mode: 'compact', label: '▦ 手机布局', width: 700 },
  ],
  hero: { startX: 190, goalX: 1560, speed: 140, coyote: 0.42 },
  ghostTtl: 5.4,
  maxGhostGen: 2,
  minReflowInterval: 0.28,
  floors: [
    { x: 0, w: 230, label: '/footer · index' },
    { x: 1460, w: 220, label: '/saved' },
  ],
  platforms: [
    {
      id: 'cardA',
      kind: 'heading',
      text: 'KEEP THE OLD LAYOUT ↗',
      label: 'H1 · 三档阶梯',
      w: 220,
      h: 48,
      top: 271,
      leftByMode: { wide: 40, medium: 260, compact: 400 },
    },
    {
      id: 'cardB',
      kind: 'button',
      text: 'TAKE ME HOME →',
      label: 'CTA · 中段接力',
      w: 220,
      h: 48,
      top: 271,
      leftByMode: { wide: 320, medium: 560, compact: 360 },
    },
    {
      id: 'cardC',
      kind: 'article',
      text: 'SAVE THIS PAGE',
      label: '卡片 · 回程',
      w: 220,
      h: 48,
      top: 271,
      leftByMode: { wide: 700, medium: 620, compact: 60 },
    },
    {
      id: 'cardD',
      kind: 'article',
      text: 'RELATED POSTS',
      label: '列表 · 终段',
      w: 220,
      h: 48,
      top: 271,
      leftByMode: { wide: 1000, medium: 760, compact: 440 },
    },
  ],
  decos: [
    { id: 'deco1', text: 'NAV · ABOUT · ARCHIVE', left: 340, top: 60, w: 300, h: 26 },
    { id: 'deco2', text: '// 装饰不承重', left: 1240, top: 452, w: 220, h: 26 },
    { id: 'deco3', text: 'AD · SPONSORED', left: 860, top: 60, w: 180, h: 26 },
  ],
  intro:
    '唯一的天路：电脑→平板→手机→平板→电脑。手机档里所有桥都被挤回左半页——右半页只能靠「过去」通过。',
  failHints: {
    noSwitch: '这一关需要多代旧排版接力，单靠一档布局无法过河。',
    ghostExpired: '某一代旧桥在脚下过期了。切换节奏要更紧凑，别让残影自然消失。',
    gap: '两代桥没有接上。数好每档布局里四块桥各自的位置，再决定何时切换。',
    cleaner: '清理线追上了它。五段切换不能停顿太久——删除在逼近。',
  },
};

/**
 * 第三关「不要删除那条规则」（PAR 2）：真实 <details> 展开改变布局。
 * 走廊：地面[0,230] → A[240,460]（稳态）→（展开 SUMMARY）E [460,680]
 *       →（切手机）F_s[640,860] →（切电脑）F_w[900,1120] → G_w[1170,1390] → 地面[1440,1680]
 */
const L3Base: Omit<LevelConfig, 'geometryByMode'> = {
  id: 'L3',
  title: '不要删除那条规则',
  subtitle: 'CASE 03 · THE UNDELETED RULE',
  worldW: 1680,
  cleaner: { startX: -180, speed: 84 },
  par: 2,
  sim: { left: 200, top: 119, width: 1440, height: 318 },
  cutoffs: { medium: 0, compact: 1050 },
  presets: [
    { mode: 'wide', label: '▤ 电脑布局', width: 1440 },
    { mode: 'compact', label: '▥ 手机布局', width: 700 },
  ],
  hero: { startX: 190, goalX: 1520, speed: 140, coyote: 0.42 },
  ghostTtl: 4.6,
  maxGhostGen: 2,
  minReflowInterval: 0.28,
  floors: [
    { x: 0, w: 230, label: '/footer · index' },
    { x: 1440, w: 240, label: '/saved' },
  ],
  platforms: [
    {
      id: 'cardA',
      kind: 'heading',
      text: 'DO NOT DELETE ↗',
      label: 'H1 · 稳态桥',
      w: 220,
      h: 48,
      top: 271,
      leftByMode: { wide: 40, compact: 40 },
    },
    {
      id: 'cardE',
      kind: 'article',
      text: 'EXPANDED RULE',
      label: '卡片 · 展开前悬空 [700,920]，展开后被挤到 [460,680]',
      w: 220,
      h: 48,
      top: 271,
      // 基准位（closed）：rel 500 → [700,920]；details 展开后由 CSS 兄弟选择器挤到 rel 260
      leftByMode: { wide: 500, compact: 500 },
      tiedToDetails: true,
    },
    {
      id: 'cardF',
      kind: 'button',
      text: 'KEEP READING →',
      label: 'CTA · 中段',
      w: 220,
      h: 48,
      top: 271,
      leftByMode: { wide: 700, compact: 440 },
    },
    {
      id: 'cardG',
      kind: 'button',
      text: 'TAKE ME HOME',
      label: 'CTA · 终段',
      w: 220,
      h: 48,
      top: 271,
      leftByMode: { wide: 970, compact: 60 },
    },
  ],
  decos: [
    { id: 'deco1', text: 'NAV · RULES · LOG', left: 320, top: 60, w: 280, h: 26 },
    { id: 'deco2', text: '// 点开 SUMMARY 会挤动整页', left: 1000, top: 452, w: 300, h: 26 },
  ],
  intro:
    '页面上有一条真的 <details> 折叠规则。点开它的 SUMMARY，下面的卡片会被挤到新的物理位置——网页内容本身改变了地形。',
  failHints: {
    noSwitch: '折叠的规则把卡片挡在错误的位置。点开页面里的「▮ RULE-01」折叠条试试。',
    ghostExpired: '旧桥残影已经结束。展开/切换的动作要连贯。',
    gap: '新布局没接上。展开 details + 切换断点的组合不止一种，观察四块桥的位置。',
    cleaner: '清理线追上了它。折叠条要点得果断。',
  },
};

const L1: LevelConfig = { ...L1Base, geometryByMode: intervals(L1Base.sim.left, L1Base.platforms) };
const L2: LevelConfig = { ...L2Base, geometryByMode: intervals(L2Base.sim.left, L2Base.platforms) };
const L3: LevelConfig = { ...L3Base, geometryByMode: intervals(L3Base.sim.left, L3Base.platforms) };

export const LEVELS_V5: LevelConfig[] = [L1, L2, L3];

/** 生成关卡的容器查询 CSS——平台位置的真实权威（不是 JS 摆位置） */
export function generateLevelCss(level: LevelConfig): string {
  const rules: string[] = [];
  const baseSel = (id: string) => `.site-card[data-pid="${id}"]`;
  for (const p of level.platforms) {
    rules.push(`${baseSel(p.id)}{left:${p.leftByMode.wide}px}`);
  }
  const mediums = level.platforms.filter((p) => p.leftByMode.medium !== undefined);
  if (mediums.length && level.cutoffs.medium > 0) {
    rules.push(
      `@container stage-page (max-width:${level.cutoffs.medium}px){${mediums
        .map((p) => `${baseSel(p.id)}{left:${p.leftByMode.medium}px}`)
        .join('')}}`,
    );
  }
  rules.push(
    `@container stage-page (max-width:${level.cutoffs.compact}px){${level.platforms
      .map((p) => `${baseSel(p.id)}{left:${p.leftByMode.compact}px}`)
      .join('')}}`,
  );
  // details 展开因果：真实 CSS 兄弟选择器——SUMMARY 展开后被绑定的卡片被挤到新位置
  for (const p of level.platforms) {
    if (p.tiedToDetails) {
      rules.push(`.rule-details[open] ~ ${baseSel(p.id)}{left:${(p.leftByMode.wide ?? 0) - 240}px}`);
    }
  }
  return rules.join('\n');
}

/** L3 details 展开前后，被绑定卡片的权威区间（单测/求解器用） */
export function l3GeometryWithDetails(open: boolean): LevelConfig {
  const shift = open ? -240 : 0;
  const base = LEVELS_V5[2]!;
  return {
    ...base,
    geometryByMode: {
      wide: base.geometryByMode.wide.map((p) =>
        p.id === 'cardE' ? { ...p, x: p.x + shift } : p,
      ),
      medium: base.geometryByMode.medium,
      compact: base.geometryByMode.compact.map((p) =>
        p.id === 'cardE' ? { ...p, x: p.x + shift } : p,
      ),
    },
  };
}
