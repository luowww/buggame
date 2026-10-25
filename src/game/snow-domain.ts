import type { Assertion, EventLog, RunResult } from './domain';

export const SNOW_MAIN = ['WF-02', 'NET-01', 'NET-02', 'NET-03', 'NET-04'] as const;
export const SNOW_SIDE = ['NET-S1', 'NET-S2', 'NET-S3'] as const;
export const SNOW_CASES = [...SNOW_MAIN, ...SNOW_SIDE] as const;
export type SnowCase = typeof SNOW_CASES[number];
export const SNOW_PHASES = ['arrival', 'wind', 'route', 'reliable', 'congestion', 'clock', 'audit', 'expedition', 'complete'] as const;
export type SnowPhase = typeof SNOW_PHASES[number];
export type SnowWeather = 'calm' | 'snow' | 'whiteout';
export const SNOW_WEATHERS: SnowWeather[] = ['calm', 'snow', 'whiteout'];
export const SNOW_WEATHER_NAMES: Record<SnowWeather, string> = { calm: '晴霁', snow: '降雪', whiteout: '暴风雪' };
export interface WindPatch { alignment: 'fixed' | 'vane'; shutter: 'open' | 'gust'; cutoff: number; heater: 'off' | 'always' | 'thermostat' }
export type Router = 'A' | 'B' | 'C' | 'E' | 'D';
export interface RoutePatch { A: 'B' | 'C'; B: 'C' | 'D'; C: 'A' | 'E'; E: 'B' | 'D'; ttl: number; fallback: boolean }
export interface ReliablePatch { retry: boolean; key: 'none' | 'payload' | 'sequence' | 'session'; ackDuplicates: boolean }
export interface CongestionPatch { window: number; adaptive: boolean; backoff: boolean }
export interface ClockPatch { clock: 'wall' | 'lamport'; tie: 'arrival' | 'node'; barrier: boolean }
export interface DiscoveryPatch { refresh: boolean; respectTTL: boolean; probe: boolean }
export interface ChecksumPatch { algorithm: 'none' | 'sum8' | 'crc8'; retryCorrupt: boolean }
export interface HeartbeatPatch { misses: number; recovery: number; fencing: boolean }
export interface SnowPatches {
  'WF-02': WindPatch; 'NET-01': RoutePatch; 'NET-02': ReliablePatch; 'NET-03': CongestionPatch;
  'NET-04': ClockPatch; 'NET-S1': DiscoveryPatch; 'NET-S2': ChecksumPatch; 'NET-S3': HeartbeatPatch;
}
export interface SnowProgress { phase: SnowPhase; completed: SnowCase[]; evidence: SnowCase[]; patches: SnowPatches; weather: SnowWeather; audited: boolean; delivery: number }
export interface SnowRun extends RunResult { metrics: Record<string, number>; traces: { name: string; log: EventLog[] }[] }
export const freshSnow = (): SnowProgress => ({ phase: 'arrival', completed: [], evidence: [], audited: false, delivery: 0, weather: 'snow', patches: {
  'WF-02': { alignment: 'fixed', shutter: 'open', cutoff: 14, heater: 'off' },
  'NET-01': { A: 'B', B: 'C', C: 'A', E: 'B', ttl: 3, fallback: false },
  'NET-02': { retry: false, key: 'none', ackDuplicates: false },
  'NET-03': { window: 12, adaptive: false, backoff: false },
  'NET-04': { clock: 'wall', tie: 'arrival', barrier: false },
  'NET-S1': { refresh: false, respectTTL: false, probe: false },
  'NET-S2': { algorithm: 'none', retryCorrupt: false },
  'NET-S3': { misses: 1, recovery: 1, fencing: false },
} });
const logEvent = (tick: number, kind: string, actor: string, detail: string): EventLog => ({ tick, kind, actor, detail });
const check = (name: string, passed: boolean, detail: string): Assertion => ({ name, passed, detail });
function report(runId: string, assertions: Assertion[], traces: SnowRun['traces'], metrics: Record<string, number>, success: string): SnowRun {
  const passed = assertions.every(a => a.passed);
  const sample = traces.find(t => t.name === assertions.find(a => !a.passed)?.name) ?? traces[0];
  return { runId, passed, assertions, traces, log: sample?.log ?? [], route: [], metrics, reason: passed ? success : assertions.find(a => !a.passed)!.detail };
}

