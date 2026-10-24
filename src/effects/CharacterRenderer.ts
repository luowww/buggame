import type { Engine } from '../game/engine';
import { PHYSICS } from '../game/levels';

/**
 * Canvas 2D 透明覆盖层：只画角色、清理波、锚点幽灵、粒子、预览弧。
 * 平台永远来自真实 DOM —— 这里绝不画平台（规格书 §11.1）。
 */

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
}

const C = {
  ink: '#0C0E10',
  body: '#101216',
  chalk: '#F5F0E7',
  chalkSoft: '#D4D0C6',
  signal: '#D9FF48',
  vermilion: '#FF684E',
  dim: 'rgba(245,240,231,0.4)',
};

export class CharacterRenderer {
  private ctx: CanvasRenderingContext2D;
  private particles: Particle[] = [];
  private cleanerHumPhase = 0;
  private lookBackUntil = 0;

  constructor(
    canvas: HTMLCanvasElement,
    private engine: Engine,
    private reducedMotion: boolean,
  ) {
    this.ctx = canvas.getContext('2d')!;
  }

  /** 首次救援回头（规格 §V4.6.3：每局最多 1 次） */
  heroLookBack(): void {
    this.lookBackUntil = performance.now() + 700;
  }

  spawnBurst(x: number, y: number, n: number, color: string, up = false): void {
    if (this.reducedMotion) n = Math.ceil(n / 3);
    for (let i = 0; i < n && this.particles.length < 60; i++) {
      const a = up ? -Math.PI / 2 + (Math.random() - 0.5) * 1.2 : Math.random() * Math.PI * 2;
      const sp = 40 + Math.random() * 120;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - (up ? 60 : 0),
        life: 0.4 + Math.random() * 0.3,
        max: 0.7,
        color,
        size: 2 + Math.random() * 3,
      });
    }
  }

  render(dt: number, menuMode: boolean): void {
    const ctx = this.ctx;
    const e = this.engine;
    ctx.clearRect(0, 0, 1200, 620);

    this.cleanerHumPhase += dt * 3;

    // ---- 拖拽锚点幽灵 ----
    const mods = e.modules();
    for (const m of mods) {
      if (m.moving) {
        const def = e.level.modules.find((d) => d.id === m.id)!;
        // 全部锚点：暗虚线
        def.anchors.forEach((a, i) => {
          ctx.strokeStyle = i === m.anchorIndex ? 'rgba(244,240,231,0.2)' : 'rgba(215,255,63,0.32)';
          ctx.setLineDash([5, 5]);
          ctx.lineWidth = 1.4;
          ctx.strokeRect(a.x, a.y, def.w, def.h);
          ctx.setLineDash([]);
        });
        // 最近可吸附锚点高亮
        let best = -1;
        let bestD: number = PHYSICS.snapThreshold;
        def.anchors.forEach((a, i) => {
          const d = Math.hypot(a.x - m.rect.x, a.y - m.rect.y);
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        });
        if (best >= 0) {
          const a = def.anchors[best]!;
          ctx.strokeStyle = C.signal;
          ctx.lineWidth = 2.2;
          ctx.setLineDash([8, 5]);
          ctx.strokeRect(a.x - 3, a.y - 3, def.w + 6, def.h + 6);
          ctx.setLineDash([]);
        }
        // 当前矩形投影
        ctx.strokeStyle = 'rgba(255,104,78,0.55)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(m.rect.x, m.rect.y, m.rect.w, m.rect.h);
      }
    }

    if (!menuMode) {
      // ---- 犹豫提示（! + 前方短虚线弧） ----
      const h = e.hero;
      if (h.hesitateStage === 1) {
        ctx.fillStyle = C.vermilion;
        ctx.font = '700 26px monospace';
        ctx.fillText('!', h.x - 4, h.feetY - 58);
      }

      // ---- 清理波 ----
      const cx = e.cleanerX();
      if (cx > -60) {
        const g = ctx.createLinearGradient(Math.max(-80, cx - 320), 0, cx, 0);
        g.addColorStop(0, 'rgba(244,240,231,0.0)');
        g.addColorStop(0.75, 'rgba(244,240,231,0.10)');
        g.addColorStop(1, 'rgba(244,240,231,0.30)');
        ctx.fillStyle = g;
        ctx.fillRect(Math.max(-80, cx - 320), 0, Math.min(cx + 80, 1200) - Math.max(-80, cx - 320), 620);
        // 扫描边
        ctx.fillStyle = 'rgba(244,240,231,0.92)';
        ctx.fillRect(cx - 2, 0, 3, 620);
        ctx.fillStyle = 'rgba(244,240,231,0.35)';
        ctx.fillRect(cx - 6, 0, 9, 620);
        // DELETE 竖排字符
        ctx.save();
        ctx.fillStyle = 'rgba(244,240,231,0.8)';
        ctx.font = '700 13px monospace';
        const jitter = this.reducedMotion ? 0 : Math.sin(this.cleanerHumPhase) * 2;
        for (let yy = 30; yy < 610; yy += 64) {
          ctx.fillText('DELETE', cx + 10 + jitter, yy);
        }
        ctx.fillStyle = 'rgba(244,240,231,0.4)';
        ctx.font = '600 10px monospace';
        const code = String(Math.floor(cx)).padStart(3, '0');
        ctx.fillText(`▌${code}`, cx + 10, 612);
        ctx.restore();
      }

      // ---- 出口标记 ----
      const ex = e.level.exitX;
      ctx.strokeStyle = C.signal;
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 6]);
      ctx.beginPath();
      ctx.moveTo(ex, 200);
      ctx.lineTo(ex, 560);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = C.signal;
      ctx.font = '700 12px monospace';
      ctx.fillText('SAVE →', ex - 20, 190);
    }

    // ---- 零四（Zero-Four）----
    this.drawHero(menuMode);

    // ---- 粒子 ----
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 400 * dt;
      const a = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = a;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    this.particles = this.particles.filter((p) => p.life > 0);
  }

  /** 零四：折页角小生物（锚点：外轮廓折角 / > 缺口 / 错位双眼 / 短橙腿） */
  private drawHero(sleeping: boolean): void {
    const ctx = this.ctx;
    const h = this.engine.hero;
    const squash = h.squash;
    const W: number = 30;
    const H: number = 44;
    const sy = 1 - squash * 0.35;
    const sx = 1 + squash * 0.3;
    const x = h.x;
    const y = h.feetY;

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(sx, sy);

    // ---- 短腿（跑动摆动 / 空中收腿） ----
    const running = h.grounded && h.vx > 0 && !sleeping;
    const swing = running ? Math.sin(h.step) * 7 : 0;
    const airTuck = !h.grounded ? 6 : 0;
    ctx.fillStyle = C.vermilion;
    // 左腿
    ctx.fillRect(-9 + swing * 0.6, -12 - airTuck, 6, 12 - (running ? Math.abs(swing) * 0.4 : 0));
    // 右腿
    ctx.fillRect(3 - swing * 0.6, -12 - airTuck, 6, 12 - (running ? Math.abs(Math.sin(h.step + Math.PI)) * 5 : 0));

    // ---- 身体：折起的页面角 ----
    // 主体方 + 右上折角（> 缺口张合随跑动）
    const fold = running ? 2 + Math.abs(Math.sin(h.step * 0.5)) * 3 : 2.5;
    ctx.beginPath();
    ctx.moveTo(-W / 2, -H + 2); // 左上
    ctx.lineTo(W / 2 - 10 - fold, -H + 2); // 上沿到折角
    ctx.lineTo(W / 2, -H + 12); // 折角斜切
    ctx.lineTo(W / 2, -4); // 右下
    ctx.lineTo(-W / 2, -4); // 左下
    ctx.closePath();
    ctx.fillStyle = C.body;
    ctx.fill();
    ctx.strokeStyle = 'rgba(244,240,231,0.55)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    // 折角页（小三角翻起）
    ctx.beginPath();
    ctx.moveTo(W / 2 - 10 - fold, -H + 2);
    ctx.lineTo(W / 2 - 4 - fold * 0.4, -H + 8 + fold);
    ctx.lineTo(W / 2, -H + 12);
    ctx.closePath();
    ctx.fillStyle = 'rgba(244,240,231,0.16)';
    ctx.fill();

    // ---- 错位像素眼（不同步眨眼） ----
    const eyeL = h.blinkL > 0 ? 1 : 3.2;
    const eyeR = h.blinkR > 0 ? 1 : 3.2;
    // 左眼低一点、右眼高一点（错位 = 程序不稳定）
    ctx.fillStyle = C.chalk;
    ctx.fillRect(-10, -H + 16 + 2, 7, eyeL);
    ctx.fillRect(2, -H + 14 - 1, 7, eyeR);
    // 瞳孔点
    if (eyeL > 2) {
      ctx.fillStyle = C.body;
      ctx.fillRect(-7, -H + 18, 2.5, 2.5);
    }
    if (eyeR > 2) {
      ctx.fillStyle = C.body;
      ctx.fillRect(5, -H + 15, 2.5, 2.5);
    }

    // ---- 404 胸标（极小暖橙记号） ----
    ctx.fillStyle = C.vermilion;
    ctx.fillRect(-3, -H + 32, 6, 2);

    // 首次救援回头（朝左看 0.7s）
    if (!sleeping && this.lookBackUntil > performance.now()) {
      ctx.fillStyle = C.chalk;
      ctx.font = '600 10px monospace';
      ctx.fillText('← 谢谢', -W / 2 - 6, -H - 6);
    }

    // 睡觉 Zzz
    if (sleeping) {
      ctx.fillStyle = C.dim;
      ctx.font = '600 11px monospace';
      const t = performance.now() / 1000;
      ctx.fillText('z', W / 2 + 4 + Math.sin(t * 2) * 2, -H - 4 - ((t * 8) % 10));
    }

    // 濒危汗滴
    const cx = this.engine.cleanerX();
    if (!sleeping && cx > 0 && h.x - cx < 200) {
      ctx.fillStyle = C.vermilion;
      ctx.beginPath();
      ctx.arc(W / 2 - 2, -H - 4 + ((performance.now() / 300) % 1) * 6, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}
