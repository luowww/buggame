import './styles/main.css';
import { createEngine, type Engine } from './game/engine';
import { LEVELS, PHYSICS } from './game/levels';
import { DOMWorldBridge } from './bridge/DOMWorldBridge';
import { CharacterRenderer } from './effects/CharacterRenderer';
import { audioDirector, type EditAction } from './ui/AudioDirector';
import { loadSave, updateSave } from './utils/storage';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const world = $('world');
const viewport = $('viewport');
const canvas = $('fx') as HTMLCanvasElement;
const btnLayout = $('btn-layout') as unknown as HTMLButtonElement;
const btnSound = $('btn-sound') as unknown as HTMLButtonElement;
const btnVol = $('btn-vol') as unknown as HTMLButtonElement;
const volPop = $('vol-pop');
const volMaster = $('vol-master') as HTMLInputElement;
const volMusic = $('vol-music') as HTMLInputElement;
const volSfx = $('vol-sfx') as HTMLInputElement;
const btnPause = $('btn-pause') as unknown as HTMLButtonElement;
const screenEl = $('screen');
const endCode = $('end-code');
const endHero = $('end-hero');
const endTitle = $('end-title');
const endStats = $('end-stats');
const hudStage = $('hud-stage');
const hudGoal = $('hud-goal');
const hudTime = $('hud-time');
const hudEdits = $('hud-edits');
const progressFill = $('progress-fill');
const stageTip = $('stage-tip');
const pauseVeil = $('pause-veil');
const btnSkip = $('btn-skip') as unknown as HTMLButtonElement;
const btnChallenge = $('btn-challenge') as unknown as HTMLButtonElement;
const btnReplayMotif = $('btn-replay-motif') as unknown as HTMLButtonElement;
const btnShare = $('btn-share') as unknown as HTMLButtonElement;
const btnHome = $('btn-home') as unknown as HTMLButtonElement;
const layoutRuler = $('layout-ruler');

const REDUCED = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const IS_TOUCH = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
if (IS_TOUCH) document.getElementById('app')!.classList.add('touch');

// ---------- 全局状态 ----------
let engine: Engine = createEngine(0);
let bridge = new DOMWorldBridge(world, engine, btnLayout, {});
let renderer = new CharacterRenderer(canvas, engine, REDUCED);
let actIndex = 0;
let appMode: 'menu' | 'playing' = 'menu';
let appPaused = false;
let tipTimer = 0;
let totalEdits = 0;
let totalTime = 0;
let successLock = false;
let firstRescueDone = false;
let cineTimers: number[] = [];

const SAVE = loadSave();

// ---------- 缩放与镜头 ----------
let scale = 1;
let camX = 0;
const isMobileLayout = (): boolean =>
  viewport.clientWidth / viewport.clientHeight < 1.05 || viewport.clientWidth < 860;

function layoutWorld(): void {
  const vw = viewport.clientWidth;
  const vh = viewport.clientHeight;
  if (isMobileLayout()) {
    scale = Math.min(vh / 620, vw / 460);
    const visibleW = vw / scale;
    const target = Math.max(0, Math.min(1200 - visibleW, engine.hero.x - visibleW * 0.38));
    camX += (target - camX) * 0.08;
    world.style.transform = `translate(${-camX * scale}px, ${(vh - 620 * scale) / 2}px) scale(${scale})`;
  } else {
    scale = Math.min(vw / 1200, vh / 620);
    const tx = (vw - 1200 * scale) / 2;
    const ty = (vh - 620 * scale) / 2;
    world.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
  }
}

function showTip(text: string, seconds = 2.4): void {
  stageTip.textContent = text;
  stageTip.classList.add('show');
  tipTimer = seconds;
}

// ---------- 桥回调（音效/声部/演出钩子） ----------

interface BridgeCbs {
  onCue: (id: string) => void;
  onSnap: (id: string, tag: string) => void;
  onInvalid: () => void;
  onRulerFlash: () => void;
}