/** Finite environmental model, deliberately separate from presentation frames. */
export function simulateWind(p: WindPatch, weather: SnowWeather) {
  let energy = 10, ice = 0, stress = 0, minEnergy = 10, peakStress = 0, packets = 0, brownouts = 0, heating = false;
  const log: EventLog[] = [], offset = SNOW_WEATHERS.indexOf(weather);
  for (let tick = 0; tick < 48; tick++) {
    const speed = [4, 6, 8, 12, 15, 7, 5, 11][tick % 8] + offset;
    const aligned = p.alignment === 'vane' || offset === 0 || Math.floor(tick / 12) % 2 === 0;
    const open = p.shutter === 'open' || speed <= p.cutoff;
    energy = Math.min(24, energy + (open && aligned ? speed * .55 : 0));
    ice += open ? 1.1 + offset * .5 : .25;
    if (p.heater === 'always') heating = true;
    else if (p.heater === 'off') heating = false;
    else if (ice >= 6) heating = true;
    if (heating) {
      if (energy >= 4) { energy -= 4; ice = Math.max(0, ice - 6); }
      else brownouts++;
      if (p.heater === 'thermostat' && ice <= 1) heating = false;
    }
    stress = Math.max(0, stress + (open && speed > 10 ? (speed - 10) * 2 : -1));
    if (open && aligned && ice <= 8 && energy >= 0 && stress <= 8) packets++;
    minEnergy = Math.min(minEnergy, energy); peakStress = Math.max(peakStress, stress);
    log.push(logEvent(tick, open ? 'MAST_OPEN' : 'GUST_SHIELD', aligned ? 'VANE' : 'MISALIGNED', `风速档位 ${speed}；${open ? '接收' : '避风'}；冰量 ${ice.toFixed(1)}；储能 ${energy.toFixed(1)}；应力 ${stress.toFixed(1)}；断供 ${brownouts}`));
  }
  return { packets, minEnergy, peakStress, brownouts, ice, log };
}
export function runWind(p: WindPatch, runId = 'WF-02:preview'): SnowRun {
  const runs = SNOW_WEATHERS.map(weather => ({ weather, name: SNOW_WEATHER_NAMES[weather], ...simulateWind(p, weather) }));
  return report(runId, runs.map(r => check(r.name, r.brownouts === 0 && r.peakStress <= 8 && r.packets >= 20,
    `${r.name}：收到 ${r.packets}/20 帧；最低储能 ${r.minEnergy.toFixed(1)}；断供 ${r.brownouts} 次；峰值应力 ${r.peakStress.toFixed(1)}/8`)), runs.map(r => ({ name: r.name, log: r.log })),
  { packets: Math.min(...runs.map(r => r.packets)), peakStress: Math.max(...runs.map(r => r.peakStress)), brownouts: Math.max(...runs.map(r => r.brownouts)) }, '三种天气都能保住天线、电源与接收窗口。');
}

