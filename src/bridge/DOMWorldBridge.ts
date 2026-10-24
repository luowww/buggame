import { PHYSICS } from '../game/levels';
import type { Engine } from '../game/engine';
import type { LevelDef } from '../game/types';
import { CoordinateMapper } from './CoordinateMapper';

/**
 * DOMWorldBridge：真实 DOM 模块注入 / 每帧测量 / 拖拽 / 锚点选择浮层（v4 手机主输入）。
 * 拖拽视觉抬升发生在 .mod-lift 包裹层，碰撞仍以引擎权威坐标为准（规格 §V4.6.1）。
 */

interface BuiltModule {
  id: string;
  el: HTMLElement;
  handle: HTMLElement;
}

export interface BridgeCallbacks {
  onCue?: (id: string) => void;
  onSnap?: (moduleId: string, tag: string) => void;
  onInvalid?: (moduleId: string) => void;
  onRulerFlash?: () => void;
}

export class DOMWorldBridge {
  private world: HTMLElement;
  private mapper: CoordinateMapper;
  private engine: Engine;
  private level: LevelDef;
  private mods: BuiltModule[] = [];
  private plats: HTMLElement[] = [];
  private gridBlocks: HTMLElement[] = [];
  private layoutBtn: HTMLButtonElement;
  private cb: BridgeCallbacks;
  private anchorPop: HTMLElement | null = null;

  private dragId: string | null = null;
  private dragStartClient = { x: 0, y: 0 };
  private activePointer: number | null = null;
  private lastPreviewValid = false;

  constructor(
    world: HTMLElement,
    engine: Engine,
    layoutBtn: HTMLButtonElement,
    cb: BridgeCallbacks = {},
  ) {
    this.world = world;
    this.engine = engine;
    this.level = engine.level;
    this.mapper = new CoordinateMapper(world, 1200, 620);
    this.layoutBtn = layoutBtn;
    this.cb = cb;
    this.build();
  }

  get mapperRef(): CoordinateMapper {
    return this.mapper;
  }

  // ---------- 构建关卡 DOM ----------

