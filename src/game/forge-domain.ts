import type { RunResult } from './domain';

export type Weather = 'rain' | 'clear';
export type Flag = 'ZERO' | 'CARRY' | 'POWER';
export type ForgePhase = 'arrival' | 'climate' | 'carry' | 'exit' | 'complete';
export interface PowerState { charge: number; temperature: number; isolated: boolean; energized: boolean }
export interface ForgeProgress { phase: ForgePhase; power: PowerState; flag: Flag; evidence: string[] }
export const freshForge = (): ForgeProgress => ({ phase: 'arrival', power: { charge: 0, temperature: 24, isolated: false, energized: false }, flag: 'ZERO', evidence: [] });
export const FORGE_PHASES: ForgePhase[] = ['arrival', 'climate', 'carry', 'exit', 'complete'];
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/** Small fixed simulation steps make weather/storage causal and frame-rate independent. */
export function stepPower(p: PowerState, weather: Weather, dt: number): PowerState {
  if (p.energized || !Number.isFinite(dt) || dt <= 0) return { ...p };
  return { ...p,
    charge: clamp(p.charge + (weather === 'clear' ? (p.isolated ? 0 : 12) : (p.isolated ? 0 : -8)) * dt, 0, 100),
    temperature: clamp(p.temperature + (weather === 'rain' ? -10 : p.isolated ? -.6 : 4) * dt, 20, 100),
  };
}
export function runPower(p: PowerState, runId = 'WF-01:preview'): RunResult {
  const retained = stepPower({ ...p, energized: false }, 'rain', 3);
  const assertions = [
    { name: '储能至少 72%', passed: p.charge >= 72, detail: `实测 ${p.charge.toFixed(1)}% / 需要 ≥72%` },
    { name: '核心温度不高于 35°C', passed: p.temperature <= 35, detail: `实测 ${p.temperature.toFixed(1)}°C / 需要 ≤35°C` },
    { name: '隔离闸已关闭', passed: p.isolated, detail: p.isolated ? '储能与湿润集电板断开连接' : '雨水正在通过集电板泄放储能' },
    { name: '雨天 3 秒保电回归', passed: retained.charge === p.charge && p.isolated, detail: `同一快照：${p.charge.toFixed(1)}% → ${retained.charge.toFixed(1)}%` },
  ];
  const passed = assertions.every(a => a.passed);
  return { runId, passed, assertions, route: [], reason: passed ? '储能与散热同时达标，稳态电源已锁存。' : assertions.find(a => !a.passed)!.detail,
    log: [{ tick: 0, actor: 'CAPACITOR', kind: 'SAMPLE', detail: `储能 ${p.charge.toFixed(1)}% · 温度 ${p.temperature.toFixed(1)}°C · 隔离 ${p.isolated}` },
      { tick: 180, actor: 'RAIN_PROBE', kind: 'RETENTION', detail: `雨天回归后储能 ${retained.charge.toFixed(1)}%` }] };
}
export function add8(a: number, b: number): { value: number; carry: boolean; zero: boolean } {
  const sum = (a & 255) + (b & 255);
  return { value: sum & 255, carry: sum > 255, zero: (sum & 255) === 0 };
}
export function flagOutput(flag: Flag, a: number, b: number): boolean {
  const result = add8(a, b);
  return flag === 'CARRY' ? result.carry : flag === 'ZERO' ? result.zero : true;
}
export const CARRY_EXAMPLES = [[255, 1], [0, 0], [254, 1], [0, 1], [127, 1], [128, 128], [255, 0], [255, 255]] as const;
/** Check the actual branch behavior over the complete unsigned 8-bit input space. */
export function runCarry(flag: Flag, runId = 'CO-01:preview'): RunResult {
  let mismatches = 0;
  let first = '';
  for (let a = 0; a < 256; a++) for (let b = 0; b < 256; b++) {
    const expected = a + b >= 256;
    if (flagOutput(flag, a, b) !== expected) {
      mismatches++;
      if (!first) first = `${a}+${b}：值=${add8(a, b).value}，进位=${expected}，电梯却${flagOutput(flag, a, b) ? '触发' : '未触发'}`;
    }
  }
  const assertions = CARRY_EXAMPLES.map(([a, b]) => ({ name: `${a} + ${b}`, passed: flagOutput(flag, a, b) === (a + b >= 256),
    detail: `值 ${add8(a,b).value} · C=${Number(add8(a,b).carry)} · Z=${Number(add8(a,b).zero)} · 电梯${flagOutput(flag,a,b)?'触发':'静止'}` }));
  assertions.push({ name: '65,536 组输入完整回归', passed: mismatches === 0, detail: mismatches ? `${mismatches} 个反例；首例 ${first}` : '所有 8 位无符号输入均与进位语义一致' });
  return { runId, passed: mismatches === 0, route: [], assertions, reason: mismatches ? first : '进位被正确保留。归零不再让电梯失忆。',
    log: CARRY_EXAMPLES.map(([a,b],i) => ({ tick: i*60, actor: 'ALU8', kind: flagOutput(flag,a,b)?'LIFT_PULSE':'HOLD', detail: `${a}+${b} → ${add8(a,b).value} / carry=${add8(a,b).carry}` })) };
}
export function parseForge(raw: unknown): ForgeProgress | null {
  if (raw === undefined) return freshForge(); // Existing V6 saves migrate without losing the dock.
  if (!raw || typeof raw !== 'object') return null;
  const f = raw as ForgeProgress, p = f.power;
  if (!FORGE_PHASES.includes(f.phase) || !['ZERO','CARRY','POWER'].includes(f.flag) || !p ||
    !Number.isFinite(p.charge) || p.charge < 0 || p.charge > 100 || !Number.isFinite(p.temperature) || p.temperature < 20 || p.temperature > 100 ||
    typeof p.isolated !== 'boolean' || typeof p.energized !== 'boolean' || !Array.isArray(f.evidence) || f.evidence.some(e => !['WF-01','CO-01'].includes(e))) return null;
  const stage = FORGE_PHASES.indexOf(f.phase);
  if (p.energized !== (stage >= 2)) return null;
  if (stage >= 2 && (!runPower(p).passed || !f.evidence.includes('WF-01'))) return null;
  if (stage >= 3 && (!runCarry(f.flag).passed || !f.evidence.includes('CO-01'))) return null;
  return { phase: f.phase, flag: f.flag, evidence: [...new Set(f.evidence)], power: { charge:p.charge, temperature:p.temperature, isolated:p.isolated, energized:p.energized } };
}