export const ROUTER_LINKS: Record<Exclude<Router, 'D'>, readonly Router[]> = { A: ['B', 'C'], B: ['C', 'D'], C: ['A', 'E'], E: ['B', 'D'] };
export function simulateRoute(p: RoutePatch, weather: SnowWeather) {
  const down = weather === 'calm' ? [] : weather === 'snow' ? ['B-D'] : ['B-D', 'A-C'];
  let node: Router = 'A', ttl = p.ttl; const route: Router[] = ['A'], log: EventLog[] = [];
  for (let hop = 0; hop < 16; hop++) {
    if (node === 'D') return { arrived: true, route, ttl, log };
    const source = route.length === 1;
    if (ttl <= 0 || !source && ttl <= 1) { log.push(logEvent(hop, 'TTL_EXPIRED', node, `TTL=${ttl}，${node} 不能继续转发；目的地尚未到达`)); break; }
    const router = node as Exclude<Router, 'D'>, preferred = p[router];
    const candidates: Router[] = [preferred, ...ROUTER_LINKS[router].filter(n => n !== preferred)];
    const next: Router | undefined = p.fallback ? candidates.find(n => !down.includes(`${router}-${n}`)) : candidates[0];
    if (!next || down.includes(`${node}-${next}`)) { log.push(logEvent(hop, 'LINK_DOWN', node, `${node}→${next ?? '?'} 被风雪切断；未找到可用备路`)); break; }
    if (!source) ttl--;
    log.push(logEvent(hop, 'PACKET_HOP', node, `${node} → ${next}；剩余 TTL ${ttl}${next !== p[node] ? '；健康检查切换备用链路' : ''}`)); node = next; route.push(node);
  }
  return { arrived: false, route, ttl, log };
}
export function runRouting(p: RoutePatch, runId = 'NET-01:preview'): SnowRun {
  const runs = SNOW_WEATHERS.map(weather => ({ weather, name: SNOW_WEATHER_NAMES[weather], ...simulateRoute(p, weather) }));
  return report(runId, runs.map(r => check(r.name, r.arrived, `${r.name}：${r.route.join(' → ')}；${r.arrived ? '目的地已收到' : r.log.at(-1)?.detail}`)), runs.map(r => ({ name: r.name, log: r.log })),
  { hops: Math.max(...runs.map(r => r.route.length - 1)), delivered: runs.filter(r => r.arrived).length }, '绕过断链和环路，三种天气均将消息送到 D。');
}

interface Letter { session: string; seq: number; payload: string }
export const LETTERS: readonly Letter[] = [{ session: 'AM', seq: 1, payload: '需要药品' }, { session: 'AM', seq: 2, payload: '需要药品' }, { session: 'PM', seq: 1, payload: '北站有人' }, { session: 'PM', seq: 2, payload: '需要燃料' }];
export function simulateReliable(p: ReliablePatch, weather: SnowWeather) {
  const seen = new Set<string>(), counts = new Map<string, number>(), log: EventLog[] = [];
  let acknowledgements = 0, copies = 0, tick = 0;
  for (const letter of LETTERS) {
    const identity = `${letter.session}:${letter.seq}`; let acked = false;
    for (let attempt = 0; attempt < (p.retry ? 4 : 1) && !acked; attempt++) {
      tick += attempt ? 4 : 1;
      const dataLost = weather === 'whiteout' && attempt === 0 && letter.seq === 2;
      if (dataLost) { log.push(logEvent(tick, 'DATA_LOST', identity, '数据副本消失在风墙里，等待超时重发')); continue; }
      copies++;
      const key = p.key === 'payload' ? letter.payload : p.key === 'sequence' ? String(letter.seq) : identity;
      const duplicate = p.key !== 'none' && seen.has(key);
      if (!duplicate) { seen.add(key); counts.set(identity, (counts.get(identity) ?? 0) + 1); }
      log.push(logEvent(tick, duplicate ? 'DUPLICATE' : 'DELIVER', identity, `${duplicate ? '识别副本，业务不重复执行' : '业务接收：' + letter.payload}；第 ${attempt + 1} 个副本`));
      const lostAck = weather !== 'calm' && attempt === 0 && letter.seq === 1;
      if (duplicate && !p.ackDuplicates) { log.push(logEvent(tick, 'ACK_SUPPRESSED', identity, '重复包被丢弃，但发送者仍未收到确认')); continue; }
      if (lostAck) { log.push(logEvent(tick, 'ACK_LOST', identity, '业务已经执行，ACK 却丢失了')); continue; }
      acked = true; acknowledgements++; log.push(logEvent(tick, 'ACK', identity, '发送者收到确认，停止重传'));
    }
  }
  return { exact: LETTERS.every(l => counts.get(`${l.session}:${l.seq}`) === 1), acknowledgements, copies, counts, log };
}
export function runReliable(p: ReliablePatch, runId = 'NET-02:preview'): SnowRun {
  const runs = SNOW_WEATHERS.map(weather => ({ name: SNOW_WEATHER_NAMES[weather], ...simulateReliable(p, weather) }));
  return report(runId, runs.map(r => {
    const problems=LETTERS.flatMap(letter=>{const id=`${letter.session}:${letter.seq}`,count=r.counts.get(id)??0;return count===1?[]:[count===0?`${id} 未交付`:`${id} 重复执行 ${count} 次`];});
    return check(r.name, r.exact && r.acknowledgements === LETTERS.length, `${r.name}：${r.copies} 个数据副本；${r.acknowledgements}/4 已确认；${problems.length?problems.join('；'):'四封逻辑信各执行一次'}`);
  }),
    runs.map(r => ({ name: r.name, log: r.log })), { copies: Math.max(...runs.map(r => r.copies)), confirmed: Math.min(...runs.map(r => r.acknowledgements)) }, '保留重传，用会话与序号识别消息，重复包也返回确认。');
}