function bridgeCallbacks(): BridgeCbs {
  return {
    onCue: (id) => audioDirector.cue(id),
    onSnap: (moduleId, tag) => {
      let action: EditAction = 'HEADING';
      if (moduleId === 'GRID') action = 'GRID';
      else if (tag === 'button') action = 'BUTTON';
      else if (tag === 'article') action = 'PANEL';
      audioDirector.onValidEdit(action);
      if (!firstRescueDone) {
        firstRescueDone = true;
        renderer.heroLookBack();
      }
    },
    onInvalid: () => showTip('放这里够不到', 1.4),
    onRulerFlash: () => {
      layoutRuler.hidden = false;
      layoutRuler.classList.remove('flash');
      void layoutRuler.offsetWidth;
      layoutRuler.classList.add('flash');
    },
  };
}

// ---------- 场景流 ----------

function startAct(index: number): void {
  cineTimers.forEach((t) => clearTimeout(t));
  cineTimers = [];
  actIndex = index;
  engine = createEngine(index);
  bridge = new DOMWorldBridge(world, engine, btnLayout, bridgeCallbacks());
  renderer = new CharacterRenderer(canvas, engine, REDUCED);
  successLock = false;
  hudStage.textContent = `STEP 0${index + 1}/0${LEVELS.length}`;
  hudGoal.textContent = engine.level.goal;
  progressFill.style.width = `${(index / LEVELS.length) * 100}%`;
  screenEl.hidden = true;
  appMode = 'playing';
  btnPause.hidden = false;
  audioDirector.resetRun();
  audioDirector.onRunStart();
  showTip(`${engine.level.name} — ${engine.level.goal}`, 3.2);
  if (index === 0 && !firstRescueDone) {
    cineTimers.push(
      window.setTimeout(() => {
        if (!firstRescueDone && appMode === 'playing') {
          showTip('点一下网页模块（或拖 ≡ 手柄），放到虚线锚点，为它排一条路', 5);
        }
      }, 3600),
    );
  }
}

function retryAct(): void {
  audioDirector.onRetry();
  startAct(actIndex);
}