  private build(): void {
    this.world.querySelectorAll('.mod, .plat, .grid-block, .anchor-pop').forEach((el) => el.remove());
    this.closeAnchorPop();
    this.mods = [];
    this.plats = [];
    this.gridBlocks = [];
    this.world.dataset.grid = this.engine.gridMode();

    // 固定平台
    for (const f of this.level.fixed) {
      const el = document.createElement('footer');
      el.className = `plat${f.kind === 'wall' ? ' kind-wall' : ''}`;
      el.dataset.platId = f.id;
      Object.assign(el.style, {
        left: `${f.x}px`, top: `${f.y}px`, width: `${f.w}px`, height: `${f.h}px`,
      });
      el.innerHTML = `<span class="plat-label">${f.label}</span>`;
      this.world.appendChild(el);
      this.plats.push(el);
    }

    // 可拖模块（真实语义标签 + 视觉抬升包裹层）
    for (const def of this.level.modules) {
      const el = document.createElement(def.tag);
      el.dataset.moduleId = def.id;
      el.dataset.testid = def.id;
      el.tabIndex = 0;
      Object.assign(el.style, {
        left: `${def.initial.x}px`, top: `${def.initial.y}px`,
        width: `${def.w}px`, height: `${def.h}px`,
      });
      const lift = document.createElement('div');
      lift.className = 'mod-lift';
      lift.style.position = 'absolute';
      lift.style.inset = '0';
      if (def.tag === 'h1') {
        el.className = 'mod mod-h1';
        lift.innerHTML = `${def.label}<span class="mod-sub">h1 · solid</span>`;
      } else if (def.tag === 'button') {
        el.className = 'mod mod-btn';
        lift.innerHTML = `<span>${def.label}</span><span class="mod-sub">${def.sublabel ?? ''}</span>`;
        el.addEventListener('click', () => {
          const h = this.engine.hero;
          if (h.groundedOn === def.id && this.engine.phase() === 'RUNNING') {
            h.vy = PHYSICS.bounceImpulse;
            h.grounded = false;
          } else {
            this.openAnchorPop(def.id);
          }
        });
      } else {
        el.className = 'mod mod-article';
        lift.innerHTML = `<span class="art-title">${def.label}</span><span class="art-sub">${def.sublabel ?? 'article'} · 可踩</span>`;
        if (def.kind === 'panel') {
          const cb = document.createElement('button');
          cb.className = 'collapse-btn';
          cb.textContent = '⇕';
          cb.title = '折叠 / 展开';
          cb.addEventListener('click', (ev) => {
            ev.stopPropagation();
            this.engine.togglePanel(def.id);
            this.syncAfterEdit(def.id);
            this.cb.onCue?.('edit.snap.valid');
            this.cb.onRulerFlash?.();
          });
          el.appendChild(cb);
        } else {
          el.addEventListener('click', () => this.openAnchorPop(def.id));
        }
      }
      if (def.tag === 'h1') {
        el.addEventListener('click', () => this.openAnchorPop(def.id));
      }
      el.appendChild(lift);

      const handle = document.createElement('button');
      handle.className = 'drag-handle';
      handle.textContent = '≡';
      handle.dataset.handleFor = def.id;
      handle.setAttribute('aria-label', `拖动模块 ${def.label}`);
      handle.addEventListener('pointerenter', () => this.cb.onCue?.('ui.hover.actionable'));
      el.appendChild(handle);
      this.attachDrag(handle, def.id);
      this.world.appendChild(el);
      this.mods.push({ id: def.id, el, handle });
    }

    // 第三幕网格
    if (this.level.grid) {
      for (const b of this.level.grid.blocks) {
        const el = document.createElement('article');
        el.className = 'grid-block';
        el.dataset.gridId = b.id;
        el.textContent = b.label;
        this.world.appendChild(el);
        this.gridBlocks.push(el);
      }
      this.applyGridPositions(true);
      this.layoutBtn.hidden = false;
      this.updateLayoutBtn();
      this.layoutBtn.onclick = () => {
        const next = this.engine.gridMode() === 'gallery' ? 'bridge' : 'gallery';
        this.engine.setGridMode(next);
        this.world.dataset.grid = next;
        this.applyGridPositions(false);
        this.updateLayoutBtn();
        this.cb.onCue?.('grid.switch');
        this.cb.onSnap?.('GRID', 'article');
        this.cb.onRulerFlash?.();
      };
    } else {
      this.layoutBtn.hidden = true;
    }
  }

  private applyGridPositions(instant: boolean): void {
    const grid = this.level.grid!;
    const mode = this.engine.gridMode();
    grid.blocks.forEach((b, i) => {
      const el = this.gridBlocks[i]!;
      const p = grid.modes[mode].rects[i]!;
      if (instant) el.style.transition = 'none';
      Object.assign(el.style, { left: `${p.x}px`, top: `${p.y}px`, width: `${b.w}px`, height: `${b.h}px` });
      if (instant) {
        void el.offsetHeight;
        el.style.transition = '';
      }
    });
  }

  private updateLayoutBtn(): void {
    const mode = this.engine.gridMode();
    this.layoutBtn.textContent = `LAYOUT·${mode === 'gallery' ? 'GALLERY' : 'BRIDGE'}`;
    this.layoutBtn.setAttribute('aria-pressed', String(mode === 'bridge'));
  }

  // ---------- 锚点选择浮层（点模块 → 选锚点；v4 手机主输入，PC 备选） ----------

