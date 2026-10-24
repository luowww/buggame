/** A fixed-step kinematic motor for authored rectangular decks, obstacles and ramps. */
export interface V3 { x: number; y: number; z: number }
export interface Surface { id: string; x: number; z: number; w: number; d: number; y: number; rise?: number; enabled?: boolean }
export interface Obstacle { x: number; z: number; w: number; d: number; bottom: number; top: number }
export interface Intent { x: number; z: number; jump: boolean; sprint: boolean }
export interface WorldBounds { minZ:number; maxZ:number; maxX:number; fallY:number }
export const DOCK_BOUNDS:WorldBounds={minZ:-114,maxZ:114,maxX:145,fallY:-7};
export const START: V3 = { x: 0, y: 3, z: 31 };
export const A_CHECKPOINT={x:0,y:13,z:-44};
export const CHECKPOINTS = { meet: START, reorder: { x: 0, y: 3, z: 10 }, rail: { x: 0, y: 3, z: 9 }, board: { x: 5, y: 13, z: -46 }, complete: { x: 18, y: 13, z: -98 } };
export function surfaceHeight(s: Surface, x: number, z: number, pad = 0): number | null {
  if (s.enabled === false || Math.abs(x - s.x) > s.w / 2 + pad || Math.abs(z - s.z) > s.d / 2 + pad) return null;
  return s.y + (s.rise ?? 0) * Math.min(1, Math.max(0, (s.z + s.d / 2 - z) / s.d));
}
export function floorAt(surfaces: readonly Surface[], x: number, z: number, maxY = Infinity): number | null {
  let top: number | null = null;
  for (const s of surfaces) {
    const y = surfaceHeight(s, x, z);
    if (y !== null && y <= maxY && (top === null || y > top)) top = y;
  }
  return top;
}
export class Motor {
  position: V3 = { ...START };
  velocity: V3 = { x: 0, y: 0, z: 0 };
  checkpoint: V3 = { ...START };
  grounded = true;
  speed = 0;
  facing = Math.PI;
  private coyote = 0.12;
  private jumpBuffer = 0;
  private jumpHeld = false;
  private respawnTimer = 0;
  falls = 0;
  constructor(public surfaces: Surface[], public obstacles: Obstacle[] = [], public bounds:WorldBounds={...DOCK_BOUNDS}) {}
  warp(position: V3): void {
    this.position = { ...position }; this.velocity = { x: 0, y: 0, z: 0 };
    this.grounded = true; this.coyote = 0.12; this.jumpBuffer = 0; this.respawnTimer = 0;
  }
  setCheckpoint(position: V3): void { this.checkpoint = { ...position }; }
  reset(): void { this.falls = 0; this.setCheckpoint(START); this.warp(START); }
  private blocked(x: number, z: number): boolean {
    return this.obstacles.some(b => this.position.y + 1.7 > b.bottom && this.position.y < b.top - 0.2 &&
      Math.abs(x - b.x) < b.w / 2 + 0.36 && Math.abs(z - b.z) < b.d / 2 + 0.36);
  }
  step(dt: number, input: Intent): boolean {
    if (input.jump && !this.jumpHeld) this.jumpBuffer = 0.12;
    this.jumpHeld = input.jump;
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    this.coyote = this.grounded ? 0.12 : Math.max(0, this.coyote - dt);
    if (this.jumpBuffer > 0 && this.coyote > 0) {
      this.velocity.y = 7.1; this.grounded = false; this.jumpBuffer = 0; this.coyote = 0;
    }
    const magnitude = Math.hypot(input.x, input.z);
    const speed = input.sprint ? 9.2 : 5.4;
    const factor = Math.min(1, 18 * dt) * (this.grounded ? 1 : 0.45);
    this.velocity.x += ((magnitude > 0 ? input.x / Math.max(1, magnitude) * speed : 0) - this.velocity.x) * factor;
    this.velocity.z += ((magnitude > 0 ? input.z / Math.max(1, magnitude) * speed : 0) - this.velocity.z) * factor;
    const nx = this.position.x + this.velocity.x * dt;
    const nz = this.position.z + this.velocity.z * dt;
    if (!this.blocked(nx, this.position.z)) this.position.x = nx;
    else this.velocity.x = 0;
    if (!this.blocked(this.position.x, nz)) this.position.z = nz;
    else this.velocity.z = 0;
    this.speed = Math.hypot(this.velocity.x, this.velocity.z);
    if (this.speed > 0.2) this.facing = Math.atan2(this.velocity.x, this.velocity.z);
    const priorY = this.position.y;
    this.velocity.y -= 21 * dt;
    this.position.y += this.velocity.y * dt;
    const floor = floorAt(this.surfaces, this.position.x, this.position.z, priorY + (this.grounded ? 0.65 : 0.05));
    if (floor !== null && this.position.y <= floor && this.velocity.y <= 0) {
      this.position.y = floor; this.velocity.y = 0; this.grounded = true;
    } else this.grounded = false;
    if (this.position.y < this.bounds.fallY || Math.abs(this.position.x) > this.bounds.maxX || this.position.z < this.bounds.minZ || this.position.z > this.bounds.maxZ) {
      this.respawnTimer += dt;
      if (this.respawnTimer >= 0.25) { this.falls++; this.warp(this.checkpoint); return true; }
    } else this.respawnTimer=0;
    return false;
  }
}

export function makeSurfaces(): Surface[] {
  return [
    { id: 'promenade', x: 0, z: 24, w: 24, d: 46, y: 3 },
    { id: 'mira-dock', x: -19, z: 17, w: 14, d: 20, y: 3 },
    { id: 'reorder-bridge', x: 0, z: -6, w: 10, d: 14, y: 3, enabled: false },
    { id: 'maintenance-ramp', x: 0, z: -28, w: 10, d: 30, y: 3, rise: 10 },
    { id: 'station-A', x: 0, z: -49, w: 20, d: 14, y: 13 },
    { id: 'inspection-bridge', x: 18, z: -43, w: 22, d: 5, y: 13 },
    { id: 'inspection-corner', x: 32, z: -46, w: 8, d: 12, y: 13 },
    { id: 'station-B', x: 37, z: -56, w: 18, d: 15, y: 13 },
    { id: 'station-C', x: 56, z: -82, w: 18, d: 16, y: 13 },
    { id: 'station-END', x: 18, z: -98, w: 22, d: 16, y: 13 },
    { id: 'roof-ramp', x: -18, z: 30, w: 10, d: 24, y: 3, rise: 8 },
    { id: 'roof-walk', x: -18, z: 13, w: 12, d: 10, y: 11 },
    { id: 'core-ramp', x: -18, z: -3, w: 8, d: 22, y: 11, rise: 12 },
    { id: 'core-lookout', x: -18, z: -18, w: 16, d: 10, y: 23 },
    { id: 'roof-access', x: -14, z: 44, w: 20, d: 8, y: 3 },
  ];
}
