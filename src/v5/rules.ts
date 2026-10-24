/** 全局规则常量（与已验证原型一致的物理参数，规格 §16/§6/§7） */
import type { BreakpointId } from './types';

export const RULES = Object.freeze({
  /** 世界尺寸（世界单位，非屏幕像素） */
  WORLD_W: 1120,
  WORLD_H: 520,
  /** 平台顶部的世界 y——1D 桥模型的支撑线 */
  DECK_Y: 390,
  /** 平台命中横向容差（原型 ±5） */
  SUPPORT_PAD: 5,
  /** 平台纵向命中容差（原型 |y-390|<12） */
  DECK_PAD: 12,
  /** 拖动滑块的步进与范围 */
  WIDTH_MIN: 480,
  WIDTH_MAX: 840,
  WIDTH_STEP: 10,
  /** 断点迟滞：进入 compact 需 ≤ cutoff-10，回 wide 需 > cutoff+10（规格 §15.4-1） */
  HYSTERESIS: 10,
  /** 掉落视觉最大下沉（px，仅渲染） */
  FALL_SINK: 36,
});

/** 断点分类（含迟滞：from 是当前模式，避免阈值抖动无限造影） */
export function classifyWidth(
  width: number,
  cutoffs: { medium: number; compact: number },
  from?: BreakpointId,
): BreakpointId {
  const enterCompact = cutoffs.compact - 10;
  const enterMedium = cutoffs.medium - 10;
  if (from) {
    // 已在 compact：回到 medium 需 > compact+10
    if (from === 'compact' && width > cutoffs.compact + 10) {
      return width > cutoffs.medium + 10 ? 'wide' : 'medium';
    }
    if (from === 'medium') {
      if (width <= enterCompact) return 'compact';
      if (width > cutoffs.medium + 10) return 'wide';
      return 'medium';
    }
    // wide
    if (width <= enterCompact) return 'compact';
    if (width <= enterMedium) return 'medium';
    return 'wide';
  }
  if (width <= enterCompact) return 'compact';
  if (width <= enterMedium) return 'medium';
  return 'wide';
}
