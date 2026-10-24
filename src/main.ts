/**
 * RE:FLOW 404 · V5「消失的排版能救命」主循环。
 * 核心机制：拖动虚拟视口宽度 → 真实 CSS @container 重排 → 旧布局残影平台（规格 §5/§15）。
 * 复用 V4 资产：暖纸外壳、AudioDirector（排版即编曲）、结算演出、留存。
 */
import './styles/main.css';
import { LEVELS_V5 } from './v5/levels';
import { StageView } from './v5/StageView';
import { EchoManager } from './v5/EchoManager';
import { RunnerSim } from './v5/RunnerSim';
import { BreakpointWorld } from './v5/BreakpointWorld';
import type { LevelConfig, SimEvent } from './v5/types';
import { audioDirector } from './ui/AudioDirector';
import { loadSave, updateSave } from './utils/storage';

const loadBest = (): number | null => loadSave().bestEdits;
const saveBest = (v: number): void => {
  updateSave({ bestEdits: v });
};

const $ = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;

// ---------- DOM ----------
const stage = $('v5-stage');
const slider = $('width-slider') as HTMLInputElement;
const modeBadge = $('mode-badge');
const presetRow = $('preset-row');
const statusTip = $('status-tip');
const stageTip = $('stage-tip');
const hudReflows = $('hud-reflows');
const hudTime = $('hud-time');
const hudEcho = $('hud-echo');
const hudStage = $('hud-stage');
const hudGoal = $('hud-goal');
const hudEdits = $('hud-edits');
const hudTimeFooter = $('hud-time-footer');
const caseLabel = $('case-label');
const caseCounter = $('case-counter');
const progressFill = $('progress-fill');
const ttlNote = $('ttl-note');
const btnStart = $('btn-start') as HTMLButtonElement;
const btnHow = $('btn-how') as HTMLButtonElement;
const btnRetry = $('btn-retry') as HTMLButtonElement;
const btnPause = $('btn-pause') as HTMLButtonElement;
const pauseVeil = $('pause-veil');
const menuHow = $('menu-how');
const bestLine = $('best-line');
const bootHint = $('boot-hint');
const endWrap = $('screen');
const endTitle = $('end-title');
const endStats = $('end-stats');
const endHero = $('end-hero');
const endCode = $('end-code');
const btnSkip = $('btn-skip') as HTMLButtonElement;
const btnRetryAct = $('btn-retry-act') as HTMLButtonElement;
const btnChallenge = $('btn-challenge') as HTMLButtonElement;
const btnReplayMotif = $('btn-replay-motif') as HTMLButtonElement;
const btnShare = $('btn-share') as HTMLButtonElement;
const btnHome = $('btn-home') as HTMLButtonElement;
const btnSound = $('btn-sound') as HTMLButtonElement;
const volPop = $('vol-pop');
const volMaster = $('vol-master') as HTMLInputElement;
const volMusic = $('vol-music') as HTMLInputElement;
const volSfx = $('vol-sfx') as HTMLInputElement;

// ---------- 场景状态 ----------
type Mode = 'menu' | 'playing';
let appMode: Mode = 'menu';
let appPaused = false;
let levelIdx = 0;
let totalReflows = 0;
let cineTimers: number[] = [];

// 当前关的运行时对象
let level: LevelConfig = LEVELS_V5[0]!;
let view: StageView | null = null;
let echo: EchoManager | null = null;
let sim: RunnerSim | null = null;
let world: BreakpointWorld | null = null;
let presetButtons: HTMLButtonElement[] = [];
let elapsed = 0;

const fmt = (sec: number): string => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

// ---------- 提示 ----------
let tipTimer = 0;
function tip(text: string, hold = 3.6): void {
  statusTip.textContent = text;
  stageTip.textContent = text;
  stageTip.classList.add('show');
  tipTimer = hold;
}