/** Round-based bottleneck model, not a TCP implementation or a real network measurement. */
export function simulateCongestion(p: CongestionPatch, weather: SnowWeather) {
  let sent = 0, delivered = 0, dropped = 0, elapsed = 0, window = p.window, previousLoss = false;
  const log: EventLog[] = [], offset = SNOW_WEATHERS.indexOf(weather);
  for (let round = 0; round < 40 && delivered < 48 && elapsed <= 90; round++) {
    const baseCapacity = Math.max(2, (round >= 2 && round < 6 ? 3 : round >= 9 && round < 12 ? 4 : 8) - offset);
    // The authored shared link carries two competing retry copies after an uncooled overflow.
    const capacity = Math.max(1, baseCapacity - (previousLoss && !p.backoff ? 2 : 0));
    const burst = Math.min(Math.max(1, Math.floor(window)), 48 - delivered), accepted = Math.min(burst, capacity), loss = burst - accepted;
    const wait = previousLoss && p.backoff ? 2 : 0;
    elapsed += 2 + offset + wait; sent += burst; delivered += accepted; dropped += loss;
    log.push(logEvent(elapsed, loss ? 'QUEUE_OVERFLOW' : 'WINDOW_ACK', 'BOTTLENECK', `窗口 ${Math.floor(window)}；容量 ${capacity}；送达 ${accepted}；丢弃 ${loss}；累计 ${delivered}/48；${wait ? '退避 2 周期' : '立即发送'}`));
    if (p.adaptive) window = loss ? Math.max(1, Math.floor(window / 2)) : Math.min(p.window, window + 1);
    previousLoss = loss > 0;
  }
  return { sent, delivered, dropped, elapsed, log };
}
export function runCongestion(p: CongestionPatch, runId = 'NET-03:preview'): SnowRun {
  const runs = SNOW_WEATHERS.map(weather => ({ name: SNOW_WEATHER_NAMES[weather], ...simulateCongestion(p, weather) }));
  return report(runId, runs.map(r => check(r.name, r.delivered === 48 && r.dropped <= 18 && r.elapsed <= 76, `${r.name}：${r.delivered}/48 送达；丢弃 ${r.dropped}/18；耗时 ${r.elapsed}/76 周期`)),
    runs.map(r => ({ name: r.name, log: r.log })), { elapsed: Math.max(...runs.map(r => r.elapsed)), dropped: Math.max(...runs.map(r => r.dropped)) }, '三种负载均在既定耗时与丢弃预算内完整送达。');
}

