/**
 * V5 两关定义（规格 §6/§7 数值照搬已验证原型）。
 * 平台位置的权威来源是 generateLevelCss() 生成的真实 @container 规则；
 * geometryByMode 是由 CSS 推导的世界区间表，供 LevelValidator 离线求解，
 * 并由 Playwright E2E 校准真实 DOMRect 与表一致（M01/M02）。
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

/** 第一关「那座刚刚消失的桥」：840 → 600，一次切换，旧标题桥留残影（原型已验证） */
const L1Base: Omit<LevelConfig, 'geometryByMode'> = {
  id: 'L1',
  title: '那座刚刚消失的桥',
  subtitle: 'CASE 01 · THE MISSING BRIDGE',
  sim: { left: 260, top: 119, width: 840, height: 318 },
  cutoffs: { medium: 0, compact: 690 }, // L1 只有 wide/compact 两档（medium 置 0 永不触发）
  presets: [
    { mode: 'wide', label: '▤ 电脑布局', width: 840 },
    { mode: 'compact', label: '▥ 手机布局', width: 600 },
  ],
  hero: { startX: 203, goalX: 990, speed: 140, coyote: 0.42 },
  ghostTtl: 4.4,
  maxGhostGen: 2,
  minReflowInterval: 0.28,
  floors: [
    { x: 0, w: 261, label: '/footer · index' },
    { x: 975, w: 145, label: '/saved' },
  ],
  platforms: [
    {
      id: 'cardA',
      kind: 'heading',
      text: 'THIS IS A BRIDGE ↗',
      label: 'H1 / TEXT-BRIDGE',
      w: 220,
      h: 48,
      top: 271,
      leftByMode: { wide: 0, compact: 220 },
    },
    {
      id: 'cardB',
      kind: 'button',
      text: 'TAKE ME HOME →',
      label: 'CTA / RESPONSE-BRIDGE',
      w: 220,
      h: 48,
      top: 271,
      leftByMode: { wide: 455, compact: 440 },
    },
  ],
  intro:
    '宽屏时 [480,715] 是跨不过的大裂缝；切到手机布局后，旧标题桥会以蓝色残影留在原地——踩着「过去」走完「现在」。',
  failHints: {
    noSwitch: '不切换排版，中间的大裂缝跨不过去。先在电脑布局起跑，再及时切到手机布局。',
    ghostExpired: '旧桥残影已经结束。下一次切换要更早一点——蓝色残影只保留几秒。',
    gap: '新布局没接上。切换的时机要在掉进裂缝之前，让旧桥和新媒体排版首尾相接。',
  },
};

/** 第二关「一段路，两份过去」：W→M→S 三档，必须保存两代旧布局（原型实验关数值） */
const L2Base: Omit<LevelConfig, 'geometryByMode'> = {
  id: 'L2',
  title: '一段路，两份过去',
  subtitle: 'CASE 02 · TWO PASTS, ONE ROAD',
  sim: { left: 0, top: 119, width: 840, height: 318 },
  cutoffs: { medium: 700, compact: 520 },
  presets: [
    { mode: 'wide', label: '▤ 电脑布局', width: 840 },
    { mode: 'medium', label: '▥ 平板布局', width: 600 },
    { mode: 'compact', label: '▦ 手机布局', width: 480 },
  ],
  hero: { startX: 190, goalX: 1090, speed: 140, coyote: 0.42 },
  ghostTtl: 5.4,
  maxGhostGen: 2,
  minReflowInterval: 0.28,
  floors: [
    { x: 0, w: 230, label: '/footer · index' },
    { x: 1070, w: 50, label: '/saved' },
  ],
  platforms: [
    {
      id: 'cardA',
      kind: 'heading',
      text: 'KEEP THE OLD LAYOUT ↗',
      label: 'H1 / TEXT-BRIDGE',
      w: 210,
      h: 48,
      top: 271,
      leftByMode: { wide: 230, medium: 430, compact: 650 },
    },
    {
      id: 'cardB',
      kind: 'button',
      text: 'TAKE ME HOME →',
      label: 'CTA / RESPONSE-BRIDGE',
      w: 210,
      h: 48,
      top: 271,
      leftByMode: { wide: 740, medium: 830, compact: 860 },
    },
  ],
  intro:
    '唯一的路：电脑→平板→手机，依次保存两代旧标题桥。直接从电脑切到手机会留不下中段的路。',
  failHints: {
    noSwitch: '这一关需要两代旧排版接力。按「电脑→平板→手机」的顺序切换。',
    ghostExpired: '某一代旧桥在脚下过期了。切换节奏要更紧凑，别让残影活到自然消失。',
    gap: '两代桥没有接上。观察三档布局里标题桥各自的位置，再决定何时切换。',
  },
};

const L1: LevelConfig = { ...L1Base, geometryByMode: intervals(L1Base.sim.left, L1Base.platforms) };
const L2: LevelConfig = { ...L2Base, geometryByMode: intervals(L2Base.sim.left, L2Base.platforms) };

export const LEVELS_V5: LevelConfig[] = [L1, L2];

/** 生成关卡的容器查询 CSS——平台位置的真实权威（不是 JS 摆位置） */
export function generateLevelCss(level: LevelConfig): string {
  const rules: string[] = [];
  const baseSel = (id: string) => `.site-card[data-pid="${id}"]`;
  // wide（容器默认态）
  for (const p of level.platforms) {
    rules.push(`${baseSel(p.id)}{left:${p.leftByMode.wide}px}`);
  }
  // medium
  const mediums = level.platforms.filter((p) => p.leftByMode.medium !== undefined);
  if (mediums.length) {
    rules.push(
      `@container stage-page (max-width:${level.cutoffs.medium}px){${mediums
        .map((p) => `${baseSel(p.id)}{left:${p.leftByMode.medium}px}`)
        .join('')}}`,
    );
  }
  // compact
  rules.push(
    `@container stage-page (max-width:${level.cutoffs.compact}px){${level.platforms
      .map((p) => `${baseSel(p.id)}{left:${p.leftByMode.compact}px}`)
      .join('')}}`,
  );
  return rules.join('\n');
}
