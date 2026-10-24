/**
 * 坐标映射：client(CSS px) ↔ world(1200×620)。
 * 唯一入口，DOMRect 测量不猜比例（规格书 §11.4）。
 */

export interface WorldRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export class CoordinateMapper {
  constructor(
    private world: HTMLElement,
    private width: number,
    private height: number,
  ) {}

  /** 元素的世界矩形（相对 world 原点，按 world 缩放折算） */
  measure(el: HTMLElement): WorldRect | null {
    const r = el.getBoundingClientRect();
    const s = this.world.getBoundingClientRect();
    if (s.width === 0 || s.height === 0) return null;
    const kx = this.width / s.width;
    const ky = this.height / s.height;
    const out = {
      x: (r.left - s.left) * kx,
      y: (r.top - s.top) * ky,
      w: r.width * kx,
      h: r.height * ky,
    };
    if (!Number.isFinite(out.x) || !Number.isFinite(out.y) || out.w < 1) return null;
    return out;
  }

  /** 指针 client 坐标 → world 坐标 */
  toWorld(clientX: number, clientY: number): { x: number; y: number } {
    const s = this.world.getBoundingClientRect();
    const kx = this.width / (s.width || 1);
    const ky = this.height / (s.height || 1);
    return { x: (clientX - s.left) * kx, y: (clientY - s.top) * ky };
  }

  /** client 像素位移 → world 位移 */
  deltaToWorld(dx: number, dy: number): { dx: number; dy: number } {
    const s = this.world.getBoundingClientRect();
    const kx = this.width / (s.width || 1);
    const ky = this.height / (s.height || 1);
    return { dx: dx * kx, dy: dy * ky };
  }
}