export const CLOCK_EVENTS = [
  { id: 'A1', node: 'A', wall: 100, parents: [] }, { id: 'B1', node: 'B', wall: -30, parents: [] },
  { id: 'A2', node: 'A', wall: 101, parents: ['A1'] }, { id: 'C1', node: 'C', wall: 5, parents: ['A2', 'B1'] },
  { id: 'B2', node: 'B', wall: -29, parents: ['C1', 'B1'] }, { id: 'A3', node: 'A', wall: 102, parents: ['B2', 'A2'] },
] as const;
export function logicalTimes(): Record<string, number> {
  const times: Record<string, number> = {}, locals: Record<string, number> = {};
  for (const e of CLOCK_EVENTS) { const t = Math.max(locals[e.node] ?? 0, ...e.parents.map(id => times[id])) + 1; times[e.id] = t; locals[e.node] = t; }
  return times;
}
export function runClock(p: ClockPatch, runId = 'NET-04:preview'): SnowRun {
  const times = logicalTimes(), arrivals = [[3, 1, 0, 5, 2, 4], [1, 0, 2, 4, 3, 5], [5, 2, 0, 3, 4, 1], [0, 2, 1, 3, 5, 4]];
  const runs = arrivals.map((indices, replica) => {
    const received = indices.map(i => CLOCK_EVENTS[i]), ordered = p.barrier ? [...received].sort((a, b) =>
      (p.clock === 'lamport' ? times[a.id] - times[b.id] : a.wall - b.wall) || (p.tie === 'node' ? a.node.localeCompare(b.node) : received.indexOf(a) - received.indexOf(b))) : received;
    const ids = ordered.map(e => e.id), valid = ordered.every(e => e.parents.every(parent => ids.indexOf(parent) < ids.indexOf(e.id)));
    const log = ordered.map((e, tick) => logEvent(tick, 'COMMIT_EVENT', `TOWER-${replica + 1}`, `${e.id}；逻辑 ${times[e.id]} / 墙钟 ${e.wall}；前因 ${e.parents.join(',') || '无'}`));
    return { name: `塔 ${replica + 1}`, ids, valid, log };
  });
  const same = runs.every(r => r.ids.join(',') === runs[0].ids.join(','));
  return report(runId, runs.map(r => check(r.name, r.valid && same, `${r.ids.join(' → ')}；${r.valid ? '前因先于后果' : '出现后果早于前因'}；${same ? '四塔一致' : '各塔提交顺序不同'}`)),
    runs.map(r => ({ name: r.name, log: r.log })), { replicas: runs.length, consistent: Number(same) }, '等本轮六条消息收齐，以逻辑时间和节点编号建立同一提交顺序。');
}

export function runDiscovery(p: DiscoveryPatch, runId = 'NET-S1:preview'): SnowRun {
  const scenarios = [{ name: '缓存仍有效', at: 3, wanted: 1, failed: '' }, { name: '旧地址仍回应', at: 14, wanted: 2, failed: '' }, { name: '新站点失联', at: 23, wanted: 2, failed: 'R2' }];
  const runs = scenarios.map(s => {
    const records = [{ id: 'R1', expires: 8, generation: 1 }, ...(p.refresh && s.at >= 10 ? [{ id: 'R2', expires: 40, generation: 2 }, { id: 'R3', expires: 40, generation: 2 }] : [])];
    const selected = records.filter(r => !p.respectTTL || r.expires > s.at).find(r => !p.probe || r.id !== s.failed);
    const valid = !!selected && selected.id !== s.failed && selected.generation === s.wanted;
    return { ...s, valid, log: [logEvent(s.at, valid ? 'DISCOVERY_OK' : 'STALE_ENDPOINT', selected?.id ?? 'NONE', `查询时间 ${s.at}；选中 ${selected?.id ?? '无记录'}；需要第 ${s.wanted} 代服务；存活探测${p.probe ? '开启' : '关闭'}`)] };
  });
  return report(runId, runs.map(r => check(r.name, r.valid, r.log[0].detail)), runs.map(r => ({ name: r.name, log: r.log })), { resolved: runs.filter(r => r.valid).length }, '刷新权威记录、尊重缓存有效期，再选择健康的候选站点。');
}

export function crc8(bytes: readonly number[]): number {
  let crc = 0;
  for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = crc & 0x80 ? ((crc << 1) ^ 0x07) & 0xff : (crc << 1) & 0xff; }
  return crc;
}
export function runChecksum(p: ChecksumPatch, runId = 'NET-S2:preview'): SnowRun {
  const original = [20, 30, 41, 57], variants = [[20, 30, 41, 57], [21, 30, 41, 57], [21, 29, 41, 57], [20, 30, 9, 57]];
  const digest = (bytes: number[]): number => p.algorithm === 'crc8' ? crc8(bytes) : p.algorithm === 'sum8' ? bytes.reduce((a, b) => (a + b) & 255, 0) : 0;
  const expected = digest(original);
  const runs = variants.map((bytes, i) => {
    const detected = digest(bytes) !== expected, delivered = detected && p.retryCorrupt ? original : detected ? null : bytes;
    const valid = delivered?.join(',') === original.join(',');
    const log = [logEvent(0, detected ? 'CORRUPT_DETECTED' : 'CHECK_ACCEPTED', `FRAME-${i}`, `收到 [${bytes.join(' ')}]；校验 ${digest(bytes)} / 原码 ${expected}`)];
    if (detected) log.push(logEvent(1, p.retryCorrupt ? 'NAK_RETRY' : 'FRAME_DROPPED', 'RECEIVER', p.retryCorrupt ? '丢弃坏副本，请求重发，第二次收到原始帧' : '发现损坏但没有请求重发，消息永久缺失'));
    return { name: `损坏样本 ${i + 1}`, valid, log };
  });
  return report(runId, runs.map(r => check(r.name, r.valid, r.valid ? '只交付原始数据' : '损坏数据被接受，或检测后没有恢复交付')), runs, { valid: runs.filter(r => r.valid).length }, 'CRC-8 识别本关的位错误，坏副本被丢弃并重传。');
}

