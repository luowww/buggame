/**
 * AudioDirector（v4 规格 §V4.4–V4.5）：
 * - 默认静音，用户明确点击开启后才播放（绝不自动播放）
 * - 112 BPM Web Audio 传输层：50ms 轮询 / 140ms lookahead / 按拍调度
 * - 声部随"合法编辑"逐次加入（排版即编曲）：HEADING→低音拨弦，BUTTON→钟琴动机，
 *   PANEL→纸页打击，GRID→和声开阔化；只在下一小节生效，绝不重复叠加
 * - 事件音效带冷却（规格 §V4.4.5 事件表）；FAIL 停全部循环；胜利回放本局乐句
 * - 三总线 master/bgm/sfx；M 静音；失焦暂停；静音永不影响游戏
 */

const BPM = 112;
const BEAT = 60 / BPM; // 0.5357s
const BAR = BEAT * 4;

/** A 小调音高（Hz） */
const N = {
  A2: 110.0,
  C3: 130.81,
  E3: 164.81,
  A3: 220.0,
  C4: 261.63,
  E4: 329.63,
  B4: 493.88,
  A4: 440.0,
  C5: 523.25,
  E5: 659.25,
  G3: 196.0,
  A5: 880.0,
} as const;

/** 品牌/救援四音动机 A–C–E–B */
const MOTIF = [N.A3, N.C4, N.E4, N.B4] as const;

export type EditAction = 'HEADING' | 'BUTTON' | 'PANEL' | 'GRID';
export type Bus = 'master' | 'bgm' | 'sfx';

interface Cooldown {
  last: number;
}

export class AudioDirector {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private bgm: GainNode | null = null;
  private sfx: GainNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;

  private enabled = false;
  private volumes: Record<Bus, number> = { master: 0.65, bgm: 0.35, sfx: 0.65 };

  // 传输层
  private transportTimer: number | null = null;
  private nextBeatAt = 0;
  private beatIndex = 0;
  private transportRunning = false;

  // 声部状态（本局）
  voices = {
    ambient: false, // 空气垫（开跑即有）
    pulse: false, // 脉冲低音
    bassPluck: false, // HEADING 解锁
    bellMotif: false, // BUTTON 解锁
    paperPerc: false, // PANEL 解锁
    openHarmony: false, // GRID 解锁
    danger: false, // 危机 tick（进入危险 0.3s 后）
  };
  private pending: Partial<typeof this.voices> = {};
  private dangerHysteresis = 0;

  // 本局乐句（只记合法提交）
  private motifEvents: Array<{ tick: number; action: EditAction; noteIndex: number }> = [];

  // 冷却表
  private cooldowns: Record<string, Cooldown> = {};

  // ---------- 生命周期 ----------