// ---------- 关卡装载 ----------
function loadLevel(index: number): void {
  // 清掉上一局的演出定时器，防止旧结算/转场覆盖新局（快速重试场景）
  cineTimers.forEach((t) => clearTimeout(t));
  cineTimers = [];
  levelIdx = index;
  level = LEVELS_V5[index]!;
  view?.destroy();
  echo = new EchoManager();
  sim = new RunnerSim(level);
  view = new StageView(stage, level);
  world = new BreakpointWorld({
    level,
    echo,
    readLiveRects: () => view!.livePlatforms(),
    applyWidth: (px) => view!.setSimWidth(px),
    worldTime: () => sim!.time,
    onCross: (from, to) => onBreakpointCrossed(from, to),
  });
  // HUD
  caseLabel.textContent = level.subtitle;
  caseCounter.textContent = `0${index + 1} / 0${LEVELS_V5.length} · PAR ${level.par}`;
  hudStage.textContent = `CASE 0${index + 1}/0${LEVELS_V5.length}`;
  hudGoal.textContent = `${level.title} · PAR ${level.par}`;
  ttlNote.textContent = String(level.ghostTtl);
  progressFill.style.width = `${(index / LEVELS_V5.length) * 100}%`;
  // 预设按钮（≥44px 触控）
  presetRow.querySelectorAll('.preset-btn').forEach((b) => b.remove());
  presetButtons = level.presets.map((p) => {
    const b = document.createElement('button');
    b.className = 'preset-btn mono';
    b.textContent = p.label;
    b.dataset.mode = p.mode;
    b.setAttribute('aria-pressed', String(p.mode === 'wide'));
    b.addEventListener('click', () => {
      audioDirector.unlock();
      applyWidth(p.width);
    });
    presetRow.insertBefore(b, presetRow.querySelector('.spacer') ?? btnRetry);
    return b;
  });
  // 确保有一个 spacer（flex:1 占位）
  if (!presetRow.querySelector('.spacer')) {
    const sp = document.createElement('span');
    sp.style.flex = '1';
    sp.className = 'spacer';
    presetRow.insertBefore(sp, btnRetry);
  }
  slider.min = '700';
  slider.max = '1440';
  slider.value = String(level.sim.width);
  // L3：真实 <details> 展开改变布局——提示与音效反馈
  view.onDetailsToggle((open) => {
    audioDirector.cue(open ? 'edit.snap' : 'ui.hover.actionable');
    tip(open ? '规则展开了 · 卡片被挤到新的物理位置' : '规则已折叠 · 布局回到原位', 2.6);
  });
  elapsed = 0;
  refreshHud();
  renderFrame();
}

const MODE_NAME: Record<string, string> = { wide: 'DESKTOP', medium: 'TABLET', compact: 'MOBILE' };

function applyWidth(px: number): void {
  if (!world) return;
  const commit = world.commit(px, appMode === 'playing' && !appPaused);
  slider.value = String(commit.width);
  modeBadge.textContent = `${MODE_NAME[commit.mode]} / ${commit.width}PX`;
  for (const b of presetButtons) {
    b.setAttribute('aria-pressed', String(b.dataset.mode === commit.mode));
  }
}

function onBreakpointCrossed(from: string, to: string): void {
  sim?.noteReflow();
  sim?.noteGhost();
  // 排版即编曲：每次合法重排解锁一个声部（V4 AudioDirector 复用）
  const action = to === 'compact' ? 'BUTTON' : 'HEADING';
  audioDirector.onValidEdit(action);
  tip(`断点跨越 ${from} → ${to} · 旧排版留下残影 ${level.ghostTtl}s`, 3.0);
  refreshHud();
}

// ---------- 主循环（固定步长，规格 §16.1） ----------
const STEP = 1 / 60;
let accumulator = 0;
let prev = performance.now();