export function simulateHeartbeat(p: HeartbeatPatch, outage: boolean) {
  let missing = 0, recovering = 0, backup = false, firstFailover = -1, restored = -1, failovers = 0, epoch = 0, staleAccepted = false;
  const log: EventLog[] = [];
  for (let tick = 0; tick < 30; tick++) {
    const ok = outage ? tick < 8 || tick === 20 || tick >= 22 : tick !== 3 && tick !== 4;
    if (!ok) { missing++; recovering = 0; } else { missing = 0; recovering++; }
    if (!backup && missing >= p.misses) { backup = true; epoch++; failovers++; if (firstFailover < 0) firstFailover = tick; log.push(logEvent(tick, 'FAILOVER', 'BACKUP', `接管，权限代次 epoch=${epoch}`)); }
    if (backup && recovering >= p.recovery) { backup = false; epoch++; if (restored < 0) restored = tick; log.push(logEvent(tick, 'FAILBACK', 'PRIMARY', `连续 ${recovering} 次成功后恢复；epoch=${epoch}`)); }
    if (outage && tick === 13) { staleAccepted = !p.fencing && epoch > 0; log.push(logEvent(tick, staleAccepted ? 'STALE_WRITE_ACCEPTED' : 'STALE_WRITE_REJECTED', 'OLD-PRIMARY', `旧 epoch=0 的延迟写入${staleAccepted ? '覆盖了新数据' : '被代次栅栏拒绝'}`)); }
    if (tick < 10 || tick >= 19 && tick < 25) log.push(logEvent(tick, ok ? 'HEARTBEAT_OK' : 'HEARTBEAT_MISS', 'PRIMARY', `连续缺失 ${missing}；连续成功 ${recovering}`));
  }
  return { failovers, firstFailover, restored, staleAccepted, log };
}
export function runHeartbeat(p: HeartbeatPatch, runId = 'NET-S3:preview'): SnowRun {
  const gust = simulateHeartbeat(p, false), outage = simulateHeartbeat(p, true);
  const assertions = [check('短暂风墙不误切', gust.failovers === 0, `两次短暂丢失触发 ${gust.failovers} 次接管`),
    check('真正失联及时接管', outage.firstFailover >= 8 && outage.firstFailover <= 12, `首个接管时刻 ${outage.firstFailover}，要求 8–12`),
    check('恢复需要连续证据', outage.restored >= 23 && outage.restored <= 25, `恢复时刻 ${outage.restored}，单次恢复信号不应回切`),
    check('旧权限不能写入', !outage.staleAccepted && p.fencing, '旧主站的延迟写入必须被当前 epoch 拒绝')];
  return report(runId, assertions, [{ name: '短暂风墙不误切', log: gust.log }, ...assertions.slice(1).map(a => ({ name: a.name, log: outage.log }))], { failoverAt: outage.firstFailover, restoredAt: outage.restored }, '等待足够的心跳证据，用代次栅栏拒绝旧主站写入。');
}

