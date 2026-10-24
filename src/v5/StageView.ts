/**
 * StageView：V5 舞台的 DOM 层。
 * 注入关卡真实网页（sim-browser + @container 规则），每次跨断点前读取真实 DOMRect
 * 作为旧布局快照（规格 §15.3 严格事务），渲染残影/零四/清理线，并处理缩放与手机镜头。
 */
import { RULES } from './rules';
import { generateLevelCss } from './levels';
import type { GhostPlatform, LevelConfig, PlatformInterval, WorldRect } from './types';

export class StageView {
  private stage: HTMLElement;
  private world: HTMLElement;
  private simBrowser!: HTMLElement;
  private ghostLayer!: HTMLElement;
  private heroEl!: HTMLElement;
  private cleanLine!: HTMLElement;
  private levelStyle: HTMLStyleElement;
  private level: LevelConfig;
  /** 世界→屏幕缩放（渲染用；物理永远用世界单位） */
  private scale = 1;
  private cameraX = 0;

  constructor(stage: HTMLElement, level: LevelConfig) {
    this.stage = stage;
    this.level = level;
    this.world = stage.querySelector('#v5-world') as HTMLElement;
    this.ghostLayer = stage.querySelector('#ghost-layer') as HTMLElement;
    this.levelStyle = document.createElement('style');
    document.head.appendChild(this.levelStyle);
    this.build();
  }

  destroy(): void {
    this.levelStyle.remove();
  }

  /** 关卡 DOM 注入：地面 / 出口 / sim-browser（真实网页元素）/ 残影层 / 零四 */
  private build(): void {
    const lv = this.level;
    this.levelStyle.textContent = generateLevelCss(lv);
    // 舞台装饰：地面 + 出口 + 世界背景
    const deco: string[] = [];
    for (const f of lv.floors) {
      deco.push(`<div class="v5-land" style="left:${f.x}px;width:${f.w}px;top:${RULES.DECK_Y}px"></div>`);
    }
    const goal = `<div class="v5-exit" style="left:${lv.hero.goalX - 18}px;top:${RULES.DECK_Y - 54}px">200 OK<small>EXIT ↗</small></div>`;
    const cards = lv.platforms
      .map(
        (p) =>
          `<div class="site-card ${p.kind === 'button' ? 'b' : 'a'}" data-pid="${p.id}" data-label="${p.label}" style="top:${p.top}px;width:${p.w}px;height:${p.h}px">${p.text}</div>`,
      )
      .join('');
    this.world.innerHTML = `
      <div class="v5-scaffold" aria-hidden="true">404<small>THIS PAGE IS COLLAPSING.</small></div>
      <div class="v5-wayline" style="top:${RULES.DECK_Y}px"></div>
      ${deco.join('')}
      ${goal}
      <div class="sim-browser" id="sim-browser" style="left:${lv.sim.left}px;top:${lv.sim.top}px;width:${lv.sim.width}px;height:${lv.sim.height}px">
        <div class="sim-head"><span class="site-brand">MISSING.PA<b>GE</b></span><span class="site-nav"></span></div>
        <div class="site-description">A VERY IMPORTANT STORY<em>REMEMBER WHAT THE PAGE FORGOT</em></div>
        ${cards}
        <div class="page-boundary"></div>
      </div>
      <div id="ghost-layer"></div>
      <div class="v5-clearline" id="clearline"><label>404 / DELETE</label></div>
      <div class="zero" id="hero" aria-label="零四，小小的页面生命">
        <div class="body"></div><div class="eye a"></div><div class="eye b"></div><div class="feet"></div>
      </div>
    `;
    this.simBrowser = this.world.querySelector('#sim-browser') as HTMLElement;
    this.ghostLayer = this.world.querySelector('#ghost-layer') as HTMLElement;
    this.heroEl = this.world.querySelector('#hero') as HTMLElement;
    this.cleanLine = this.world.querySelector('#clearline') as HTMLElement;
    this.fit();
  }

  /** 适配舞台尺寸：PC 整世界缩放；手机窄幅 + 镜头跟随（规格 §16.3） */
  fit(): void {
    const w = this.stage.clientWidth;
    const mobile = w < 650;
    this.scale = mobile
      ? Math.min(0.63, Math.max(0.49, w / 720))
      : Math.min(1, w / RULES.WORLD_W);
    this.stage.style.height = `${Math.round(RULES.WORLD_H * this.scale)}px`;
    this.applyCamera();
  }

  private applyCamera(): void {
    this.world.style.transform = `translate3d(${-this.cameraX * this.scale}px,0,0) scale(${this.scale})`;
  }

  updateCamera(heroX: number, running: boolean): void {
    const w = this.stage.clientWidth;
    if (w < 650) {
      const max = Math.max(0, RULES.WORLD_W - w / this.scale);
      this.cameraX = Math.max(0, Math.min(max, heroX - 340));
    } else {
      this.cameraX = 0;
    }
    this.cleanLine.style.transform = `translate3d(${running ? Math.max(0, heroX - 375) : 0}px,0,0)`;
    this.applyCamera();
  }

  setSimWidth(px: number): void {
    this.simBrowser.style.width = `${px}px`;
  }

  /** 世界单位测量（先减 stage 原点再除 scale，规格 §15.2） */
  measureWorld(el: Element): WorldRect {
    const r = el.getBoundingClientRect();
    const s = this.world.getBoundingClientRect();
    const k = this.scale;
    return { x: (r.left - s.left) / k, y: (r.top - s.top) / k, w: r.width / k, h: r.height / k };
  }

  /** 当前真实平台几何（跨断点事务的「切换前」读数来源） */
  livePlatforms(): Array<WorldRect & { id: string }> {
    return [...this.world.querySelectorAll('.site-card')].map((el) => ({
      id: (el as HTMLElement).dataset.pid!,
      ...this.measureWorld(el),
    }));
  }

  /** 平台区间视图（喂 RunnerSim） */
  platformIntervals(): PlatformInterval[] {
    return this.livePlatforms().map((r) => ({ id: r.id, x: r.x, w: r.w }));
  }

  /** 渲染残影 DOM（一代蓝虚线 / 二代紫波纹；<0.7s 加 dying） */
  renderGhosts(ghosts: readonly GhostPlatform[], now: number): void {
    this.ghostLayer.replaceChildren(
      ...ghosts.map((g) => {
        const e = document.createElement('div');
        e.className = `ghost gen${g.gen % 2 === 1 ? 1 : 2}${g.deadline - now < 0.7 ? ' dying' : ''}`;
        e.style.left = `${g.x}px`;
        e.style.width = `${g.w}px`;
        e.title = `旧排版剩余 ${Math.max(0, g.deadline - now).toFixed(1)} 秒`;
        return e;
      }),
    );
  }

  clearGhosts(): void {
    this.ghostLayer.replaceChildren();
  }

  /** 零四位置（世界单位；fallSink 是掉落视觉下沉） */
  renderHero(x: number, fallSink: number, running: boolean): void {
    this.heroEl.style.transform = `translate3d(${x - 20}px,${RULES.DECK_Y - 40 + fallSink}px,0)`;
    this.heroEl.classList.toggle('running', running);
  }
}