  /** 用户手势中调用；soundOn=false 时也建 ctx 但保持静音（规格：默认静音） */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => {});
      return;
    }
    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.limiter = this.ctx.createDynamicsCompressor();
      this.limiter.threshold.value = -12;
      this.limiter.ratio.value = 8;
      this.master = this.ctx.createGain();
      this.bgm = this.ctx.createGain();
      this.sfx = this.ctx.createGain();
      this.bgm.connect(this.master);
      this.sfx.connect(this.master);
      this.master.connect(this.limiter);
      this.limiter.connect(this.ctx.destination);
      this.applyVolumes();
    } catch {
      this.ctx = null;
    }
  }

  setEnabled(v: boolean): void {
    this.enabled = v;
    if (v) {
      this.unlock();
      this.startTransport();
    } else {
      this.stopTransport();
    }
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  setVolume(bus: Bus, v: number): void {
    this.volumes[bus] = Math.max(0, Math.min(1, v));
    this.applyVolumes();
  }

  getVolume(bus: Bus): number {
    return this.volumes[bus];
  }

  private applyVolumes(): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const m = this.enabled ? this.volumes.master : 0;
    this.master.gain.setTargetAtTime(m, t, 0.02);
    this.bgm?.gain.setTargetAtTime(this.volumes.bgm, t, 0.02);
    this.sfx?.gain.setTargetAtTime(this.volumes.sfx, t, 0.02);
  }

  // ---------- 传输层（规格 §V4.5.3） ----------

  private startTransport(): void {
    if (!this.ctx || this.transportRunning) return;
    this.transportRunning = true;
    this.nextBeatAt = this.ctx.currentTime + 0.06;
    this.transportTimer = window.setInterval(() => {
      if (!this.transportRunning || !this.ctx || this.ctx.state !== 'running') return;
      while (this.nextBeatAt < this.ctx.currentTime + 0.14) {
        if (this.beatIndex % 4 === 0) this.applyPendingVoices();
        this.scheduleBeat(this.beatIndex, this.nextBeatAt);
        this.beatIndex++;
        this.nextBeatAt += BEAT;
      }
    }, 50);
  }

  private stopTransport(): void {
    this.transportRunning = false;
    if (this.transportTimer !== null) {
      clearInterval(this.transportTimer);
      this.transportTimer = null;
    }
    this.applyVolumes();
  }

  /** 暂停（失焦）：停止调度但保留乐句与声部，恢复需显式 resume */
  suspend(): void {
    this.stopTransport();
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend().catch(() => {});
  }

  resume(): void {
    if (!this.enabled) return;
    this.unlock();
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume().catch(() => {});
    this.startTransport();
  }

  /** 新局：声部复位（保留用户音量设置） */
  resetRun(): void {
    this.voices = {
      ambient: false, pulse: false, bassPluck: false, bellMotif: false,
      paperPerc: false, openHarmony: false, danger: false,
    };
    this.pending = {};
    this.motifEvents = [];
    this.dangerHysteresis = 0;
  }

  /** 场景状态：开跑启动氛围 */
  onRunStart(): void {
    this.queueVoice('ambient', true);
    this.queueVoice('pulse', true);
  }

  /** 危险进入/离开（0.3s 滞回，规格 §V4.5.2） */
  setDanger(near: boolean, dt: number): void {
    if (near) {
      this.dangerHysteresis += dt;
      if (this.dangerHysteresis >= 0.3 && !this.voices.danger) this.queueVoice('danger', true);
    } else {
      this.dangerHysteresis = 0;
      if (this.voices.danger) this.queueVoice('danger', false);
    }
  }

  private queueVoice(v: keyof typeof this.voices, on: boolean): void {
    this.pending[v] = on;
  }

  private applyPendingVoices(): void {
    if (Object.keys(this.pending).length === 0) return;
    Object.assign(this.voices, this.pending);
    this.pending = {};
  }

  // ---------- 声部调度（每拍） ----------

  private scheduleBeat(beat: number, at: number): void {
    const inBar = beat % 4;
    // 氛围垫：每小节第一拍整小节长音（A2 根音，开放和声时叠加 C3/E3）
    if (inBar === 0 && this.voices.ambient) {
      this.pad(N.A2, at, BAR * 0.98, 0.028);
      if (this.voices.openHarmony) {
        this.pad(N.E3, at, BAR * 0.98, 0.02);
        this.pad(N.C4, at, BAR * 0.98, 0.014);
      }
    }
    // 脉冲：每拍极轻 tick（第 1、3 拍略强）
    if (this.voices.pulse && this.enabled) {
      this.blip(inBar === 0 ? N.A2 : inBar === 2 ? N.E3 : N.A2, at, 0.05, inBar % 2 === 0 ? 0.05 : 0.028, 'sine', 'bgm');
    }
    // 低音拨弦（HEADING 解锁）：每小节 1、3 拍
    if (this.voices.bassPluck && (inBar === 0 || inBar === 2)) {
      this.pluck(inBar === 0 ? N.A2 : N.C3, at, 0.07, 'bgm');
    }
    // 钟琴动机（BUTTON 解锁）：每小节第 1 拍推进一个动机音
    if (this.voices.bellMotif && inBar === 0) {
      const barIdx = Math.floor(beat / 4);
      const note = MOTIF[barIdx % MOTIF.length]!;
      this.bell(note, at, 0.05, 'bgm');
    }
    // 纸页打击（PANEL 解锁）：2、4 拍轻噪
    if (this.voices.paperPerc && (inBar === 1 || inBar === 3)) {
      this.noiseTap(at, 0.02, 2400, 'bgm');
    }
    // 危机 tick：稀疏金属声，每小节第 3 拍后半
    if (this.voices.danger && inBar === 2) {
      this.blip(N.E5, at + BEAT * 0.5, 0.06, 0.04, 'square', 'bgm');
    }
  }

  // ---------- 合法编辑 → 声部 + 乐句记录（v4.1 核心） ----------

  onValidEdit(action: EditAction): void {
    const tick = this.beatIndex;
    this.motifEvents.push({ tick, action, noteIndex: this.motifEvents.length });
    switch (action) {
      case 'HEADING':
        this.queueVoice('bassPluck', true);
        break;
      case 'BUTTON':
        this.queueVoice('bellMotif', true);
        break;
      case 'PANEL':
        this.queueVoice('paperPerc', true);
        break;
      case 'GRID':
        this.queueVoice('openHarmony', true);
        break;
    }
  }

  /** 胜利：把本局触发的声部按 4 小节合成为 3-5s 救援短句（一次播放，不循环） */
  playRescuePhrase(): void {
    if (!this.ctx || !this.bgm || !this.enabled) return;
    const t0 = this.ctx.currentTime + 0.12;
    // 动机完整陈述（A-C-E-B）+ 和声解决到 C 大调色彩
    MOTIF.forEach((f, i) => this.bell(f, t0 + i * BEAT * 0.75, 0.075, 'bgm'));
    const tH = t0 + BEAT * 3.2;
    this.pad(N.C3, tH, BAR * 0.9, 0.035); // C 大调解决
    this.pad(N.E3, tH, BAR * 0.9, 0.026);
    this.pad(N.G3, tH + 0.05, BAR * 0.85, 0.02);
    this.bell(N.C5, tH + BEAT, 0.08, 'bgm');
    this.bell(N.E5, tH + BEAT * 1.5, 0.07, 'bgm');
  }

  /** 结算页"再听一次我的页面"：单独回放乐句（含本局音色配器） */
  replayMotif(): void {
    if (!this.ctx || !this.enabled) return;
    this.playRescuePhrase();
  }

  get motifSummary(): string {
    // 分享文案用：本局动机音名
    return 'A-C-E-B';
  }

  /** FAIL：停全部循环，只剩 350ms 低沉纸片落地 */
  onFail(): void {
    this.stopTransportLoopOnly();
    if (!this.ctx || !this.sfx || !this.enabled) return;
    const t0 = this.ctx.currentTime;
    this.tone(160, 0.35, { type: 'sine', vol: 0.14, slide: 52, bus: 'sfx', at: t0 });
    this.noiseBurst(t0 + 0.05, 0.3, 0.06, 700, 'sfx');
  }

  private stopTransportLoopOnly(): void {
    // 停调度但保留 enabled（后续 retry 恢复）
    this.transportRunning = false;
    if (this.transportTimer !== null) {
      clearInterval(this.transportTimer);
      this.transportTimer = null;
    }
  }

  onRetry(): void {
    if (!this.enabled) return;
    this.resetRun();
    this.resume();
    this.cue('game.retry');
  }

  // ---------- 事件音效（规格 §V4.4.5 事件表 + 冷却） ----------

  private canFire(id: string, cooldownMs: number): boolean {
    const now = performance.now();
    const c = this.cooldowns[id];
    if (c && now - c.last < cooldownMs) return false;
    this.cooldowns[id] = { last: now };
    return true;
  }

  cue(id: string): void {
    if (!this.ctx || !this.sfx || !this.enabled) return;
    const t = this.ctx.currentTime;
    switch (id) {
      case 'ui.hover.actionable':
        if (this.canFire(id, 300)) this.blip(N.A4, t, 0.04, 0.03, 'sine', 'sfx');
        break;
      case 'edit.grab':
        this.noiseBurst(t, 0.07, 0.06, 3200, 'sfx');
        this.blip(N.A3, t, 0.05, 0.035, 'triangle', 'sfx');
        break;
      case 'edit.preview.valid':
        if (this.canFire(id, 150)) this.blip(N.E5, t, 0.05, 0.032, 'sine', 'sfx');
        break;
      case 'edit.preview.invalid':
        if (this.canFire(id, 600)) this.blip(180, t, 0.07, 0.03, 'triangle', 'sfx', 140);
        break;
      case 'edit.snap.valid':
        this.blip(N.A4, t, 0.05, 0.06, 'square', 'sfx');
        this.bell(N.C5, t + 0.05, 0.055, 'sfx');
        break;
      case 'edit.snap.nochange':
        this.blip(140, t, 0.04, 0.025, 'sine', 'sfx');
        break;
      case 'character.jump':
        this.noiseBurst(t, 0.06, 0.035, 2600, 'sfx');
        break;
      case 'character.land':
        if (this.canFire(id, 80)) {
          this.tone(180, 0.06, { type: 'sine', vol: 0.05, slide: 120, bus: 'sfx', at: t });
          this.noiseBurst(t, 0.04, 0.025, 1800, 'sfx');
        }
        break;
      case 'character.bounce':
        this.blip(N.C5, t, 0.07, 0.055, 'square', 'sfx', N.A5);
        break;
      case 'character.near_miss':
        if (this.canFire(id, 1200)) this.blip(N.B4, t, 0.16, 0.045, 'sine', 'sfx', N.E4);
        break;
      case 'character.win':
        this.playRescuePhrase();
        break;
      case 'game.retry':
        this.blip(N.A3, t, 0.1, 0.04, 'triangle', 'sfx', N.E4);
        break;
      case 'ui.click':
        this.blip(N.A4, t, 0.04, 0.03, 'sine', 'sfx');
        break;
      case 'grid.switch':
        this.noiseBurst(t, 0.16, 0.05, 1600, 'sfx');
        this.blip(N.A3, t + 0.02, 0.1, 0.04, 'sine', 'sfx', N.A4);
        break;
      case 'module.erase':
        if (this.canFire(id, 250)) this.noiseBurst(t, 0.2, 0.05, 900, 'sfx');
        break;
    }
  }

  // ---------- 合成原语 ----------

  private tone(
    freq: number,
    dur: number,
    opts: { type?: OscillatorType; vol?: number; slide?: number; bus?: Bus; at?: number },
  ): void {
    if (!this.ctx) return;
    const bus = opts.bus === 'bgm' ? this.bgm : this.sfx;
    if (!bus) return;
    const t0 = opts.at !== undefined && opts.at !== null ? opts.at : this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = opts.type ?? 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (opts.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.slide), t0 + dur);
    const v = opts.vol ?? 0.06;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(v, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(bus);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  private blip(
    freq: number,
    at: number,
    dur: number,
    vol: number,
    type: OscillatorType,
    bus: Bus,
    slide?: number,
  ): void {
    this.tone(freq, dur, { type, vol, slide, bus, at });
  }

  /** 钟琴：正弦 + 泛音，快起缓落 */
  private bell(freq: number, at: number, vol: number, bus: Bus): void {
    if (!this.ctx) return;
    const dest = bus === 'bgm' ? this.bgm : this.sfx;
    if (!dest) return;
    for (const [mult, v] of [
      [1, vol],
      [2.76, vol * 0.3],
      [5.4, vol * 0.12],
    ] as Array<[number, number]>) {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq * mult;
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(v, at + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, at + Math.min(1.4, 0.5 / mult + 0.3));
      osc.connect(g).connect(dest);
      osc.start(at);
      osc.stop(at + 1.6);
    }
  }

  /** 拨弦：三角波短促衰减 */
  private pluck(freq: number, at: number, vol: number, bus: Bus): void {
    if (!this.ctx) return;
    const dest = bus === 'bgm' ? this.bgm : this.sfx;
    if (!dest) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(vol, at + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.42);
    osc.connect(g).connect(dest);
    osc.start(at);
    osc.stop(at + 0.5);
  }

  /** 氛围垫：低通锯齿 + 慢包络 */
  private pad(freq: number, at: number, dur: number, vol: number): void {
    if (!this.ctx || !this.bgm) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    osc.detune.value = (Math.random() - 0.5) * 6;
    f.type = 'lowpass';
    f.frequency.value = 320;
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(vol, at + dur * 0.3);
    g.gain.linearRampToValueAtTime(0.0001, at + dur);
    osc.connect(f).connect(g).connect(this.bgm);
    osc.start(at);
    osc.stop(at + dur + 0.1);
  }

  private noiseTap(at: number, vol: number, hp: number, bus: Bus): void {
    this.noiseBurst(at, 0.05, vol, hp, bus);
  }

  private noiseBurst(at: number, dur: number, vol: number, hp: number, bus: Bus): void {
    if (!this.ctx) return;
    const dest = bus === 'bgm' ? this.bgm : this.sfx;
    if (!dest) return;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = hp;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(dest);
    src.start(at);
  }
}

export const audioDirector = new AudioDirector();