const oneOf = (v: unknown, choices: readonly unknown[]): boolean => choices.includes(v);
const integer = (v: unknown, min: number, max: number): boolean => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;
export function parseSnowPatch<K extends SnowCase>(id: K, raw: unknown): SnowPatches[K] | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const p = raw as unknown as Record<string, unknown>; let clean: unknown = null;
  if (id === 'WF-02' && oneOf(p.alignment, ['fixed', 'vane']) && oneOf(p.shutter, ['open', 'gust']) && integer(p.cutoff, 7, 15) && oneOf(p.heater, ['off', 'always', 'thermostat'])) clean = { alignment: p.alignment, shutter: p.shutter, cutoff: p.cutoff, heater: p.heater };
  if (id === 'NET-01' && oneOf(p.A, ['B', 'C']) && oneOf(p.B, ['C', 'D']) && oneOf(p.C, ['A', 'E']) && oneOf(p.E, ['B', 'D']) && integer(p.ttl, 1, 10) && typeof p.fallback === 'boolean') clean = { A: p.A, B: p.B, C: p.C, E: p.E, ttl: p.ttl, fallback: p.fallback };
  if (id === 'NET-02' && typeof p.retry === 'boolean' && oneOf(p.key, ['none', 'payload', 'sequence', 'session']) && typeof p.ackDuplicates === 'boolean') clean = { retry: p.retry, key: p.key, ackDuplicates: p.ackDuplicates };
  if (id === 'NET-03' && integer(p.window, 1, 16) && typeof p.adaptive === 'boolean' && typeof p.backoff === 'boolean') clean = { window: p.window, adaptive: p.adaptive, backoff: p.backoff };
  if (id === 'NET-04' && oneOf(p.clock, ['wall', 'lamport']) && oneOf(p.tie, ['arrival', 'node']) && typeof p.barrier === 'boolean') clean = { clock: p.clock, tie: p.tie, barrier: p.barrier };
  if (id === 'NET-S1' && [p.refresh, p.respectTTL, p.probe].every(v => typeof v === 'boolean')) clean = { refresh: p.refresh, respectTTL: p.respectTTL, probe: p.probe };
  if (id === 'NET-S2' && oneOf(p.algorithm, ['none', 'sum8', 'crc8']) && typeof p.retryCorrupt === 'boolean') clean = { algorithm: p.algorithm, retryCorrupt: p.retryCorrupt };
  if (id === 'NET-S3' && integer(p.misses, 1, 5) && integer(p.recovery, 1, 3) && typeof p.fencing === 'boolean') clean = { misses: p.misses, recovery: p.recovery, fencing: p.fencing };
  return clean as SnowPatches[K] | null;
}
export function evaluateSnow<K extends SnowCase>(id: K, raw: SnowPatches[K], runId = `${id}:preview`): SnowRun {
  const p = parseSnowPatch(id, raw);
  if (!p) return report(runId, [check('参数结构', false, '参数类型或范围无效，实验未提交。')], [], {}, '');
  switch (id) {
    case 'WF-02': return runWind(p as WindPatch, runId);
    case 'NET-01': return runRouting(p as RoutePatch, runId);
    case 'NET-02': return runReliable(p as ReliablePatch, runId);
    case 'NET-03': return runCongestion(p as CongestionPatch, runId);
    case 'NET-04': return runClock(p as ClockPatch, runId);
    case 'NET-S1': return runDiscovery(p as DiscoveryPatch, runId);
    case 'NET-S2': return runChecksum(p as ChecksumPatch, runId);
    case 'NET-S3': return runHeartbeat(p as HeartbeatPatch, runId);
  }
  throw new Error('未知雪原设备。');
}
export function snowUnlocked(state: SnowProgress, id: SnowCase): boolean {
  if (state.completed.includes(id)) return true;
  if (id === 'NET-S1') return state.completed.includes('NET-01');
  if (id === 'NET-S2') return state.completed.includes('NET-02');
  if (id === 'NET-S3') return state.completed.includes('NET-03');
  return SNOW_MAIN[SNOW_PHASES.indexOf(state.phase) - 1] === id;
}
export function runSnowAudit(state: SnowProgress, runId = 'CITY-04:audit'): SnowRun {
  const runs = SNOW_MAIN.map(id => ({ id, run: evaluateSnow(id, state.patches[id], `${runId}/${id}`) }));
  return report(runId, runs.map(({ id, run }) => check(id, state.completed.includes(id) && state.evidence.includes(id) && run.passed, run.reason)),
    runs.map(({ id, run }) => ({ name: id, log: run.log.map(e => ({ ...e, detail: `${id} / ${e.detail}` })) })), { systems: runs.length }, '天线、路由、可靠消息、窗口与因果顺序一起通过。现在亲自完成最后一程。');
}
export class SnowCampaign {
  constructor(public data: SnowProgress) {}
  meet(): void { if (this.data.phase === 'arrival') this.data.phase = 'wind'; }
  observe(id: SnowCase): boolean { if (!snowUnlocked(this.data, id)) return false; if (!this.data.evidence.includes(id)) this.data.evidence.push(id); return true; }
  preview<K extends SnowCase>(id: K, patch: SnowPatches[K], runId?: string): SnowRun {
    if (!snowUnlocked(this.data, id) || !this.data.evidence.includes(id)) throw new Error('先到已开放设备旁扫描证据。');
    return evaluateSnow(id, patch, runId);
  }
  submit<K extends SnowCase>(id: K, patch: SnowPatches[K], runId?: string): SnowRun {
    const result = this.preview(id, patch, runId); if (!result.passed) return result;
    this.data.patches[id] = structuredClone(parseSnowPatch(id, patch)!);
    if (!this.data.completed.includes(id)) { this.data.completed.push(id); if (SNOW_MAIN.includes(id as typeof SNOW_MAIN[number])) this.data.phase = SNOW_PHASES[SNOW_PHASES.indexOf(this.data.phase) + 1]; }
    return result;
  }
  audit(runId?: string): SnowRun {
    if (this.data.phase !== 'audit') throw new Error('先完成五条主线，再检查风暴协议。');
    const run = runSnowAudit(this.data, runId); if (run.passed) { this.data.audited = true; this.data.phase = 'expedition'; this.data.delivery = 0; this.data.weather = 'whiteout'; } return run;
  }
  deliver(station: number): boolean {
    if (this.data.phase !== 'expedition' || this.data.weather !== 'whiteout' || !this.data.audited || station !== this.data.delivery + 1 || station > 3 || !runSnowAudit(this.data).passed) return false;
    this.data.delivery = station; return true;
  }
  finish(): boolean {
    if (!['expedition', 'complete'].includes(this.data.phase) || this.data.phase==='expedition'&&this.data.weather!=='whiteout' || !this.data.audited || this.data.delivery !== 3 || !runSnowAudit(this.data).passed) return false;
    this.data.phase = 'complete'; return true;
  }
}
export function parseSnow(raw: unknown): SnowProgress | null {
  if (raw === undefined) return freshSnow();
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as SnowProgress;
  if (!SNOW_PHASES.includes(p.phase) || !SNOW_WEATHERS.includes(p.weather) || typeof p.audited !== 'boolean' || !integer(p.delivery, 0, 3) || !p.patches || typeof p.patches !== 'object') return null;
  for (const list of [p.completed, p.evidence]) if (!Array.isArray(list) || new Set(list).size !== list.length || list.some(id => !SNOW_CASES.includes(id))) return null;
  const patches = freshSnow().patches;
  for (const id of SNOW_CASES) { const clean = parseSnowPatch(id, p.patches[id]); if (!clean) return null; Object.assign(patches, { [id]: clean }); }
  const stage = SNOW_PHASES.indexOf(p.phase), required = Math.min(5, Math.max(0, stage - 1));
  if (SNOW_MAIN.some((id, i) => p.completed.includes(id) !== (i < required)) || p.audited !== (stage >= 7)) return null;
  if (stage < 7 && p.delivery !== 0 || stage === 8 && p.delivery !== 3 || stage === 7 && p.weather !== 'whiteout') return null;
  const clean = { ...p, patches };
  for (const id of p.evidence) if (!p.completed.includes(id) && !snowUnlocked(clean, id)) return null;
  for (const id of p.completed) {
    if (!p.evidence.includes(id) || !evaluateSnow(id, patches[id]).passed) return null;
    const prerequisite = ({ 'NET-S1': 'NET-01', 'NET-S2': 'NET-02', 'NET-S3': 'NET-03' } as Partial<Record<SnowCase, SnowCase>>)[id];
    if (prerequisite && !p.completed.includes(prerequisite)) return null;
  }
  return { phase: p.phase, completed: [...p.completed], evidence: [...p.evidence], patches, weather: p.weather, audited: p.audited, delivery: p.delivery };
}