function frame(now: number): void {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, Math.max(0, (now - prev) / 1000));
  prev = now;
  if (appMode === 'playing' && !appPaused && sim && !sim.done) {
    accumulator += dt;
    let steps = 0;
    while (accumulator >= STEP && steps < 8) {
      accumulator -= STEP;
      steps++;
      echo!.tick(sim.time);
      sim.tick(STEP, {
        platforms: view!.platformIntervals(),
        ghosts: echo!.active(sim.time),
      });
      if (sim.done) break;
    }
    consumeSimEvents();
    elapsed = sim.time;
    // 清理线危险度（复用 V4 danger 声部）
    const cleanerX = Math.max(0, sim.hero.x - 375);
    audioDirector.setDanger(sim.hero.x - cleanerX < 200, dt);
  }
  if (tipTimer > 0) {
    tipTimer -= dt;
    if (tipTimer <= 0) stageTip.classList.remove('show');
  }
  renderFrame();
  refreshHud();
}

function renderFrame(): void {
  if (!view || !sim) return;
  const running = appMode === 'playing' && !appPaused && !sim.done;
  view.renderHero(sim.hero.x, sim.hero.fallSink, running);
  view.updateCamera(sim.hero.x, running);
  view.renderGhosts(echo ? echo.active(sim.time) : [], sim.time);
  view.renderCleaner(sim.cleanerX(), level.worldW);
}

function refreshHud(): void {
  const reflows = world ? world.reflowCount : 0;
  hudReflows.innerHTML = `REFLOWS <b>${reflows}</b>`;
  hudEdits.textContent = `REFLOWS ${String(reflows).padStart(2, '0')}`;
  hudTime.textContent = `${elapsed.toFixed(1)}s`;
  hudTimeFooter.textContent = fmt(elapsed);
  const ghosts = echo ? echo.active(sim ? sim.time : 0) : [];
  if (ghosts.length) {
    const minRemain = Math.min(...ghosts.map((g) => g.deadline - (sim?.time ?? 0)));
    hudEcho.textContent = `ECHO ${Math.max(0, minRemain).toFixed(1)}s`;
  } else {
    hudEcho.textContent = 'ECHO —';
  }
}

function consumeSimEvents(): void {
  const events: SimEvent[] = [...(sim ? sim.drainEvents() : []), ...(echo ? echo.drainEvents() : [])];
  for (const ev of events) {
    switch (ev.type) {
      case 'GAME_WON':
        onLevelWon();
        break;
      case 'GAME_LOST':
        onLevelLost(ev.reason);
        break;
      case 'ECHO_EXPIRED':
        audioDirector.cue('echo.expire');
        break;
      case 'ECHO_DYING':
        audioDirector.cue('echo.dying');
        break;
      case 'LAND':
        if (ev.platformId.startsWith('ghost:')) audioDirector.cue('echo.land');
        break;
      default:
        break;
    }
  }
}

// ---------- 胜负与场景推进 ----------
function onLevelWon(): void {
  const reflows = world?.reflowCount ?? 0;
  totalReflows += reflows;
  audioDirector.playRescuePhrase();
  if (levelIdx < LEVELS_V5.length - 1) {
    // 过场（轻量，不打断节奏）
    tip(`CASE 0${levelIdx + 1} · 200 OK → 前往：${LEVELS_V5[levelIdx + 1]!.title}`, 2.6);
    cineTimers.push(window.setTimeout(() => loadLevel(levelIdx + 1), 1600));
  } else {
    progressFill.style.width = '100%';
    cineTimers.push(window.setTimeout(() => showEnd('VICTORY'), 600));
  }
}

function onLevelLost(reason: 'no-switch' | 'ghost-expired' | 'gap' | 'cleaner'): void {
  audioDirector.onFail();
  cineTimers.push(window.setTimeout(() => showEnd('FAIL', reason), 500));
}

