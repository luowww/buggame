/**
 * Web Audio 合成音效（规格书 §13.2：机械纸张 / 陶瓷轻敲 / 高音 boop）。
 * 首次手势解锁；静音可用；无音频不影响游戏。
 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = true;
let humOsc: OscillatorNode | null = null;
let humGain: GainNode | null = null;

export function audioEnabled(): boolean {
  return enabled;
}

export function setAudioEnabled(v: boolean): void {
  enabled = v;
  if (master && ctx) master.gain.setTargetAtTime(v ? 0.5 : 0, ctx.currentTime, 0.02);
}

export function unlockAudio(): void {
  if (ctx) {
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
    return;
  }
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = enabled ? 0.5 : 0;
    master.connect(ctx.destination);
  } catch {
    ctx = null;
  }
}

function tone(freq: number, dur: number, opts: { type?: OscillatorType; vol?: number; delay?: number; slide?: number } = {}): void {
  if (!ctx || !master || !enabled) return;
  try {
    const t0 = ctx.currentTime + (opts.delay ?? 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = opts.type ?? 'square';
    osc.frequency.setValueAtTime(freq, t0);
    if (opts.slide) osc.frequency.exponentialRampToValueAtTime(opts.slide, t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(opts.vol ?? 0.12, t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  } catch {
    /* 静默 */
  }
}

function paper(dur = 0.14, vol = 0.1): void {
  if (!ctx || !master || !enabled) return;
  try {
    const t0 = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) * 0.7;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 1200;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(master);
    src.start(t0);
  } catch {
    /* 静默 */
  }
}

/** 清理波低频呼吸（按接近度调制音量） */
export function setCleanerProximity(dist: number | null): void {
  if (!ctx || !master || !enabled) {
    if (humGain && ctx) humGain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
    return;
  }
  if (!humOsc && ctx && master) {
    try {
      humOsc = ctx.createOscillator();
      humOsc.type = 'sine';
      humOsc.frequency.value = 52;
      humGain = ctx.createGain();
      humGain.gain.value = 0;
      humOsc.connect(humGain).connect(master);
      humOsc.start();
    } catch {
      humOsc = null;
    }
  }
  if (!humGain || !ctx) return;
  const target = dist === null || dist > 300 ? 0 : Math.min(0.14, 0.14 * (1 - dist / 300));
  humGain.gain.setTargetAtTime(target, ctx.currentTime, 0.15);
}

export const sfx = {
  paperSlide(): void {
    paper(0.16, 0.12);
  },
  snap(): void {
    tone(1150, 0.05, { type: 'square', vol: 0.1 });
    tone(87, 0.09, { type: 'sine', vol: 0.16, delay: 0.01 });
  },
  cancel(): void {
    tone(190, 0.07, { type: 'triangle', vol: 0.08 });
  },
  jump(): void {
    tone(320, 0.1, { type: 'square', vol: 0.06, slide: 480 });
  },
  land(): void {
    tone(140, 0.06, { type: 'sine', vol: 0.1 });
    paper(0.05, 0.05);
  },
  bounce(): void {
    tone(620, 0.1, { type: 'square', vol: 0.14, slide: 990 });
  },
  erase(): void {
    paper(0.3, 0.14);
    tone(96, 0.2, { type: 'sawtooth', vol: 0.1, slide: 48 });
  },
  win(): void {
    tone(523, 0.18, { type: 'square', vol: 0.12 });
    tone(659, 0.22, { type: 'square', vol: 0.12, delay: 0.12 });
    tone(784, 0.3, { type: 'square', vol: 0.12, delay: 0.24 });
  },
  fail(): void {
    tone(220, 0.3, { type: 'sawtooth', vol: 0.14, slide: 90 });
    paper(0.4, 0.12);
  },
  click(): void {
    tone(560, 0.04, { type: 'sine', vol: 0.08 });
  },
  gridSwitch(): void {
    paper(0.22, 0.14);
    tone(330, 0.12, { type: 'square', vol: 0.08, slide: 660 });
  },
};