  openAnchorPop(moduleId: string): void {
    if (this.engine.phase() !== 'RUNNING') return;
    const m = this.engine.modules().find((x) => x.id === moduleId);
    const def = this.level.modules.find((d) => d.id === moduleId);
    if (!m || !def || m.erased) return;
    this.closeAnchorPop();
    const pop = document.createElement('div');
    pop.className = 'anchor-pop';
    pop.dataset.testid = 'anchor-pop';
    const title = document.createElement('div');
    title.className = 'ap-title';
    title.textContent = `PLACE · ${def.label}`;
    pop.appendChild(title);
    def.anchors.forEach((a, i) => {
      const btn = document.createElement('button');
      btn.className = 'anchor-btn' + (i === m.anchorIndex ? ' ap-current' : '');
      btn.innerHTML = `<span class="ap-dot"></span>锚点 ${i + 1} · (${a.x}, ${a.y})${i === m.anchorIndex ? ' · 当前' : ''}`;
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        this.placeAtAnchor(moduleId, i);
        this.closeAnchorPop();
      });
      pop.appendChild(btn);
    });
    const x = Math.min(m.rect.x + m.rect.w + 12, 1200 - 200);
    const y = Math.max(30, Math.min(m.rect.y, 620 - 60 - def.anchors.length * 52));
    pop.style.left = `${x}px`;
    pop.style.top = `${y}px`;
    this.world.appendChild(pop);
    this.anchorPop = pop;
    this.cb.onCue?.('ui.hover.actionable');
    window.setTimeout(() => {
      if (this.anchorPop === pop) this.closeAnchorPop();
    }, 6000);
  }

  closeAnchorPop(): void {
    this.anchorPop?.remove();
    this.anchorPop = null;
  }

  /** 与真实拖拽同一条状态机路径：beginDrag → preview → finishDrag（正确计 edit） */
  placeAtAnchor(moduleId: string, anchorIndex: number): void {
    const def = this.level.modules.find((d) => d.id === moduleId);
    if (!def) return;
    if (!this.engine.beginDrag(moduleId)) return;
    const a = def.anchors[anchorIndex]!;
    const st = this.engine.modules().find((x) => x.id === moduleId)!;
    this.engine.previewDrag(a.x - st.rect.x, a.y - st.rect.y);
    const changed = this.engine.finishDrag() === 'snap';
    const after = this.engine.modules().find((x) => x.id === moduleId)!;
    if (!changed || after.anchorIndex !== anchorIndex) {
      // 兜底：直接放置（beginDrag 已把 anchorIndex 归位，finishDrag 判定合法变更）
      this.engine.placeAtAnchor(moduleId, anchorIndex);
    }
    this.syncAfterEdit(moduleId);
  }

  // ---------- 拖拽 ----------

  private attachDrag(handle: HTMLElement, id: string): void {
    handle.addEventListener('pointerdown', (e) => {
      if (this.dragId !== null) return;
      if (!this.engine.beginDrag(id)) return;
      e.preventDefault();
      this.closeAnchorPop();
      this.dragId = id;
      this.activePointer = e.pointerId;
      this.dragStartClient = { x: e.clientX, y: e.clientY };
      const mod = this.mods.find((m) => m.id === id)!;
      mod.el.classList.add('dragging');
      document.getElementById('drag-pill')?.removeAttribute('hidden');
      this.cb.onCue?.('edit.grab');
      try {
        handle.setPointerCapture(e.pointerId);
      } catch {
        /* 合成事件场景 */
      }
    });
    handle.addEventListener('pointermove', (e) => {
      if (this.dragId !== id || e.pointerId !== this.activePointer) return;
      const d = this.mapper.deltaToWorld(
        e.clientX - this.dragStartClient.x,
        e.clientY - this.dragStartClient.y,
      );
      this.engine.previewDrag(d.dx, d.dy);
      // 预览音：进入/离开吸附区间只各响一次
      const st = this.engine.modules().find((m) => m.id === id)!;
      const def = this.level.modules.find((dd) => dd.id === id)!;
      let near = false;
      for (const a of def.anchors) {
        if (Math.hypot(a.x - st.rect.x, a.y - st.rect.y) <= PHYSICS.snapThreshold) {
          near = true;
          break;
        }
      }
      if (near !== this.lastPreviewValid) {
        this.lastPreviewValid = near;
        this.cb.onCue?.(near ? 'edit.preview.valid' : 'edit.preview.invalid');
      }
    });
    const end = (e: PointerEvent): void => {
      if (this.dragId !== id || (this.activePointer !== null && e.pointerId !== this.activePointer)) return;
      if (handle.hasPointerCapture(e.pointerId)) handle.releasePointerCapture(e.pointerId);
      this.finishDrag();
    };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
    handle.addEventListener('lostpointercapture', () => {
      if (this.dragId === id) this.finishDrag();
    });
  }

  private finishDrag(): void {
    if (this.dragId === null) return;
    const id = this.dragId;
    const result = this.engine.finishDrag();
    const mod = this.mods.find((m) => m.id === id)!;
    mod.el.classList.remove('dragging');
    mod.el.style.transform = '';
    document.getElementById('drag-pill')?.setAttribute('hidden', '');
    this.dragId = null;
    this.activePointer = null;
    this.lastPreviewValid = false;
    if (result === 'snap') {
      this.syncAfterEdit(id);
    } else {
      mod.el.classList.remove('shake');
      void mod.el.offsetWidth;
      mod.el.classList.add('shake');
      this.cb.onCue?.('edit.preview.invalid');
      this.cb.onInvalid?.(id);
    }
  }

  private syncAfterEdit(id: string): void {
    const st = this.engine.modules().find((m) => m.id === id);
    const mod = this.mods.find((m) => m.id === id);
    if (!st || !mod) return;
    mod.el.style.left = `${st.rect.x}px`;
    mod.el.style.top = `${st.rect.y}px`;
    mod.el.style.height = `${st.rect.h}px`;
    mod.el.classList.toggle('collapsed', st.collapsed);
    mod.el.classList.remove('snap-flash');
    void mod.el.offsetWidth;
    mod.el.classList.add('snap-flash');
    const def = this.level.modules.find((d) => d.id === id);
    this.cb.onCue?.('edit.snap.valid');
    this.cb.onSnap?.(id, def?.tag ?? 'article');
    this.cb.onRulerFlash?.();
  }

  // ---------- 每帧测量 ----------

  measurePass(): void {
    for (const m of this.mods) {
      const r = this.mapper.measure(m.el);
      if (r) this.engine.setModuleRect(m.id, r);
      const st = this.engine.modules().find((x) => x.id === m.id)!;
      m.el.classList.toggle('erased', st.erased);
      m.el.classList.toggle('cooling', st.kind === 'bounce' && st.cooldown > 0);
    }
    for (const p of this.plats) {
      const s = this.engine.snapshot();
      const right = parseFloat(p.style.left) + parseFloat(p.style.width);
      p.classList.toggle('erased', right < s.cleanerX);
    }
    if (this.gridBlocks.length > 0) {
      if (this.engine.gridTweenActive()) {
        const rects = this.engine.gridRects();
        this.gridBlocks.forEach((el, i) => {
          el.style.transition = 'none';
          el.style.left = `${rects[i]!.x}px`;
          el.style.top = `${rects[i]!.y}px`;
        });
      } else {
        const rects = this.gridBlocks
          .map((el) => this.mapper.measure(el))
          .filter((r): r is NonNullable<typeof r> => r !== null);
        if (rects.length === this.gridBlocks.length) this.engine.setGridRects(rects);
      }
    }
  }

  renderPass(): void {
    for (const m of this.mods) {
      const st = this.engine.modules().find((x) => x.id === m.id)!;
      if (st.moving) {
        m.el.style.transform = `translate(${st.rect.x - st.homeRect.x}px, ${st.rect.y - st.homeRect.y}px)`;
      }
    }
  }
}