function showEnd(kind: 'VICTORY' | 'FAIL', reason?: string): void {
  cineTimers.forEach((t) => clearTimeout(t));
  cineTimers = [];
  appMode = 'menu';
  btnPause.hidden = true;
  endWrap.hidden = false;
  endHero.classList.remove('show');
  if (kind === 'VICTORY') {
    const best = loadBest();
    if (best === null || totalReflows < best) saveBest(totalReflows);
    const bestNow = loadBest();
    bestLine.textContent = bestNow !== null ? `BEST · ${bestNow} RE:FLOW${bestNow === 1 ? '' : 'S'}` : '';
    endTitle.innerHTML = '你让消失的<br/>东西留下来了。';
    const parTotal = LEVELS_V5.reduce((a, l) => a + l.par, 0);
    endStats.innerHTML = `
      <span class="stat-line show">200 OK · RESCUED WITH ${totalReflows} RE:FLOW${totalReflows === 1 ? '' : 'S'} · PAR ${parTotal}</span>
      <span class="stat-line show">三幕通关 · 用网页的过去救出了 404</span>`;
    btnRetryAct.textContent = '再救一次 ↗';
    btnChallenge.hidden = false;
    btnChallenge.textContent = `挑战更少切换（当前 ${totalReflows}）`;
    btnReplayMotif.hidden = false;
    // 404 → 200 OK 字形分离（V4 演出复用）
    cineTimers.push(window.setTimeout(() => endCode.classList.add('ok'), 300));
    cineTimers.push(window.setTimeout(() => endHero.classList.add('show'), 900));
    audioDirector.playRescuePhrase();
  } else {
    const key = reason ?? 'gap';
    const hint = level.failHints[key as keyof typeof level.failHints];
    endTitle.innerHTML = '页面<br/>把你漏掉了。';
    endStats.innerHTML = `<span class="stat-line show">404 · LAYOUT LOST</span><span class="stat-line show">${hint}</span>`;
    btnRetryAct.textContent = '从这一幕重试 →';
    btnChallenge.hidden = true;
    btnReplayMotif.hidden = true;
  }
  btnShare.hidden = false;
  btnHome.hidden = false;
  btnSkip.hidden = true;
}

// ---------- 控制 ----------
btnStart.addEventListener('click', () => {
  audioDirector.unlock();
  startRun();
});
btnHow.addEventListener('click', () => {
  menuHow.hidden = !menuHow.hidden;
});
btnRetry.addEventListener('click', () => {
  cineTimers.forEach((t) => clearTimeout(t));
  cineTimers = [];
  loadLevel(levelIdx);
  startRun();
});
btnRetryAct.addEventListener('click', () => {
  endWrap.hidden = true;
  totalReflows = levelIdx === 0 ? 0 : totalReflows;
  loadLevel(levelIdx);
  startRun();
});
btnChallenge.addEventListener('click', () => {
  endWrap.hidden = true;
  totalReflows = 0;
  loadLevel(0);
  startRun();
});
btnHome.addEventListener('click', () => {
  endWrap.hidden = true;
  loadLevel(0);
  setPaused(false);
});
btnReplayMotif.addEventListener('click', () => audioDirector.replayMotif());
btnShare.addEventListener('click', async () => {
  const txt = `我在《RE:FLOW 404》用 ${totalReflows} 次响应式切换，让一段消失的排版救下 404。你能只用 2 次吗？`;
  try {
    await navigator.clipboard.writeText(txt);
    btnShare.textContent = '已复制 ✓';
    window.setTimeout(() => (btnShare.textContent = '分享战绩'), 1600);
  } catch {
    btnShare.textContent = '浏览器限制复制';
  }
});
btnSkip.addEventListener('click', () => {
  cineTimers.forEach((t) => clearTimeout(t));
  cineTimers = [];
});
slider.addEventListener('input', () => {
  audioDirector.unlock();
  applyWidth(Number(slider.value));
});
window.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const typing = document.activeElement instanceof HTMLInputElement && document.activeElement.type === 'text';
  if (e.key === ' ') {
    e.preventDefault();
    if (appMode === 'playing') setPaused(!appPaused);
  } else if ((e.key === 'r' || e.key === 'R') && !typing) {
    if (appMode === 'playing') {
      loadLevel(levelIdx);
      startRun();
    }
  } else if (e.key === 'm' || e.key === 'M') {
    btnSound.click();
  } else if (e.key === 'Escape') {
    if (appPaused) setPaused(false);
    else if (!volPop.hidden) volPop.hidden = true;
  } else if (e.key === 'Enter' && !endWrap.hidden) {
    btnRetryAct.click();
  }
});

