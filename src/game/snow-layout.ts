import type { Surface, V3, WorldBounds } from './physics';
import type { SnowCase, SnowProgress, SnowWeather } from './snow-domain';

export const SNOW_START: V3 = { x: -100, y: 4, z: 93 };
export const SNOW_GUIDE: V3 = { x: -110, y: 4, z: 79 };
export const SNOW_AUDIT: V3 = { x: 0, y: 4, z: -146 };
export const SNOW_POSTS: V3[] = [{ x: 0, y: 4, z: -224 }, { x: -108, y: 4, z: -224 }, { x: -108, y: 4, z: -317 }];
export const SNOW_BOUNDS: WorldBounds = { minZ: -354, maxZ: 117, maxX: 177, fallY: -18 };
export const SNOW_POS: Record<SnowCase, V3> = {
  'WF-02': { x: -100, y: 4, z: 56 }, 'NET-01': { x: 0, y: 4, z: 52 },
  'NET-02': { x: 0, y: 4, z: -39 }, 'NET-03': { x: 105, y: 4, z: -39 }, 'NET-04': { x: 105, y: 4, z: -141 },
  'NET-S1': { x: 0, y: 4, z: 94 }, 'NET-S2': { x: -49, y: 4, z: -39 }, 'NET-S3': { x: 151, y: 4, z: -141 },
};
export const snowSurfaces = (): Surface[] => [
  { id: 'snow-arrival', x: -100, z: 76, w: 64, d: 72, y: 4 },
  { id: 'snow-gate-1', x: -46.5, z: 56, w: 43, d: 11, y: 4, enabled: false },
  { id: 'snow-routing', x: 0, z: 55, w: 50, d: 48, y: 4 },
  { id: 'snow-gate-2', x: 0, z: 9, w: 11, d: 44, y: 4, enabled: false },
  { id: 'snow-reliable', x: 0, z: -39, w: 55, d: 52, y: 4 },
  { id: 'snow-gate-3', x: 52.5, z: -39, w: 50, d: 11, y: 4, enabled: false },
  { id: 'snow-congestion', x: 105, z: -39, w: 55, d: 52, y: 4 },
  { id: 'snow-gate-4', x: 105, z: -91, w: 11, d: 52, y: 4, enabled: false },
  { id: 'snow-clock', x: 105, z: -141, w: 65, d: 48, y: 4 },
  { id: 'snow-gate-5', x: 48.75, z: -141, w: 47.5, d: 11, y: 4, enabled: false },
  { id: 'snow-audit', x: 0, z: -141, w: 50, d: 48, y: 4 },
  { id: 'snow-side-bridge-1', x: 0, z: 82, w: 9, d: 14, y: 4 },
  { id: 'snow-side-1', x: 0, z: 94, w: 22, d: 20, y: 4 },
  { id: 'snow-side-bridge-2', x: -34, z: -39, w: 24, d: 9, y: 4 },
  { id: 'snow-side-2', x: -49, z: -39, w: 22, d: 22, y: 4 },
  { id: 'snow-side-bridge-3', x: 139, z: -141, w: 25, d: 9, y: 4 },
  { id: 'snow-side-3', x: 151, z: -141, w: 22, d: 22, y: 4 },
  { id: 'snow-final-bridge-1', x: 0, z: -187, w: 9, d: 44, y: 4, enabled: false },
  { id: 'snow-post-1', x: 0, z: -224, w: 40, d: 30, y: 4, enabled: false },
  { id: 'snow-final-bridge-2', x: -50.5, z: -224, w: 61, d: 9, y: 4, enabled: false },
  { id: 'snow-post-2', x: -108, z: -224, w: 54, d: 42, y: 4, enabled: false },
  { id: 'snow-final-bridge-3', x: -108, z: -270, w: 9, d: 50, y: 4, enabled: false },
  { id: 'snow-observatory', x: -108, z: -317, w: 60, d: 44, y: 4, enabled: false },
];
export const SNOW_SHELTERS: { x: number; z: number; radius: number }[] = [
  { x: -100, z: 85, radius: 15 }, ...Object.values(SNOW_POS).map(p => ({ x: p.x, z: p.z, radius: 10 })),
  { x: SNOW_AUDIT.x, z: SNOW_AUDIT.z, radius: 13 }, ...SNOW_POSTS.map(p => ({ x: p.x, z: p.z, radius: 10 })),
];
export function inSnowShelter(p: V3): boolean { return SNOW_SHELTERS.some(s => Math.hypot(p.x - s.x, p.z - s.z) <= s.radius); }
export function snowWind(weather: SnowWeather, time: number): { x: number; z: number; gust: number } {
  const strength = weather === 'calm' ? .12 : weather === 'snow' ? 1.25 : 3.5;
  const gust = .58 + .42 * (Math.sin(time * .63) * .5 + .5);
  return { x: strength * gust, z: strength * (.24 + Math.sin(time * .24) * .16), gust };
}
export function snowForces(weather: SnowWeather, time: number, position: V3, braced: boolean) {
  const sheltered = inSnowShelter(position), wind = snowWind(weather, time);
  return { windX: sheltered ? 0 : wind.x * (braced ? .05 : 1), windZ: sheltered ? 0 : wind.z * (braced ? .05 : 1), grip: sheltered ? 1 : braced ? .9 : .25, pace: braced ? .66 : 1 };
}
export function snowCheckpoint(s: SnowProgress): V3 {
  if (s.phase === 'complete') return { ...SNOW_POSTS[2] };
  if (s.phase === 'expedition') return s.delivery ? { ...SNOW_POSTS[s.delivery - 1] } : { ...SNOW_AUDIT, z: SNOW_AUDIT.z + 4 };
  const index = ['wind', 'route', 'reliable', 'congestion', 'clock'].indexOf(s.phase);
  if (index >= 0 && s.evidence.includes((['WF-02', 'NET-01', 'NET-02', 'NET-03', 'NET-04'] as const)[index])) { const p = SNOW_POS[(['WF-02', 'NET-01', 'NET-02', 'NET-03', 'NET-04'] as const)[index]]; return { ...p, z: p.z + 5 }; }
  for (const id of ['NET-04', 'NET-03', 'NET-02', 'NET-01', 'WF-02'] as const) if (s.completed.includes(id)) return { ...SNOW_POS[id], z: SNOW_POS[id].z + 5 };
  return { ...SNOW_START };
}