function fmt(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function voicesSummary(): string {
  const v = audioDirector.voices;
  const parts: string[] = [];
  if (v.bassPluck) parts.push('低音拨弦');
  if (v.bellMotif) parts.push('钟琴动机');
  if (v.paperPerc) parts.push('纸页打击');
  if (v.openHarmony) parts.push('开阔和声');
  return parts.length > 0 ? parts.join(' + ') : '基础氛围';
}

// ---------- 结算演出（规格 §V4.7 S3：可跳过） ----------

function applyEndVisible(): void {
  endCode.innerHTML =
    '<span class="digit">2</span><span class="digit">0</span><span class="digit">0</span><span class="digit accent">&nbsp;OK</span>';
  endCode.className = 'end-code ok';
  endTitle.textContent = '页面保住了——它也被保住了';
  endHero.classList.add('show');
  endStats.innerHTML = `
    <span class="stat-line show">SURVIVED · 生还</span>
    <span class="stat-line show">EDITS ${String(totalEdits).padStart(2, '0')} 次编辑 · ${fmt(totalTime)}</span>
    <span class="stat-line show">你排的乐句：${voicesSummary()} · ${audioDirector.motifSummary}</span>`;
  btnChallenge.hidden = false;
  btnChallenge.textContent = `挑战更少编辑（3 次可解 · 你用了 ${totalEdits} 次）`;
  btnReplayMotif.hidden = false;
  btnShare.hidden = false;
  btnHome.hidden = false;
  screenEl.querySelectorAll('.cta').forEach((b) => b.classList.add('show'));
  btnSkip.classList.remove('show');
}

function showEnd(kind: 'VICTORY' | 'FAIL', reason?: string): void {
  cineTimers.forEach((t) => clearTimeout(t));
  cineTimers = [];
  const t = engine.gameTime();
  const edits = engine.edits();
  const cine = (fn: () => void, ms: number): void => {
    cineTimers.push(window.setTimeout(fn, ms));
  };

  screenEl.hidden = false;
  appMode = 'menu';
  btnPause.hidden = true;

  if (kind === 'FAIL') {
    totalEdits += edits;
    totalTime += t;
    endCode.innerHTML = '<span class="digit">404</span>';
    endCode.className = 'end-code bad';
    endHero.classList.remove('show');
    endTitle.textContent = reason === 'caught' ? '清理波追上了它' : '它掉进了断裂的排版';
    endStats.innerHTML = `<span class="stat-line show">FAIL · ${
      reason === 'caught' ? 'THE CLEANER CAUGHT IT' : 'BROKEN LAYOUT'
    } · EDITS ${String(edits).padStart(2, '0')} · ${fmt(t)}</span>`;
    $('btn-retry').textContent = '从这一幕重试 →';
    btnChallenge.hidden = true;
    btnReplayMotif.hidden = true;
    btnShare.hidden = true;
    btnHome.hidden = false;
    screenEl.querySelectorAll('.cta').forEach((b) => b.classList.add('show'));
    btnSkip.classList.remove('show');
    audioDirector.onFail();
  } else {
    totalEdits += edits;
    totalTime += t;
    if (!SAVE.bestEdits || totalEdits < SAVE.bestEdits) {
      updateSave({ bestEdits: totalEdits, bestTime: Math.round(totalTime * 10) / 10 });
      SAVE.bestEdits = totalEdits;
    }
    endCode.innerHTML = '<span class="digit">4</span><span class="digit">0</span><span class="digit">4</span>';
    endCode.className = 'end-code bad';
    endHero.classList.remove('show');
    endTitle.textContent = '';
    endStats.innerHTML = '';
    screenEl.querySelectorAll('.cta').forEach((b) => b.classList.remove('show'));
    cine(() => btnSkip.classList.add('show'), 400);
    cine(() => {
      endCode.querySelectorAll('.digit').forEach((d, i) => {
        const el = d as HTMLElement;
        el.style.transform = `translateY(${i === 1 ? -14 : 8}px) rotate(${(i - 1) * 4}deg)`;
        el.style.opacity = '0.25';
      });
    }, 600);
    cine(() => {
      endCode.innerHTML =
        '<span class="digit">2</span><span class="digit">0</span><span class="digit">0</span><span class="digit accent">&nbsp;OK</span>';
      endCode.className = 'end-code ok';
      endTitle.textContent = '页面保住了——它也被保住了';
    }, 1100);
    cine(() => {
      endHero.classList.add('show');
      audioDirector.cue('character.win');
    }, 1600);
    cine(() => {
      endStats.innerHTML = `
        <span class="stat-line">SURVIVED · 生还</span>
        <span class="stat-line">EDITS ${String(totalEdits).padStart(2, '0')} 次编辑 · ${fmt(totalTime)}</span>
        <span class="stat-line">你排的乐句：${voicesSummary()} · ${audioDirector.motifSummary}</span>`;
      endStats.querySelectorAll('.stat-line').forEach((l, i) => {
        cineTimers.push(window.setTimeout(() => l.classList.add('show'), 150 + i * 260));
      });
    }, 2600);
    cine(() => {
      $('btn-retry').textContent = '再改写一次 →';
      btnChallenge.hidden = false;
      btnChallenge.textContent = `挑战更少编辑（3 次可解 · 你用了 ${totalEdits} 次）`;
      btnReplayMotif.hidden = false;
      btnShare.hidden = false;
      btnHome.hidden = false;
      screenEl.querySelectorAll('.cta').forEach((b, i) => {
        cineTimers.push(window.setTimeout(() => b.classList.add('show'), 120 + i * 130));
      });
      btnSkip.classList.remove('show');
    }, 3200);
    $('best-line').textContent = SAVE.bestEdits
      ? `BEST ${String(SAVE.bestEdits).padStart(2, '0')} EDITS`
      : '';
  }
}

btnSkip.addEventListener('click', () => {
  cineTimers.forEach((t2) => clearTimeout(t2));
  cineTimers = [];
  applyEndVisible();
});

// ---------- 引擎事件 → 表现 ----------

function consumeEvents(): void {
  for (const ev of engine.drainEvents()) {
    switch (ev.type) {
      case 'HERO_LAND':
        audioDirector.cue('character.land');
        renderer.spawnBurst(engine.hero.x, engine.hero.feetY, 5, 'rgba(212,208,198,0.8)', true);
        break;
      case 'HERO_JUMP':
        audioDirector.cue('character.jump');
        break;
      case 'HERO_BOUNCE':
        audioDirector.cue('character.bounce');
        renderer.spawnBurst(engine.hero.x, engine.hero.feetY, 8, '#D9FF48', true);
        break;
      case 'CLEANER_NEAR':
        audioDirector.cue('character.near_miss');
        showTip('⚠ 清理波逼近 — 危险', 1.6);
        break;
      case 'ERASE_MODULE':
        audioDirector.cue('module.erase');
        break;
      case 'LEVEL_SUCCESS':
        if (successLock) break;
        successLock = true;
        totalEdits += engine.edits();
        totalTime += engine.gameTime();
        showTip(`ACT ${engine.level.act} CLEAR · ${engine.edits()} EDITS`, 2.0);
        cineTimers.push(window.setTimeout(() => startAct(actIndex + 1), 1900));
        break;
      case 'VICTORY':
        if (successLock) break;
        successLock = true;
        cineTimers.push(window.setTimeout(() => showEnd('VICTORY'), 800));
        break;
      case 'LEVEL_FAIL':
        cineTimers.push(window.setTimeout(() => showEnd('FAIL', ev.data?.reason as string), 700));
        break;
    }
  }
}

// ---------- 主循环 ----------

let accumulator = 0;
let prev = performance.now();

function frame(now: number): void {
  const delta = Math.min((now - prev) / 1000, PHYSICS.maxFrameDt);
  prev = now;

  if (appMode === 'playing' && !appPaused) {
    bridge.measurePass();
    accumulator += delta;
    let steps = 0;
    while (accumulator >= PHYSICS.fixedStep && steps < 8) {
      engine.tick(PHYSICS.fixedStep * engine.timeScale());
      accumulator -= PHYSICS.fixedStep;
      steps++;
      const ph = engine.phase();
      if (ph !== 'RUNNING' && ph !== 'DRAGGING') break;
    }
    consumeEvents();
    bridge.renderPass();

    hudTime.textContent = fmt(engine.gameTime());
    hudEdits.textContent = `EDITS ${String(engine.edits()).padStart(2, '0')}`;

    const cx = engine.cleanerX();
    audioDirector.setDanger(cx > -60 && engine.hero.x - cx < 240, delta);
  }

  if (tipTimer > 0) {
    tipTimer -= delta;
    if (tipTimer <= 0) stageTip.classList.remove('show');
  }

  layoutWorld();
  renderer.render(delta, appMode === 'menu');

  requestAnimationFrame(frame);
}

// ---------- 输入 ----------

$('btn-start').addEventListener('click', () => {
  audioDirector.unlock();
  audioDirector.cue('ui.click');
  totalEdits = 0;
  totalTime = 0;
  firstRescueDone = false;
  startAct(0);
});
$('btn-how').addEventListener('click', () => {
  audioDirector.unlock();
  audioDirector.cue('ui.click');
  $('menu-how').hidden = !$('menu-how').hidden;
});
$('btn-retry').addEventListener('click', () => {
  audioDirector.unlock();
  audioDirector.cue('ui.click');
  if ((endCode.textContent ?? '').includes('200')) {
    totalEdits = 0;
    totalTime = 0;
    firstRescueDone = false;
    startAct(0);
  } else {
    retryAct();
  }
});
btnChallenge.addEventListener('click', () => {
  audioDirector.cue('ui.click');
  totalEdits = 0;
  totalTime = 0;
  firstRescueDone = false;
  startAct(0);
  showTip('挑战：三幕各只需 1 次编辑（共 3 次）就能救出它', 4);
});
btnReplayMotif.addEventListener('click', () => {
  audioDirector.cue('ui.click');
  audioDirector.replayMotif();
});
btnShare.addEventListener('click', async () => {
  audioDirector.cue('ui.click');
  const text = `我用 ${totalEdits} 次改动把一个 404 小家伙救成了 200 OK（${fmt(totalTime)}）。我的页面旋律是 ${audioDirector.motifSummary}。你能只用 3 次吗？——RE:FLOW 404《别把我排版掉》`;
  try {
    if (navigator.share) {
      await navigator.share({ title: 'RE:FLOW 404', text });
    } else {
      await navigator.clipboard.writeText(text);
      showTip('战绩已复制到剪贴板', 2);
    }
  } catch {
    showTip('分享未完成，可截图保存', 2);
  }
});
btnHome.addEventListener('click', () => {
  audioDirector.cue('ui.click');
  appMode = 'menu';
  engine = createEngine(0);
  bridge = new DOMWorldBridge(world, engine, btnLayout, bridgeCallbacks());
  renderer = new CharacterRenderer(canvas, engine, REDUCED);
  screenEl.hidden = true;
  btnPause.hidden = true;
});

btnSound.addEventListener('click', () => {
  audioDirector.unlock();
  const next = !audioDirector.isEnabled;
  audioDirector.setEnabled(next);
  btnSound.textContent = next ? '♪ 声音已开启' : '♪ 开启声音';
  btnSound.setAttribute('aria-pressed', String(next));
  updateSave({ soundOn: next });
  if (next) {
    audioDirector.cue('ui.click');
    if (appMode === 'playing') audioDirector.onRunStart();
  }
});
btnVol.addEventListener('click', () => {
  volPop.hidden = !volPop.hidden;
});
volMaster.addEventListener('input', () =>
  audioDirector.setVolume('master', volMaster.valueAsNumber / 100),
);
volMusic.addEventListener('input', () => audioDirector.setVolume('bgm', volMusic.valueAsNumber / 100));
volSfx.addEventListener('input', () => audioDirector.setVolume('sfx', volSfx.valueAsNumber / 100));

function setPaused(v: boolean): void {
  if (appMode !== 'playing') return;
  appPaused = v;
  pauseVeil.hidden = !v;
  if (v) audioDirector.suspend();
  else audioDirector.resume();
}
btnPause.addEventListener('click', () => {
  audioDirector.cue('ui.click');
  setPaused(!appPaused);
});
pauseVeil.addEventListener('click', () => setPaused(false));

window.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === ' ') {
    e.preventDefault();
    setPaused(!appPaused);
  } else if (e.key === 'r' || e.key === 'R') {
    if (appMode === 'playing') retryAct();
  } else if (e.key === 'm' || e.key === 'M') {
    btnSound.click();
  } else if (e.key === 'Escape') {
    if (appPaused) setPaused(false);
    else if (!volPop.hidden) volPop.hidden = true;
  } else if (e.key === 'Enter' && !screenEl.hidden) {
    ($('btn-retry') as HTMLButtonElement).click();
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && appMode === 'playing') setPaused(true);
  prev = performance.now();
});
window.addEventListener('resize', layoutWorld);

// 首屏
layoutWorld();

// boot
const bootHint = $('boot-hint');
let settled = false;
const settle = (): void => {
  if (settled) return;
  settled = true;
  bootHint.classList.add('gone');
  window.setTimeout(() => bootHint.remove(), 500);
};
window.setTimeout(settle, 900);
window.addEventListener('pointerdown', settle, { once: true });
requestAnimationFrame(() => window.setTimeout(settle, 300));
window.addEventListener('error', () => {
  if (!settled) $('boot-error').hidden = false;
});

// 开发/测试钩子
const DEBUG = new URLSearchParams(location.search).get('debug') === '1';
if (import.meta.env.DEV || DEBUG) {
  (window as unknown as Record<string, unknown>).__game = {
    engine: () => engine,
    bridge: () => bridge,
    audio: () => audioDirector,
    start: (act: number) => startAct(act),
    mode: () => appMode,
    paused: () => appPaused,
    resume: () => setPaused(false),
    tick: () => frame(performance.now()),
    tickAt: (ms: number) => frame(ms),
  };
}

requestAnimationFrame(frame);
