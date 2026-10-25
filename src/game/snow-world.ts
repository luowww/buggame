import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { makeAvatar } from './world';
import { SNOW_GUIDE, SNOW_POS, SNOW_POSTS, SNOW_SHELTERS, snowSurfaces, snowWind } from './snow-layout';
import { SNOW_CASES, SNOW_MAIN, type SnowCase, type SnowProgress, type SnowRun, type SnowWeather, type WindPatch } from './snow-domain';
import type { Obstacle, Surface, V3 } from './physics';

const C = { snow: '#e8e7dd', rust: '#ac4731', orange: '#df6b36', ink: '#283331', warm: '#ffcc83', green: '#4e897b', ice: '#7a989e' };
type Box = [number, number, number, number, number, number, number?];
function placardTexture(title: string, subtitle: string, accent = C.rust): T.CanvasTexture {
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 384;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#e9e6d9'; ctx.fillRect(0, 0, 1024, 384); ctx.fillStyle = accent; ctx.fillRect(0, 0, 18, 384);
  ctx.strokeStyle = '#a29d8c'; ctx.lineWidth = 2; ctx.strokeRect(28, 24, 966, 336);
  ctx.fillStyle = '#283331'; ctx.font = '600 84px "Microsoft YaHei", sans-serif'; ctx.fillText(title, 62, 167, 902);
  ctx.fillStyle = accent; ctx.font = '30px monospace'; ctx.fillText(subtitle, 65, 268, 885);
  ctx.fillStyle = '#a9a495'; ctx.fillRect(62, 307, 870, 2);
  const texture = new T.CanvasTexture(canvas); texture.colorSpace = T.SRGBColorSpace; return texture;
}
function snowTexture(): T.CanvasTexture {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#e7e7db'; ctx.fillRect(0, 0, 512, 512);
  let seed = 891; const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return (seed >>> 0) / 4294967296; };
  for (let i = 0; i < 1800; i++) { ctx.fillStyle = i % 3 ? '#c3c8bf26' : '#ffffff30'; const x = rand() * 512, y = rand() * 512; ctx.fillRect(x, y, 2 + rand() * 32, .5 + rand()); }
  for (const x of [210, 294]) { ctx.strokeStyle = '#b3b8ac32'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 12, 512); ctx.stroke(); }
  const texture = new T.CanvasTexture(canvas); texture.colorSpace = T.SRGBColorSpace; texture.wrapS = texture.wrapT = T.RepeatWrapping; texture.repeat.set(3, 3); return texture;
}
export class SnowWorld {
  scene = new T.Scene(); surfaces = snowSurfaces(); obstacles: Obstacle[] = []; solids: T.Box3[] = [];
  hero = makeAvatar(C.orange); guide = makeAvatar(C.rust); focus: V3 = { ...SNOW_POS['WF-02'] };
  weather: SnowWeather = 'snow'; environmentTime = 0; braced = false;
  private time = 0; private severity = .55; private complete = false; private carrying = false;
  private solved = new Set<SnowCase>(); private lastTrace = '';
  private windPatch:WindPatch={alignment:'fixed',shutter:'open',cutoff:14,heater:'off'};
  private snow = new T.MeshStandardMaterial({ color: C.snow, map: snowTexture(), roughness: .92, metalness: .02 });
  private rock = new T.MeshStandardMaterial({ color: '#48534e', roughness: 1 });
  private steel = new T.MeshStandardMaterial({ color: C.ink, roughness: .68, metalness: .62 });
  private rust = new T.MeshStandardMaterial({ color: C.rust, roughness: .77, metalness: .36 });
  private ivory = new T.MeshStandardMaterial({ color: '#d4d2c0', roughness: .72, metalness: .24 });
  private glass = new T.MeshStandardMaterial({ color: '#293c3a', roughness: .21, metalness: .61, emissive: '#c58645', emissiveIntensity: .26 });
  private amber = new T.MeshBasicMaterial({ color: C.warm }); private green = new T.MeshBasicMaterial({ color: '#73af99' });
  private red = new T.MeshBasicMaterial({ color: '#dd5736' }); private dim = new T.MeshBasicMaterial({ color: '#686c5d' });
  private unit = new T.BoxGeometry(1, 1, 1); private dummy = new T.Object3D(); private batches = new Map<T.Material, Box[]>();
  private gates: { group: T.Group; barrier: T.Mesh; surface: Surface }[] = [];
  private finalBridges: T.Group[] = [];
  private signs = new Map<SnowCase, T.Mesh>(); private lamps = new Map<SnowCase, T.Mesh>();
  private flags: T.Mesh[] = []; private dishes: T.Group[] = []; private packets: T.InstancedMesh; private windLouvers:T.Mesh[]=[];
  private routerNodes: T.Mesh[] = []; private mailLights: T.Mesh[] = []; private clockSigns: T.Mesh[] = [];
  private letter: T.Mesh; private flakes: T.Points; private drifts: T.Points; private aurora: T.Mesh; private sun: T.Mesh; private sky:T.Mesh;
  private scan: T.Mesh; private scanAt = -100; private postLamps: T.Mesh[] = [];
  constructor() {
    this.scene.background = new T.Color('#d9dfd7'); this.scene.fog = new T.FogExp2('#d9dfd7', .005);
    this.sky=this.mesh(new T.SphereGeometry(950,24,16),new T.ShaderMaterial({side:T.BackSide,depthWrite:false,uniforms:{severity:{value:.5}},vertexShader:'varying vec3 vP;void main(){vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'uniform float severity;varying vec3 vP;void main(){float h=normalize(vP).y;vec3 clear=mix(vec3(.90,.87,.75),vec3(.43,.60,.65),smoothstep(-.02,.8,h));float veil=sin(vP.x*.004+vP.z*.007)*.02;vec3 storm=mix(vec3(.72,.78,.77),vec3(.52,.63,.65),smoothstep(-.1,.9,h));gl_FragColor=vec4(mix(clear,storm,severity)+veil,1.);}' }),0,0,-100);
    this.scene.add(new T.HemisphereLight('#faf1da', '#727e7d', 3.2));
    const sunLight = new T.DirectionalLight('#ffe5b3', 3); sunLight.position.set(-130, 180, 70); this.scene.add(sunLight);
    const blueLight = new T.DirectionalLight('#b6d0d4', 1.2); blueLight.position.set(100, 40, -240); this.scene.add(blueLight);
    this.terrain();
    for (const surface of this.surfaces) {
      if (surface.id.includes('bridge') || surface.id.startsWith('snow-gate')) {
        const group = this.bridge(surface); this.scene.add(group);
        if (surface.id.startsWith('snow-final')) { this.finalBridges.push(group); group.visible = false; }
        if (surface.id.startsWith('snow-gate')) { const barrier = this.mesh(new T.BoxGeometry(surface.w > surface.d ? 1 : surface.w, 1.6, surface.w > surface.d ? surface.d : 1), this.rust, surface.x, 4.9, surface.z); this.gates.push({ group, barrier, surface }); }
      } else this.island(surface);
    }
    this.buildShelters(); this.crawler(-83, 4, 91);
    this.sign('白噪雪原', '04 / PACKET RAIN - THE WHITEOUT RELAY', -82, 10, 77, 14, 4.8);
    this.sign('风再大，信也要送到。', 'F / BRACE   -   FOLLOW THE ORANGE FLAGS', -100, 8, 69, 13, 3.7);
    this.guide.group.position.set(SNOW_GUIDE.x, SNOW_GUIDE.y, SNOW_GUIDE.z); this.guide.needle.visible = false; this.scene.add(this.guide.group, this.hero.group);
    this.dishes.push(this.dish(-111, 4, 51, 6), this.dish(-94, 4, -312, 19));
    for(let i=0;i<4;i++)this.windLouvers.push(this.mesh(new T.BoxGeometry(1.35,4.5,.16),this.rust,-110+i*1.5,7.1,48));
    const names: Record<SnowCase, string> = { 'WF-02': '驯风天线', 'NET-01': '雪中迷路的信', 'NET-02': '同一封求救信', 'NET-03': '拥塞风墙', 'NET-04': '四塔不同步', 'NET-S1': '过期的地址', 'NET-S2': '破损的雪花', 'NET-S3': '失联与归来' };
    for (const id of SNOW_CASES) {
      const p = SNOW_POS[id]; this.box(this.rust, p.x, p.y + .6, p.z, 2.4, 1.2, 1.5);
      this.box(this.ivory, p.x, p.y + 1.3, p.z, 2.6, .18, 1.8);
      const lamp = this.mesh(new T.SphereGeometry(.24, 8, 5), this.red, p.x + 1, p.y + 1.6, p.z + .5); this.lamps.set(id, lamp);
      this.sign(id, names[id], p.x, p.y + 4.6, p.z - 2.2, 7.6, 2.8, id.includes('-S') ? C.green : C.rust);
      this.signs.set(id, this.sign('NO SIGNAL', 'TRACE / SCAN THE DEVICE', p.x + 6, p.y + 2.8, p.z - 1, 5.5, 2.2));
    }
    const nodePositions = [[-12, 48], [-7, 39], [9, 45], [12, 34], [0, 32]];
    for (const [i, [x, z]] of nodePositions.entries()) { const mesh = this.mesh(new T.IcosahedronGeometry(.8, 1), this.red, x, 7.4, z); this.routerNodes.push(mesh); this.sign(['A', 'B', 'C', 'E', 'D'][i], 'RELAY', x, 9.3, z, 2.2, 1.3); }
    for (const [a, b] of [[0, 1], [0, 2], [1, 2], [1, 4], [2, 0], [2, 3], [3, 1], [3, 4]]) {
      const start = this.routerNodes[a].position, end = this.routerNodes[b].position;
      this.scene.add(new T.Line(new T.BufferGeometry().setFromPoints([start, end]), new T.LineBasicMaterial({ color: '#767d6b', transparent: true, opacity: .55 })));
    }
    for (let i = 0; i < 4; i++) {
      this.box(this.ivory, -8 + i * 5, 5.1, -49, 3.4, 2.2, 2.8);
      this.box(this.rust, -8 + i * 5, 6.4, -49, 3.8, .3, 3.2);
      this.mailLights.push(this.mesh(new T.SphereGeometry(.28, 8, 5), this.red, -8 + i * 5, 6.9, -47.7));
      this.sign(i < 2 ? `AM:${i + 1}` : `PM:${i - 1}`, 'LETTER / UNIQUE DELIVERY', -8 + i * 5, 8.3, -49, 3.8, 1.5);
    }
    for (let i = 0; i < 4; i++) {
      const x = 89 + i * 10; this.box(this.rust, x, 8, -153, .5, 8, .5);
      const ring = this.mesh(new T.TorusGeometry(2.2, .13, 5, 32), this.steel, x, 12, -153);
      ring.rotation.y = i * .1; this.clockSigns.push(this.sign(`T${i + 1}`, 'WAITING FOR THE SAME HISTORY', x, 9.4, -152.4, 5.5, 2));
    }
    this.sign('暴风协议', 'FIVE SYSTEMS / ONE LAST DELIVERY', 0, 10, -155, 17, 5);
    for (const [i, p] of SNOW_POSTS.entries()) {
      this.box(this.rust, p.x + 7, 10, p.z - 1, .4, 12, .4);
      this.postLamps.push(this.mesh(new T.SphereGeometry(.7, 10, 6), this.amber, p.x + 7, 16.2, p.z - 1));
      this.sign(i === 2 ? '极光观测站' : `避风站 0${i + 1}`, i === 2 ? 'THE LAST LETTER / YOU MADE IT' : 'WARM SHELTER / RELAY THE LETTER', p.x, 9, p.z - 4, 11, 3.7);
    }
    this.packets = new T.InstancedMesh(new T.BoxGeometry(.35, .24, .6), this.amber, 64); this.packets.frustumCulled = false; this.scene.add(this.packets);
    this.letter = this.mesh(new T.BoxGeometry(.7, .04, .48), this.amber, 0, 0, 0); this.letter.visible = false;
    this.flakes = this.makeSnow(false); this.drifts = this.makeSnow(true); this.scene.add(this.flakes, this.drifts);
    this.sun = this.mesh(new T.SphereGeometry(13, 20, 12), new T.MeshBasicMaterial({ color: '#ffdb9e', fog: false, transparent: true, opacity: .6 }), -220, 130, -490);
    this.aurora = this.makeAurora(); this.scene.add(this.aurora);
    this.scan = this.mesh(new T.RingGeometry(.98, 1, 64), new T.MeshBasicMaterial({ color: '#a54c30', side: T.DoubleSide, transparent: true, opacity: 0, depthWrite: false }), 0, 4.04, 0); this.scan.rotation.x = -Math.PI / 2;
    this.flush(this.batches, this.scene);
  }
  private mesh(geometry: T.BufferGeometry, material: T.Material, x: number, y: number, z: number, parent: T.Object3D = this.scene): T.Mesh {
    const mesh = new T.Mesh(geometry, material); mesh.position.set(x, y, z); parent.add(mesh); return mesh;
  }
  private box(material: T.Material, x: number, y: number, z: number, w: number, h: number, d: number, ry = 0, batches = this.batches): void {
    if (!batches.has(material)) batches.set(material, []); batches.get(material)!.push([x, y, z, w, h, d, ry]);
  }
  private flush(batches: Map<T.Material, Box[]>, parent: T.Object3D): void {
    for (const [material, boxes] of batches) { const mesh = new T.InstancedMesh(this.unit, material, boxes.length); boxes.forEach(([x, y, z, w, h, d, ry], i) => { this.dummy.position.set(x, y, z); this.dummy.scale.set(w, h, d); this.dummy.rotation.set(0, ry ?? 0, 0); this.dummy.updateMatrix(); mesh.setMatrixAt(i, this.dummy.matrix); }); mesh.computeBoundingSphere(); parent.add(mesh); } batches.clear();
  }
  private sign(title: string, sub: string, x: number, y: number, z: number, w: number, h: number, accent = C.rust): T.Mesh {
    const bottom=y-h/2;if(w>=5&&bottom>4.5){for(const side of [-1,1])this.box(this.steel,x+side*w*.41,4+(bottom-4)/2,z-.08,.09,bottom-4,.09);}
    return this.mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ map: placardTexture(title, sub, accent), side: T.DoubleSide }), x, y, z);
  }
  private write(sign: T.Mesh, title: string, sub: string, accent = C.rust): void {
    const material = sign.material as T.MeshBasicMaterial; material.map?.dispose(); material.map = placardTexture(title, sub, accent); material.needsUpdate = true;
  }
  private island(s: Surface): void {
    const height = 17, geometry = new T.BoxGeometry(s.w, height, s.d, 6, 3, 6), positions = geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) { if (positions.getY(i) < height / 2 - .01) { const n = Math.sin(positions.getX(i) * 1.73 + positions.getZ(i) * 3.17); positions.setX(i, positions.getX(i) + n * 1.5); positions.setZ(i, positions.getZ(i) + n * .7); } } geometry.computeVertexNormals();
    this.mesh(geometry, this.rock, s.x, s.y - height / 2 - .2, s.z);
    this.box(this.snow, s.x, s.y - .17, s.z, s.w, .34, s.d);
    const driftGeometry = new T.SphereGeometry(1, 10, 6);
    for (let i = 0; i < 8; i++) { const side = i % 2 ? 1 : -1, dune = this.mesh(driftGeometry, this.snow, s.x + side * (s.w / 2 - 2), s.y - .3, s.z - s.d / 2 + 3 + Math.floor(i / 2) * (s.d - 6) / 3); dune.scale.set(4, 1.8 + i % 3 * .3, 5); }
    if (s.id === 'snow-observatory' || s.id.startsWith('snow-post-')) { /* Final shelves are visible from afar; access is gated by their bridges. */ }
  }
  private bridge(s: Surface): T.Group {
    const group = new T.Group(), batches = new Map<T.Material, Box[]>(), alongX = s.w > s.d;
    this.box(this.steel, s.x, s.y - .27, s.z, s.w, .5, s.d, 0, batches);
    this.box(this.snow, s.x, s.y - .04, s.z, s.w - .4, .08, s.d - .4, 0, batches);
    const length = alongX ? s.w : s.d;
    for (let t = -length / 2 + 1; t < length / 2; t += 6) {
      const x = s.x + (alongX ? t : 0), z = s.z + (alongX ? 0 : t);
      this.box(this.rust, x, s.y + .02, z, alongX ? .6 : s.w, .05, alongX ? s.d : .6, 0, batches);
      const poleX = x + (alongX ? 0 : s.w / 2 - .5), poleZ = z + (alongX ? -s.d / 2 + .5 : 0);
      this.box(this.rust, poleX, s.y + 1.35, poleZ, .09, 2.7, .09, 0, batches);
      const flag = this.mesh(new T.PlaneGeometry(1, .55), new T.MeshBasicMaterial({ color: C.orange, side: T.DoubleSide }), poleX + .5, s.y + 2.4, poleZ, group); this.flags.push(flag);
    }
    this.flush(batches, group); return group;
  }
  private dome(x: number, z: number, r: number): void {
    this.mesh(new T.SphereGeometry(r, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), this.ivory, x, 4, z);
    this.box(this.rust, x, 4.5, z, r * 2, 1, r * 2);
    for (const side of [-1, 1]) { this.box(this.glass, x + side * r * .5, 6.4, z + r * .8, r * .55, 1.5, .14); this.box(this.amber, x + side * r * .5, 5.6, z + r * .82, r * .6, .08, .18); }
    this.box(this.rust, x, 5.9, z + r, 1.4, 3.8, .3);
    this.solids.push(new T.Box3(new T.Vector3(x - r * .8, 4, z - r * .8), new T.Vector3(x + r * .8, 4 + r, z + r * .8)));
    this.obstacles.push({ x, z, w: r * 1.6, d: r * 1.6, bottom: 4, top: 4 + r });
  }
  private buildShelters(): void {
    for (const [i, p] of SNOW_SHELTERS.entries()) {
      const isStart = i === 0, isFinal = i >= SNOW_SHELTERS.length - 3;
      if (isStart) this.dome(-117, 99, 4);
      else if (isFinal) this.dome(p.x - 8, p.z + 5, 4);
      else if (i <= 5) { const sites = [[-119, 47], [-18, 69], [-18, -58], [121, -54], [128, -157]]; this.dome(sites[i - 1][0], sites[i - 1][1], 4.3); }
      const ring = this.mesh(new T.RingGeometry(p.radius - .15, p.radius, 48), new T.MeshBasicMaterial({ color: '#b5a277', transparent: true, opacity: .32, side: T.DoubleSide, depthWrite: false }), p.x, 4.03, p.z); ring.rotation.x = -Math.PI / 2;
    }
    this.dome(-15, -151, 4.2);
  }
  private dish(x: number, y: number, z: number, radius: number): T.Group {
    this.box(this.rust, x, y + 4, z, radius * .12, 8, radius * .12);
    for(let i=0;i<3;i++){const angle=i*Math.PI*2/3,a=new T.Vector3(x+Math.cos(angle)*radius*.55,y,z+Math.sin(angle)*radius*.55),b=new T.Vector3(x,y+8,z),direction=b.clone().sub(a);const leg=this.mesh(new T.CylinderGeometry(.13,.2,direction.length(),7),this.steel,(a.x+b.x)/2,(a.y+b.y)/2,(a.z+b.z)/2);leg.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),direction.normalize());}
    const group = new T.Group(); group.position.set(x, y + 9, z); group.rotation.x = .6; group.rotation.y = -.4; this.scene.add(group);
    const points: number[] = [], indices: number[] = [], rings = 8, segments = 40;
    for (let ring = 0; ring <= rings; ring++) for (let i = 0; i <= segments; i++) { const r = radius * ring / rings, a = i / segments * Math.PI * 2; points.push(Math.cos(a) * r, r * r * .045, Math.sin(a) * r); }
    for (let ring = 0; ring < rings; ring++) for (let i = 0; i < segments; i++) { const a = ring * (segments + 1) + i, b = a + segments + 1; indices.push(a, b, a + 1, b, b + 1, a + 1); }
    const geometry = new T.BufferGeometry(); geometry.setAttribute('position', new T.Float32BufferAttribute(points, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
    this.mesh(geometry, new T.MeshStandardMaterial({ color: '#deddd0', roughness: .62, metalness: .4, side: T.DoubleSide }), 0, 0, 0, group);
    const rim = this.mesh(new T.TorusGeometry(radius, .14, 6, 64), this.rust, 0, radius * radius * .045, 0, group); rim.rotation.x = -Math.PI / 2;
    this.mesh(new T.CylinderGeometry(.12, .12, radius * .9, 8), this.steel, 0, radius * .45, 0, group);
    this.mesh(new T.SphereGeometry(.4, 8, 5), this.amber, 0, radius * .9, 0, group); return group;
  }
  private crawler(x: number, y: number, z: number): void {
    for (const side of [-1, 1]) this.mesh(new RoundedBoxGeometry(1.4, 1.6, 7.5, 2, .3), this.steel, x + side * 2.6, y + .8, z);
    this.mesh(new RoundedBoxGeometry(4.7, 3.8, 6.7, 2, .2), this.rust, x, y + 2.8, z);
    this.box(this.glass, x, y + 3.8, z + 3.4, 4.2, 1.3, .12); this.box(this.snow, x, y + 4.8, z, 5, .25, 7);
    for (const side of [-1, 1]) this.box(this.amber, x + side * 1.8, y + 1.9, z + 3.5, .7, .3, .15);
  }
  private terrain(): void {
    this.mesh(new T.PlaneGeometry(1800, 1800), new T.MeshStandardMaterial({ color: '#657a7a', roughness: .75 }), 0, -19, -100).rotation.x = -Math.PI / 2;
    const mountain = new T.ConeGeometry(1, 1, 5, 1), snowy = new T.MeshStandardMaterial({ color: '#cbd1c8', roughness: 1 });
    for (let i = 0; i < 44; i++) { const a = i * .618 * Math.PI * 2, radius = 330 + i % 5 * 31, height = 35 + i * 29 % 95;
      const mesh = this.mesh(mountain, i % 4 ? snowy : this.rock, Math.cos(a) * radius, height / 2 - 20, -125 + Math.sin(a) * radius); mesh.scale.set(34 + i % 6 * 8, height, 30 + i % 7 * 5); mesh.rotation.y = i * .73; }
    for (let i = 0; i < 25; i++) { const x = (i % 2 ? -1 : 1) * (190 + i % 3 * 12), z = 70 - i * 15; const rock = this.mesh(new T.IcosahedronGeometry(1, 0), this.snow, x, -4, z); rock.scale.set(18, 12 + i % 5 * 3, 25); }
  }
  private makeSnow(ground: boolean): T.Points {
    const count = ground ? 480 : 2100, positions = new Float32Array(count * 3); let seed = ground ? 827 : 193;
    const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return (seed >>> 0) / 4294967296; };
    for (let i = 0; i < count; i++) positions.set([(rand() - .5) * 110, rand() * (ground ? 2 : 55), (rand() - .5) * 110], i * 3);
    const geometry = new T.BufferGeometry(); geometry.setAttribute('position', new T.BufferAttribute(positions, 3));
    const material = new T.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { time: { value: 0 }, severity: { value: .55 }, wind: { value: new T.Vector2(1, .4) } },
      vertexShader: `uniform float time;uniform float severity;uniform vec2 wind;varying float fade;void main(){vec3 p=position;p.x=mod(p.x+55.+time*wind.x*${ground ? '5.' : '3.'},110.)-55.;p.z=mod(p.z+55.+time*wind.y*2.,110.)-55.;p.y=mod(p.y-time*${ground ? '.7' : '2.2'},${ground ? '2.' : '55.'});vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(${ground ? '200.' : '130.'}/max(1.,-mv.z),1.,${ground ? '13.' : '7.'});fade=severity*${ground ? '.3' : '.65'};}`,
      fragmentShader: 'varying float fade;void main(){float d=length(gl_PointCoord-.5);if(d>.5)discard;gl_FragColor=vec4(.97,.98,.94,(1.-smoothstep(.1,.5,d))*fade);}',
    }); const points = new T.Points(geometry, material); points.frustumCulled = false; return points;
  }
  private makeAurora(): T.Mesh {
    const geometry = new T.PlaneGeometry(500, 65, 100, 10), positions = geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) positions.setZ(i, Math.sin(positions.getX(i) * .025) * 35 + Math.sin(positions.getX(i) * .071) * 10);
    return new T.Mesh(geometry, new T.ShaderMaterial({ side: T.DoubleSide, transparent: true, depthWrite: false, uniforms: { time: { value: 0 }, strength: { value: 0 } },
      vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: 'uniform float time;uniform float strength;varying vec2 vUv;void main(){float ribbon=pow(max(0.,sin(vUv.x*110.+sin(vUv.x*20.+time*.12)*4.)),3.);float a=sin(vUv.y*3.14159)*(.15+ribbon*.25)*strength;vec3 c=mix(vec3(.92,.65,.45),vec3(.40,.85,.69),vUv.y);gl_FragColor=vec4(c,a);}',
    }));
  }
  setProgress(s: SnowProgress): void {
    this.solved = new Set(s.completed); this.complete = s.phase === 'complete'; this.weather = s.weather; this.carrying = s.audited;this.windPatch=s.patches['WF-02'];
    this.gates.forEach((g, i) => { const enabled = this.solved.has(SNOW_MAIN[i]); g.surface.enabled = enabled; g.group.visible = enabled; g.barrier.visible = !enabled; });
    for (const surface of this.surfaces) if (surface.id.startsWith('snow-final') || surface.id.startsWith('snow-post-') || surface.id === 'snow-observatory') surface.enabled = s.audited;
    this.finalBridges.forEach(group => group.visible = s.audited);
    for (const [id, lamp] of this.lamps) lamp.material = this.solved.has(id) ? this.green : this.red;
    this.postLamps.forEach((lamp, i) => lamp.material = s.delivery > i ? this.green : this.amber);
    if (!this.lastTrace) this.resetDisplays();
  }
  private resetDisplays(): void {
    for (const [id, sign] of this.signs) this.write(sign, this.solved.has(id) ? '200 OK' : 'NO SIGNAL', this.solved.has(id) ? 'PATCH COMMITTED / VERIFIED' : 'TRACE / WAITING FOR EVIDENCE', this.solved.has(id) ? C.green : C.rust);
    this.mailLights.forEach(light => light.material = this.solved.has('NET-02') ? this.green : this.red);
    this.routerNodes.forEach(node => node.material = this.solved.has('NET-01') ? this.green : this.red);
    this.clockSigns.forEach((sign, i) => this.write(sign, `T${i + 1}`, this.solved.has('NET-04') ? 'A1 B1 A2 C1 B2 A3' : 'WAITING FOR THE SAME HISTORY'));
  }
  present(id: SnowCase, run: SnowRun, trace: number, cursor: number): void {
    const key = `${run.runId}/${trace}/${cursor}`; if (key === this.lastTrace) return; this.lastTrace = key;
    const log = run.traces[trace]?.log ?? [], e = log[cursor]; if (!e) return;
    this.write(this.signs.get(id)!, `${e.actor}`, `${e.tick} / ${e.kind}`, C.green);
    if (id === 'NET-01') { const names = ['A', 'B', 'C', 'E', 'D']; this.routerNodes.forEach((node, i) => node.material = e.actor === names[i] || e.detail.includes(`→ ${names[i]}`) ? this.amber : this.dim); }
    if (id === 'NET-02') { const delivered = new Set(log.slice(0, cursor + 1).filter(row => row.kind === 'DELIVER').map(row => row.actor)); this.mailLights.forEach((light, i) => light.material = delivered.has(i < 2 ? `AM:${i + 1}` : `PM:${i - 1}`) ? this.green : this.red); }
    if (id === 'NET-04') this.clockSigns.forEach((sign, i) => this.write(sign, `T${i + 1}`, run.traces[i]?.log.slice(0, cursor + 1).map(row => row.detail.split('；')[0]).join(' ') || 'WAIT'));
    if (id === 'WF-02') {this.dishes[0].rotation.y = e.actor === 'MISALIGNED' ? 1.3 : -.4;this.windLouvers.forEach(blade=>blade.rotation.y=e.kind==='GUST_SHIELD'?0:1.05);}
  }
  clearTrace(): void { this.lastTrace = ''; this.resetDisplays(); }
  scanAtPosition(p: V3): void { this.scanAt = this.time; this.scan.position.set(p.x, p.y + .035, p.z); }
  setQuality(low: boolean): void { this.flakes.geometry.setDrawRange(0, low ? 700 : 2100); this.drifts.geometry.setDrawRange(0, low ? 120 : 480); this.packets.count = low ? 30 : 64; }
  update(dt: number, hero: V3, speed: number, _frozen: boolean, reduced: boolean): void {
    this.time += dt; const target = this.weather === 'calm' ? .03 : this.weather === 'snow' ? .5 : 1; this.severity = T.MathUtils.damp(this.severity, target, reduced ? 7 : 1.2, dt);
    const wind = snowWind(this.weather, this.environmentTime), stride = Math.sin(this.time * Math.max(4, speed * 1.8)) * Math.min(.45, speed * .07);
    this.hero.group.position.set(hero.x, hero.y, hero.z); this.hero.group.rotation.z = this.braced ? -.09 : wind.x * -.018;
    this.hero.leftLeg.rotation.x = stride; this.hero.rightLeg.rotation.x = -stride; this.hero.leftArm.rotation.x = -stride * .6;
    this.guide.head.rotation.y = reduced ? .2 : .2 + Math.sin(this.time * .35) * .12;
    const color = new T.Color('#e1e3d8').lerp(new T.Color('#b5c4c5'), this.severity);
    (this.scene.background as T.Color).copy(color); if (this.scene.fog instanceof T.FogExp2) { this.scene.fog.color.copy(color); this.scene.fog.density = .0021 + this.severity*this.severity * .008; }
    (this.sky.material as T.ShaderMaterial).uniforms.severity.value=this.severity;
    this.sun.visible = this.severity < .85; (this.sun.material as T.MeshBasicMaterial).opacity = (1 - this.severity) * .8;
    this.flags.forEach((flag, i) => { flag.rotation.y = -.4 + (reduced ? 0 : Math.sin(this.time * (3 + this.severity * 5) + i) * (.08 + this.severity * .35)); flag.rotation.z = this.severity * -.2; });
    for (const points of [this.flakes, this.drifts]) { points.position.set(hero.x, points === this.drifts ? 4.02 : hero.y - 4, hero.z); const material = points.material as T.ShaderMaterial; material.uniforms.time.value = reduced ? this.time * .2 : this.time; material.uniforms.severity.value = this.severity; (material.uniforms.wind.value as T.Vector2).set(wind.x, wind.z); }
    const paths = [[-75, 56, -25, 56], [0, 31, 0, -13], [28, -39, 77, -39], [105, -65, 105, -117], [72, -141, 25, -141]];
    for (let i = 0; i < this.packets.count; i++) { const path = paths[i % 5], active = this.solved.has(SNOW_MAIN[i % 5]), t = active ? (this.time * .14 + i * .317) % 1 : (i * .317) % .25; this.dummy.position.set(T.MathUtils.lerp(path[0], path[2], t), 7 + Math.sin(i) * .4, T.MathUtils.lerp(path[1], path[3], t)); this.dummy.rotation.set(0, 0, 0); this.dummy.scale.setScalar(active ? 1 : .5); this.dummy.updateMatrix(); this.packets.setMatrixAt(i, this.dummy.matrix); } this.packets.instanceMatrix.needsUpdate = true;
    this.letter.position.set(hero.x + .5, hero.y + 1.1, hero.z); this.letter.visible = this.carrying;
    const age = this.time - this.scanAt; this.scan.visible = age < 2; this.scan.scale.setScalar(1 + age * 12); (this.scan.material as T.MeshBasicMaterial).opacity = Math.max(0, .6 - age * .3);
    this.aurora.position.set(-105, 93, -580); const auroraMat = this.aurora.material as T.ShaderMaterial; auroraMat.uniforms.time.value = reduced ? 0 : this.time; auroraMat.uniforms.strength.value = this.complete ? 1 - this.severity * .5 : .08;
    if (!this.lastTrace){
      if(!reduced)this.dishes[0].rotation.y = -.4 + (this.windPatch.alignment==='vane'?Math.sin(this.time*.07)*.3:0);
      const pressure=[4,6,8,12,15,7,5,11][Math.floor(this.environmentTime/.8)%8]+(this.weather==='calm'?0:this.weather==='snow'?1:2);
      const open=this.windPatch.shutter==='open'||pressure<=this.windPatch.cutoff;this.windLouvers.forEach(blade=>blade.rotation.y=open?1.05:0);
    }
    this.flakes.visible = this.severity > .015; this.drifts.visible = this.weather !== 'calm';
  }
}