function startRun(): void {
  cineTimers.forEach((t) => clearTimeout(t));
  cineTimers = [];
  endWrap.hidden = true;
  appMode = 'playing';
  setPaused(false);
  btnPause.hidden = false;
  audioDirector.resetRun();
  audioDirector.onRunStart();
  tip(level.id === 'L1' ? '现在！把宽度切到手机布局，让旧桥留在原地。' : '电脑→平板→手机，两代旧桥接力。', 4.5);
}

function setPaused(v: boolean): void {
  if (appMode !== 'playing') {
    pauseVeil.hidden = true;
    return;
  }
  appPaused = v;
  pauseVeil.hidden = !v;
  btnPause.textContent = v ? '▶ 继续' : '‖ 暂停';
  if (v) audioDirector.suspend();
  else {
    audioDirector.resume();
    prev = performance.now();
  }
}
btnPause.addEventListener('click', () => setPaused(!appPaused));
pauseVeil.addEventListener('click', () => setPaused(false));

// 声音/音量（V4 复用）
btnSound.addEventListener('click', () => {
  const on = btnSound.getAttribute('aria-pressed') !== 'true';
  btnSound.setAttribute('aria-pressed', String(on));
  btnSound.textContent = on ? '♫ 声音已开启' : '♪ 开启声音';
  audioDirector.unlock();
  audioDirector.setEnabled(on);
});
volPop.hidden = true;
btnSound.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  volPop.hidden = !volPop.hidden;
});
volMaster.addEventListener('input', () => audioDirector.setVolume('master', volMaster.valueAsNumber / 100));
volMusic.addEventListener('input', () => audioDirector.setVolume('bgm', volMusic.valueAsNumber / 100));
volSfx.addEventListener('input', () => audioDirector.setVolume('sfx', volSfx.valueAsNumber / 100));

// 失焦/隐藏暂停（nvp=1 供无头截图）
const NO_AUTO_PAUSE = new URLSearchParams(location.search).get('nvp') === '1';
document.addEventListener('visibilitychange', () => {
  if (!NO_AUTO_PAUSE && document.hidden && appMode === 'playing') setPaused(true);
  prev = performance.now();
});
window.addEventListener('resize', () => view?.fit());

// 首屏
const best = loadBest();
bestLine.textContent = best !== null ? `BEST · ${best} RE:FLOW${best === 1 ? '' : 'S'}` : '';
loadLevel(0);
requestAnimationFrame(frame);

// boot hint
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
    level: () => level,
    view: () => view,
    sim: () => sim,
    echo: () => echo,
    world: () => world,
    applyWidth: (px: number) => applyWidth(px),
    start: () => startRun(),
    loadLevel: (i: number) => loadLevel(i),
    mode: () => appMode,
    paused: () => appPaused,
    resume: () => setPaused(false),
    phase: () => (sim ? (sim.done ? (sim.hero.x >= level.hero.goalX ? 'won' : 'lost') : 'running') : 'ready'),
    heroX: () => sim?.hero.x ?? 0,
    cleanerX: () => sim?.cleanerX() ?? -1e9,
    detailsOpen: () => view?.isDetailsOpen() ?? false,
    time: () => sim?.time ?? 0,
  };
}
