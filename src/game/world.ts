import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { RailState, RunResult, Station } from './domain';
import { INITIAL_RAIL, traverse } from './domain';
import { makeSurfaces, type Obstacle, type Surface, type V3 } from './physics';

export const COLORS = { fog: '#10272e', ink: '#101d24', steel: '#263c43', white: '#dceaf5', mint: '#8ef7c7', amber: '#ffca7b', red: '#ff4f63', teal: '#70aaa9' };
export const STATION_POS: Record<Station, V3> = {
  A: { x: 0, y: 13, z: -49 }, B: { x: 37, y: 13, z: -56 },
  C: { x: 56, y: 13, z: -82 }, END: { x: 18, y: 13, z: -98 },
};
export const NODE_POS: Record<Station, V3> = Object.fromEntries(Object.entries(STATION_POS).map(([key, p]) => [key, { x: p.x, y: p.y + 5.3, z: p.z }])) as Record<Station, V3>;
export const MIRA_POS = { x: -4.8, y: 3, z: 16 };
export const REORDER_POS = { x: 2.6, y: 3, z: 5 };
const vec = (p: V3): T.Vector3 => new T.Vector3(p.x, p.y, p.z);
const rng = (seed: number): (() => number) => () => { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return (seed >>> 0) / 4294967296; };

function facade(seed: number): T.CanvasTexture {
  const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 512;
  const ctx = canvas.getContext('2d')!; const random = rng(seed);
  ctx.fillStyle = '#14282f'; ctx.fillRect(0, 0, 256, 512);
  for (let y = 4; y < 512; y += 16) {
    ctx.fillStyle = '#21363b'; ctx.fillRect(0, y + 12, 256, 2);
    for (let x = 8; x < 256; x += 20) {
      const f = random(); ctx.fillStyle = f > .91 ? '#d1ad76' : f > .65 ? '#689791' : f > .4 ? '#304f53' : '#192c33';
      ctx.fillRect(x, y, 9 + random() * 4, 9);
      ctx.fillStyle = '#0c1b22'; ctx.fillRect(x + 5, y, 1, 9);
    }
  }
  ctx.fillStyle = '#0a1a20'; for (let x = 0; x < 256; x += 64) ctx.fillRect(x, 0, 3, 512);
  const texture = new T.CanvasTexture(canvas); texture.colorSpace = T.SRGBColorSpace; texture.anisotropy = 4;
  return texture;
}

export function deckTexture(): T.CanvasTexture {
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
  const ctx=canvas.getContext('2d')!,random=rng(654);
  ctx.fillStyle='#667674';ctx.fillRect(0,0,256,256);
  for(let i=0;i<20000;i++){const value=70+Math.floor(random()*75);ctx.fillStyle=`rgba(${value},${value+7},${value+5},.18)`;ctx.fillRect(random()*256,random()*256,1+random()*2,1);}
  for(let p=0;p<256;p+=64){ctx.fillStyle='#465a59';ctx.fillRect(p,0,1,256);ctx.fillRect(0,p,256,1);ctx.fillStyle='#81918a';ctx.fillRect(p+2,0,1,256);}
  ctx.fillStyle='#465a59';for(const x of [5,59,69,123,133,187,197,251])for(const y of [5,59,69,123,133,187,197,251])ctx.fillRect(x,y,1,1);
  const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.repeat.set(4,6);texture.anisotropy=8;return texture;
}

export function signTexture(title: string, subtitle: string, color = COLORS.amber, width = 1024, height = 512): T.CanvasTexture {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#0c1b22'; ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = color; ctx.fillRect(24, 24, 8, height - 48);
  ctx.font = `700 ${Math.round(height * .38)}px 'Arial', 'Microsoft YaHei', sans-serif`;
  ctx.fillText(title, 60, height * .56, width - 100);
  ctx.globalAlpha = .75; ctx.font = `500 ${Math.round(height * .075)}px 'Consolas', monospace`;
  ctx.fillText(subtitle, 64, height * .79, width - 110);
  ctx.globalAlpha = .3; ctx.fillRect(60, height - 45, width - 110, 2);
  const texture = new T.CanvasTexture(canvas); texture.colorSpace = T.SRGBColorSpace; return texture;
}

type Box = [number, number, number, number, number, number, number?];
interface Batch { material: T.Material | T.Material[]; boxes: Box[] }
export interface Avatar { group: T.Group; head: T.Group; leftLeg: T.Group; rightLeg: T.Group; leftArm: T.Group; rightArm: T.Group; needle: T.Group; cape: T.Mesh }

export function makeAvatar(color = COLORS.amber): Avatar {
  const group = new T.Group();
  const dark = new T.MeshStandardMaterial({ color: '#172b32', roughness: .62, metalness: .5 });
  const shell = new T.MeshStandardMaterial({ color: '#688487', metalness: .7, roughness: .35 });
  const glow = new T.MeshBasicMaterial({ color });
  const red = new T.MeshBasicMaterial({ color: COLORS.red });
  const put = (geometry: T.BufferGeometry, material: T.Material, parent: T.Group, x: number, y: number, z: number): T.Mesh => {
    const mesh = new T.Mesh(geometry, material); mesh.position.set(x, y, z); parent.add(mesh); return mesh;
  };
  const chest = put(new T.CylinderGeometry(.27, .38, .75, 6), dark, group, 0, 1.05, 0); chest.rotation.y = Math.PI / 6;
  put(new T.BoxGeometry(.47, .13, .26), shell, group, 0, 1.28, 0);
  put(new T.SphereGeometry(.055, 8, 8), red, group, 0, 1.17, .255);
  const head = new T.Group(); head.position.y = 1.73; group.add(head);
  const ring = put(new T.TorusGeometry(.31, .065, 7, 28, Math.PI * 1.72), shell, head, 0, 0, 0); ring.rotation.z = .8;
  const inner = put(new T.TorusGeometry(.314, .018, 5, 28, Math.PI * 1.72), glow, head, 0, 0, .055); inner.rotation.z = .8;
  put(new T.BoxGeometry(.12, .025, .04), glow, head, .33, .16, 0);
  const leftLeg = new T.Group(); leftLeg.position.set(-.17, .7, 0); group.add(leftLeg);
  const rightLeg = new T.Group(); rightLeg.position.set(.17, .7, 0); group.add(rightLeg);
  for (const leg of [leftLeg, rightLeg]) {
    put(new T.BoxGeometry(.13, .56, .16), dark, leg, 0, -.26, 0);
    put(new T.BoxGeometry(.15, .1, .28), shell, leg, 0, -.64, .05);
    put(new T.BoxGeometry(.08, .05, .1), glow, leg, 0, -.38, .09);
  }
  const leftArm = new T.Group(); leftArm.position.set(-.34, 1.32, 0); group.add(leftArm);
  const rightArm = new T.Group(); rightArm.position.set(.34, 1.32, 0); group.add(rightArm);
  for (const arm of [leftArm, rightArm]) put(new T.BoxGeometry(.12, .56, .14), dark, arm, 0, -.24, 0);
  const needle = new T.Group(); needle.position.set(0, -.51, .12); needle.rotation.x = -.4; rightArm.add(needle);
  put(new T.CylinderGeometry(.015, .025, 1.3, 5), shell, needle, 0, .3, 0);
  put(new T.CylinderGeometry(0, .02, .32, 5), glow, needle, 0, 1.1, 0);
  for (let i = 0; i < 3; i++) { const coil = put(new T.TorusGeometry(.06 + i * .015, .012, 4, 12), glow, needle, 0, .1 + i * .15, 0); coil.rotation.x = Math.PI / 2; }
  const capeGeo = new T.BufferGeometry();
  capeGeo.setAttribute('position', new T.Float32BufferAttribute([-.29,1.35,-.16, .29,1.35,-.16, .37,.45,-.3, -.29,1.35,-.16, .37,.45,-.3, -.37,.45,-.3], 3));
  capeGeo.computeVertexNormals();
  const cape = new T.Mesh(capeGeo, new T.MeshStandardMaterial({ color: '#31545a', side: T.DoubleSide, roughness: 1 })); group.add(cape);
  // Exoskeleton details remain legible at gameplay distance, without a generic soldier silhouette.
  put(new T.BoxGeometry(.5,.07,.3),shell,group,0,.85,0);
  for(const side of [-1,1]){
    const shoulder=put(new RoundedBoxGeometry(.22,.17,.27,1,.04),shell,group,side*.35,1.34,0);shoulder.rotation.z=side*-.18;
    put(new T.BoxGeometry(.055,.24,.05),shell,group,side*.19,.26,.1);
    put(new T.SphereGeometry(.035,6,6),glow,head,side*.15,.27,.04);
  }
  const shadowCanvas = document.createElement('canvas'); shadowCanvas.width = shadowCanvas.height = 64;
  const ctx = shadowCanvas.getContext('2d')!; const gradient = ctx.createRadialGradient(32,32,2,32,32,31);
  gradient.addColorStop(0, 'rgba(0,0,0,.55)'); gradient.addColorStop(1,'rgba(0,0,0,0)'); ctx.fillStyle = gradient; ctx.fillRect(0,0,64,64);
  const shadow = new T.Mesh(new T.PlaneGeometry(1.5,1.5), new T.MeshBasicMaterial({ map: new T.CanvasTexture(shadowCanvas), transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI/2; shadow.position.y = .025; group.add(shadow);
  group.scale.setScalar(1.25);
  return { group, head, leftLeg, rightLeg, leftArm, rightArm, needle, cape };
}

export class CityWorld {
  scene = new T.Scene();
  surfaces: Surface[] = makeSurfaces();
  obstacles: Obstacle[] = [];
  solids: T.Box3[] = [];
  hero = makeAvatar();
  mira = makeAvatar('#a7c6c4');
  passenger = makeAvatar(COLORS.amber);
  daughter = makeAvatar(COLORS.red);
  train = new T.Group();
  nodes = new T.Group();
  tracks = new T.Group();
  draftTrack = new T.Group();
  brokenBridge = new T.Group();
  bridge = new T.Group();
  rain: T.LineSegments;
  sky: T.Mesh;
  water: T.Mesh;
  recovery = 0;
  targetRecovery = 0;
  bridgeFixed = false;
  railFixed = false;
  private batches = new Map<string, Batch>();
  private unit = new T.BoxGeometry(1,1,1);
  private time = 0;
  private mintMaterial = new T.MeshBasicMaterial({ color: '#35645f' });
  private stationBSign: T.Mesh;
  private signalSign: T.Mesh;
  private scanRing: T.Mesh;
  private scanTime = -100;
  private gate: T.Group;
  private beacons: T.Mesh[] = [];
  private cars: T.Mesh[] = [];
  private route: Station[] = traverse(INITIAL_RAIL).route;
  private replay: { result: RunResult; start: number; duration: number; riding: boolean } | null = null;
  rideDone = false;
  trainRoute: Station[] = [];
  trainStation: Station = 'A';
  private mats: Record<string, T.Material | T.Material[]>;

  constructor() {
    this.scene.background = new T.Color(COLORS.fog);
    this.scene.fog = new T.FogExp2(COLORS.fog, .0035);
    this.scene.add(new T.HemisphereLight('#b7d7d5', '#162930', 2.1));
    const key = new T.DirectionalLight('#c5d9d3', 2.2); key.position.set(-55,100,60); this.scene.add(key);
    const rim = new T.DirectionalLight('#699597', 2); rim.position.set(60,40,-90); this.scene.add(rim);
    const textureA = facade(12), textureB = facade(77);
    const steel = new T.MeshStandardMaterial({ color: COLORS.steel, metalness: .55, roughness: .65 });
    const roof = new T.MeshStandardMaterial({ color: '#1a2c34', roughness: .85 });
    const facadeA = new T.MeshStandardMaterial({ map: textureA, emissiveMap: textureA, emissive: '#acc4bd', emissiveIntensity: .45, roughness: .75, metalness: .25 });
    const facadeB = new T.MeshStandardMaterial({ map: textureB, emissiveMap: textureB, emissive: '#acc4bd', emissiveIntensity: .4, roughness: .85 });
    this.mats = {
      steel, dark: roof, deck: new T.MeshStandardMaterial({ color: '#586967', map:deckTexture(), metalness: .3, roughness: .62 }),
      facadeA: [facadeA,facadeA,roof,roof,facadeA,facadeA], facadeB: [facadeB,facadeB,roof,roof,facadeB,facadeB],
      amber: new T.MeshBasicMaterial({ color: COLORS.amber }), mint: this.mintMaterial,
      teal: new T.MeshBasicMaterial({ color: '#629c9a' }), red: new T.MeshBasicMaterial({ color: COLORS.red }),
      white: new T.MeshBasicMaterial({ color: '#9eaca9' }),wet:new T.MeshBasicMaterial({color:'#b6d2b4',transparent:true,opacity:.07,depthWrite:false}),
    };
    this.sky = new T.Mesh(new T.SphereGeometry(1100,24,16), new T.ShaderMaterial({ side:T.BackSide, depthWrite:false,
      vertexShader:'varying vec3 vPos; void main(){vPos=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:'varying vec3 vPos; void main(){float h=normalize(vPos).y; vec3 col=mix(vec3(.095,.20,.22),vec3(.018,.046,.068),smoothstep(-.06,.55,h));gl_FragColor=vec4(col,1.);}' }));
    this.scene.add(this.sky);
    this.water = new T.Mesh(new T.PlaneGeometry(1600,1600), new T.ShaderMaterial({ uniforms: { time: { value:0 } },
      vertexShader:'varying vec3 vP; void main(){vec4 p=modelMatrix*vec4(position,1.);vP=p.xyz;gl_Position=projectionMatrix*viewMatrix*p;}',
      fragmentShader:'uniform float time;varying vec3 vP;void main(){float wave=sin(vP.z*1.4+sin(vP.x*.27+time*.35))*sin(vP.x*.2+time*.4);float streak=pow(max(0.,sin(vP.x*.075+vP.z*.003)),24.)*.16;vec3 c=vec3(.035,.10,.12)+wave*.006+streak*vec3(.3,.43,.36);gl_FragColor=vec4(c,1.);}' }));
    this.water.rotation.x = -Math.PI/2; this.water.position.y = -5; this.scene.add(this.water);
    this.buildCity();
    this.buildWalkways();
    this.gate = this.makeGate();
    this.stationBSign = this.sign('B', 'STATION OFFLINE / 失联', {x:37,y:22,z:-63}, 11,6,COLORS.red);
    this.signalSign = this.sign('404', 'POINTER DOCK / 指针港', {x:-40,y:57,z:-55.8}, 17,12,COLORS.amber);
    this.sign('NEXT', 'CIVITAS TRANSIT AUTHORITY', {x:4,y:26,z:-52}, 11,5,'#96bab6');
    this.sign('04:04', 'THE CITY IS STILL RUNNING', {x:85,y:49,z:-76.8}, 16,6,'#9eb8af');
    this.sign('指针港', 'POINTER DOCK / SECTOR 01', {x:-16,y:7.5,z:13}, 8,3.2,COLORS.amber);
    this.sign('CHECKPOINT', '仅开放指针港 / 港区外施工', {x:0,y:6,z:49}, 10,2.5,'#6a9999', Math.PI);
    this.makeTrain();
    this.buildNodes();
    this.scene.add(this.tracks, this.draftTrack);
    this.setTracks(INITIAL_RAIL);
    this.mira.group.position.copy(vec(MIRA_POS)); this.mira.group.rotation.y = .7; this.scene.add(this.mira.group);
    this.mira.needle.visible = false;
    this.daughter.group.position.set(36,13,-56); this.daughter.group.scale.setScalar(.85); this.scene.add(this.daughter.group); this.daughter.needle.visible = false;
    this.passenger.group.position.set(0,3,-5); this.passenger.group.scale.setScalar(.85); this.passenger.needle.visible = false; this.scene.add(this.passenger.group);
    this.scene.add(this.hero.group);
    const scanMat = new T.MeshBasicMaterial({ color: COLORS.amber, side:T.DoubleSide, transparent:true, opacity:.45, depthWrite:false });
    this.scanRing = new T.Mesh(new T.RingGeometry(.98,1,80), scanMat); this.scanRing.rotation.x=-Math.PI/2; this.scanRing.visible=false; this.scene.add(this.scanRing);
    this.rain = this.makeRain(); this.scene.add(this.rain);
    this.flush();
  }

  private box(material: string, x: number,y: number,z: number,w: number,h: number,d: number, rotation = 0): void {
    if (!this.batches.has(material)) this.batches.set(material, { material:this.mats[material], boxes:[] });
    this.batches.get(material)!.boxes.push([x,y,z,w,h,d,rotation]);
  }
  private flush(): void {
    const object = new T.Object3D();
    for (const batch of this.batches.values()) {
      const mesh = new T.InstancedMesh(this.unit,batch.material,batch.boxes.length);
      batch.boxes.forEach(([x,y,z,w,h,d,r],index) => { object.position.set(x,y,z);object.scale.set(w,h,d);object.rotation.set(0,r??0,0);object.updateMatrix();mesh.setMatrixAt(index,object.matrix); });
      mesh.computeBoundingSphere(); this.scene.add(mesh);
    }
    this.batches.clear();
  }
  private buildCity(): void {
    const random = rng(4041024);
    const buildings: {x:number;z:number;w:number;d:number;h:number}[] = [
      {x:-40,z:-66,w:22,d:20,h:93}, {x:85,z:-88,w:18,d:22,h:77}, {x:40,z:-120,w:18,d:18,h:110},
      {x:-38,z:4,w:22,d:28,h:42}, {x:35,z:9,w:19,d:20,h:48}, {x:60,z:-21,w:16,d:18,h:62},
      {x:-57,z:-25,w:20,d:24,h:72}, {x:91,z:-53,w:24,d:20,h:102},
    ];
    for (let x=-210;x<=210;x+=30) for (let z=-240;z<=110;z+=34) {
      if ((x>-73&&x<100&&z>-124&&z<70) || random()<.16) continue;
      buildings.push({x:x+(random()-.5)*9,z:z+(random()-.5)*10,w:12+random()*12,d:12+random()*13,h:22+random()*100});
    }
    buildings.forEach((b,i)=>{
      this.box('dark',b.x,-3,b.z,b.w+3,5,b.d+3);
      this.box(i%2?'facadeA':'facadeB',b.x,b.h*.5-1,b.z,b.w,b.h,b.d);
      this.box('steel',b.x,b.h-1,b.z,b.w+1,1.3,b.d+1);
      this.box('dark',b.x,b.h+2,b.z,b.w*.65,5,b.d*.7);
      this.box('steel',b.x+b.w*.25,b.h+4,b.z,b.w*.12,5,b.d*.5);
      const tier=b.h*.6;
      this.box('steel',b.x,tier,b.z,b.w+1.3,1.1,b.d+1.3);
      this.box(i%7===0?'amber':'teal',b.x-b.w*.5-.03,tier+1,b.z,.09,.22,b.d);
      for (const s of [-1,1]) {
        this.box('steel',b.x+s*b.w*.5, b.h*.5,b.z+b.d*.5+.08,.3,b.h,.4);
        this.box('steel',b.x+s*b.w*.5, b.h*.5,b.z-b.d*.5-.08,.3,b.h,.4);
      }
      if(i%3===0) { this.box('steel',b.x,b.h+9,b.z,.18,13,.18); this.box('red',b.x,b.h+15.5,b.z,.3,.35,.3); }
      if(i<8) this.solids.push(new T.Box3(new T.Vector3(b.x-b.w/2,-5,b.z-b.d/2),new T.Vector3(b.x+b.w/2,b.h,b.z+b.d/2)));
    });
    // Distant transverse traffic layers and suspension columns establish real depth.
    for (let tier=0;tier<3;tier++) {
      const y=29+tier*22, z=-115-tier*46;
      this.box('dark',0,y,z,370,2,7);
      this.box('teal',0,y+1.1,z+3.1,370,.1,.15);
      this.box('amber',0,y+1.1,z-3.1,370,.1,.15);
      for(let x=-160;x<=160;x+=40) this.box('steel',x,y*.5-2,z,2.2,y+4,3);
      for(let i=0;i<5;i++) {
        const car=new T.Mesh(new T.BoxGeometry(4,.5,.8),this.mats[i%2?'amber':'teal']);car.position.set(i*60-150,y+1.6,z);car.userData={baseZ:z,speed:8+tier*4,offset:i*71};this.cars.push(car);this.scene.add(car);
      }
    }
    // Harbor pylons and floating-memory container berths.
    for(let i=0;i<18;i++) {
      const x= i%2 ? -65 : 95, z=75-i*10;
      this.box('dark',x,-1,z,20,4,7);
      this.box('steel',x,-.5,z,17,6,5);
      this.box('amber',x+9,2.6,z,.2,.3,5);
    }
    // Cranes: distinctive tall bent silhouettes, authored rather than random cubes.
    for(const [x,z] of [[-85,-65],[99,-119],[-70,56]]) {
      this.box('steel',x,25,z,2.2,60,2.2);this.box('steel',x+13,55,z,30,1.5,2);
      this.box('steel',x+25,44,z,.12,22,.12);this.box('amber',x+25,33,z,.5,.5,.5);
    }
  }

  private buildWalkways(): void {
    for(const s of this.surfaces) {
      if(s.id==='reorder-bridge') continue;
      const rise=s.rise??0;
      const deck=new T.Mesh(new T.BoxGeometry(s.w,.7,Math.hypot(s.d,rise)),this.mats.deck);
      deck.position.set(s.x,s.y+rise/2-.35,s.z);deck.rotation.x=Math.atan2(rise,s.d);this.scene.add(deck);
      const elevated=s.y>=11;
      if(!rise) {
        this.box('dark',s.x,s.y-1.1,s.z,s.w+.6,.8,s.d+.6);
        for(const side of [-1,1]) {
          this.box(elevated?'amber':'teal',s.x+side*(s.w/2-.2),s.y+.025,s.z,.09,.045,s.d-.6);
          if(s.d>8) {
            for(let z=s.z-s.d/2+1;z<s.z+s.d/2;z+=4) { this.box('steel',s.x+side*(s.w/2-.3),s.y+.55,z,.11,1.1,.11); }
            this.box('steel',s.x+side*(s.w/2-.3),s.y+1.05,s.z,.13,.13,s.d-1);
          }
        }
        this.box('steel',s.x,s.y/2-2,s.z,1.5,s.y+4,2.5);
      } else {
        for(let z=s.z-s.d/2+1;z<s.z+s.d/2;z+=2) {
          const h=s.y+rise*((s.z+s.d/2-z)/s.d);
          this.box('steel',s.x,h+.02,z,s.w-.4,.04,.06);
          for(const side of [-1,1]) this.box('amber',s.x+side*(s.w/2-.2),h+.12,z,.12,.1,1.4);
        }
      }
    }
    this.scene.add(this.bridge,this.brokenBridge);
    for(let i=0;i<7;i++) {
      const p=new T.Mesh(new T.BoxGeometry(9.8,.55,1.98),this.mats.deck);p.position.set(0,2.725,-.98-i*2);this.bridge.add(p);
      for(const x of [-4.8,4.8]) { const edge=new T.Mesh(new T.BoxGeometry(.1,.1,1.9),this.mats.amber);edge.position.set(x,3.04,-.98-i*2);this.bridge.add(edge); }
      const broken=new T.Mesh(new T.BoxGeometry(8,.35,1.5),this.mats.dark);broken.position.set((i%2-.5)*2,2.8-i*.35,-1-i*2);broken.rotation.z=(i%2-.5)*.17;this.brokenBridge.add(broken);
    }
    this.bridge.visible=false;
    // Street furniture is deliberately kept outside the player corridor.
    for(let i=0;i<6;i++) for(const side of [-1,1]) {
      const x=side*10.4,z=43-i*7;
      this.box('steel',x,5.5,z,.15,5,.18);this.box('steel',x-side*.7,8,z,1.6,.14,.2);
      this.box('amber',x-side*.7,7.9,z,1.3,.06,.3);
      this.box('wet',x-side*1.3,3.008,z,1.7,.008,4.8);
      this.box('dark',x+side*.3,3.25,z,1.1,.5,1.1);
      this.box('white',0,3.04,z,1,.035,.05);
      for(let j=0;j<2;j++) this.box('teal',side*(6+j*.4),3.015,z,.1,.015,2.8);
    }
    // MIRA's covered kiosk with utilitarian signage and warm light.
    this.box('dark',-8,4.4,16,4,2.8,3); this.box('steel',-7,6.5,16,7,.3,5);
    this.box('amber',-7,6.3,18.3,6,.06,.08);
    this.obstacles.push({x:-8,z:16,w:4,d:3,bottom:3,top:5.8});
    this.solids.push(new T.Box3(new T.Vector3(-10,3,14.5),new T.Vector3(-6,5.8,17.5)));
    this.solids.push(new T.Box3(new T.Vector3(-10.5,6.3,13.5),new T.Vector3(-3.5,6.7,18.5)));
    const terminal=new T.Mesh(new T.BoxGeometry(.8,1.5,.65),this.mats.steel);terminal.position.set(REORDER_POS.x,3.75,REORDER_POS.z);this.scene.add(terminal);
    const display=new T.Mesh(new T.BoxGeometry(.72,.5,.05),this.mats.red);display.position.set(REORDER_POS.x,4.3,REORDER_POS.z+.35);this.scene.add(display);
    const caution=this.sign('04', 'MIND THE GAP / 事件失序', {x:0,y:3.025,z:2.5}, 3,1.2,COLORS.amber);caution.rotation.x=-Math.PI/2;
    const lookout=this.sign('23m', 'UPPER DECK / 核心观景台 ←', {x:-7,y:3.03,z:42}, 3.5,1.5,'#8fae9b');lookout.rotation.x=-Math.PI/2;
    for(const p of Object.values(STATION_POS)) {
      this.box('steel',p.x-5,p.y+2,p.z-4,.3,4,.3);this.box('steel',p.x+5,p.y+2,p.z-4,.3,4,.3);
      this.box('dark',p.x,p.y+4,p.z-4,12,.5,7);this.box('amber',p.x,p.y+3.75,p.z-.5,11,.08,.12);
      this.solids.push(new T.Box3(new T.Vector3(p.x-6,p.y+3.75,p.z-7.5),new T.Vector3(p.x+6,p.y+4.25,p.z-.5)));
    }
  }

  sign(title: string, subtitle: string, pos: V3, width: number, height: number, color = COLORS.amber, rotation = 0): T.Mesh {
    const material=new T.MeshBasicMaterial({map:signTexture(title,subtitle,color),side:T.DoubleSide});
    const mesh=new T.Mesh(new T.PlaneGeometry(width,height),material);mesh.position.copy(vec(pos));mesh.rotation.y=rotation;this.scene.add(mesh);return mesh;
  }
  private makeGate(): T.Group {
    const group=new T.Group();group.position.set(27,48,-94);group.rotation.y=.12;
    const shell=new T.Mesh(new T.TorusGeometry(18,1.1,8,72,Math.PI*1.84),this.mats.steel);shell.rotation.z=.3;group.add(shell);
    const light=new T.Mesh(new T.TorusGeometry(17.1,.09,5,72,Math.PI*1.84),this.mats.amber);light.rotation.z=.3;group.add(light);
    for(let i=0;i<16;i++) {
      const a=i/16*Math.PI*2;const rib=new T.Mesh(new T.BoxGeometry(.45,3,1.5),this.mats.dark);rib.position.set(Math.cos(a)*18,Math.sin(a)*18,0);rib.rotation.z=a-Math.PI/2;group.add(rib);
    }
    this.scene.add(group);return group;
  }
  private makeTrain(): void {
    const shell = new T.MeshStandardMaterial({color:'#7c9290',metalness:.65,roughness:.37});
    const dark = new T.MeshStandardMaterial({color:'#122b33',metalness:.5,roughness:.22});
    for(let i=0;i<2;i++) {
      const body=new T.Mesh(new RoundedBoxGeometry(3.1,2.2,5.5,2,.22),shell);body.position.set(0,1.5,i*6);this.train.add(body);
      const underbody=new T.Mesh(new RoundedBoxGeometry(2.6,.45,5.1,1,.1),dark);underbody.position.set(0,.27,i*6);this.train.add(underbody);
      const roof=new T.Mesh(new RoundedBoxGeometry(2.3,.15,3.7,1,.05),dark);roof.position.set(0,2.65,i*6+.2);this.train.add(roof);
      for(const side of [-1,1]) {
        const stripe=new T.Mesh(new T.BoxGeometry(.03,.13,5.4),this.mats.amber);stripe.position.set(side*1.57,.85,i*6);this.train.add(stripe);
        const windows=new T.Mesh(new T.BoxGeometry(.04,.85,4.8),dark);windows.position.set(side*1.57,1.85,i*6);this.train.add(windows);
        for(let j=0;j<4;j++) { const light=new T.Mesh(new T.BoxGeometry(.05,.45,.7),this.mats.teal);light.position.set(side*1.6,1.85,i*6-1.8+j*1.2);this.train.add(light); }
        const door=new T.Mesh(new T.BoxGeometry(.04,1.55,.83),dark);door.position.set(side*1.56,1.25,i*6+1.75);this.train.add(door);
        const frame=new T.Mesh(new T.BoxGeometry(.05,1.5,.035),this.mats.amber);frame.position.set(side*1.6,1.25,i*6+1.75);this.train.add(frame);
      }
    }
    const front=new T.Mesh(new T.BoxGeometry(2.65,.8,.05),dark);front.position.set(0,1.85,-2.78);this.train.add(front);
    for(const side of [-1,1]) {const lamp=new T.Mesh(new T.BoxGeometry(.35,.15,.08),this.mats.amber);lamp.position.set(side*1,.65,-2.8);this.train.add(lamp);}
    this.train.position.set(0,13.6,-49);this.scene.add(this.train);
  }
  private buildNodes(): void {
    for(const [id,p] of Object.entries(NODE_POS)) {
      const node=new T.Mesh(new T.OctahedronGeometry(.7,0),new T.MeshBasicMaterial({color:id==='B'?COLORS.red:COLORS.amber,wireframe:true}));
      node.position.copy(vec(p));node.userData.station=id;this.nodes.add(node);
      const beacon=new T.Mesh(new T.CylinderGeometry(.035,.035,5,5),this.mats[id==='B'?'red':'teal']);beacon.position.set(p.x,p.y-2.5,p.z);this.scene.add(beacon);this.beacons.push(beacon);
    }
    this.nodes.visible=false;this.scene.add(this.nodes);
  }
  private makeRain(): T.LineSegments {
    const random=rng(144);const positions=new Float32Array(1400*6);
    for(let i=0;i<1400;i++) {const x=(random()-.5)*90,y=random()*60,z=(random()-.5)*90;positions.set([x,y,z,x-.13,y-.8,z],i*6);}
    const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(positions,3));
    return new T.LineSegments(geometry,new T.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{time:{value:0}},
      vertexShader:'uniform float time;varying float fade;void main(){vec3 p=position;p.y=mod(p.y-time*12.,60.);fade=1.-p.y/70.;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}',
      fragmentShader:'varying float fade;void main(){gl_FragColor=vec4(.52,.69,.70,fade*.16);}' }));
  }
  curve(from: V3,to: V3, lift = 1): T.CatmullRomCurve3 {
    const a=vec(from),b=vec(to);return new T.CatmullRomCurve3([a,a.clone().lerp(b,.3).add(new T.Vector3(0,lift,0)),a.clone().lerp(b,.7).add(new T.Vector3(0,lift,0)),b]);
  }
  private clear(group: T.Group): void {
    while(group.children.length) {const child=group.children[0] as T.Mesh;group.remove(child);child.geometry?.dispose();if(child.material instanceof T.Material) child.material.dispose();}
  }
  setTracks(state: RailState): void {
    this.clear(this.tracks);this.route=traverse(state).route;
    for(const [from,to] of Object.entries(state.next)) {
      if(!to || !STATION_POS[from as Station]) continue;
      const a={...STATION_POS[from as Station],y:13.15},b={...STATION_POS[to],y:13.15};
      const curve=this.curve(a,b,.1);
      const color=from==='A'&&!this.railFixed?COLORS.red: this.railFixed?COLORS.mint: '#6b9a95';
      const tube=new T.Mesh(new T.TubeGeometry(curve,20,.075,5,false),new T.MeshBasicMaterial({color}));this.tracks.add(tube);
      // A solid deck accompanies every live link, with a shared geometric authority.
      const mid=vec(a).add(vec(b)).multiplyScalar(.5),length=vec(a).distanceTo(vec(b));
      const deck=new T.Mesh(new T.BoxGeometry(3.7,.45,length),new T.MeshStandardMaterial({color:'#253c42',metalness:.45,roughness:.7}));
      deck.position.copy(mid);deck.position.y-=.4;deck.rotation.y=Math.atan2(b.x-a.x,b.z-a.z);this.tracks.add(deck);
      for(const offset of [-1.05,1.05]) {
        const rail=new T.Mesh(new T.BoxGeometry(.055,.055,length),new T.MeshBasicMaterial({color}));
        rail.position.copy(mid);rail.position.x+=Math.cos(deck.rotation.y)*offset;rail.position.z-=Math.sin(deck.rotation.y)*offset;rail.rotation.y=deck.rotation.y;this.tracks.add(rail);
      }
    }
  }
  showDraft(state: RailState | null): void {
    this.clear(this.draftTrack);if(!state) return;
    for(const [from,to] of Object.entries(state.next)) {
      if(!to) continue;
      const a=NODE_POS[from as Station],b=NODE_POS[to];
      const curve=from===to?new T.CatmullRomCurve3([vec(a),vec(a).add(new T.Vector3(5,4,0)),vec(a).add(new T.Vector3(0,5,4)),vec(a)]):this.curve(a,b,6);
      // Bake dashes into geometry, sharing the existing basic-line shader on first edit.
      const length=curve.getLength(),points:T.Vector3[]=[];
      for(let d=0;d<length;d+=1.3)points.push(curve.getPointAt(d/length),curve.getPointAt(Math.min(d+.8,length)/length));
      const geometry=new T.BufferGeometry().setFromPoints(points);
      this.draftTrack.add(new T.LineSegments(geometry,new T.LineBasicMaterial({color:COLORS.amber,transparent:true,opacity:.85})));
    }
  }
  setBridge(fixed: boolean): void {
    this.bridgeFixed=fixed;this.surfaces.find(s=>s.id==='reorder-bridge')!.enabled=fixed;this.bridge.visible=fixed;this.brokenBridge.visible=!fixed;
    if(fixed) this.passenger.group.position.set(5,3,8);
  }
  setRail(state: RailState, fixed: boolean): void {
    this.railFixed=fixed;this.targetRecovery=fixed?1:0;this.setTracks(state);
    const material=this.stationBSign.material as T.MeshBasicMaterial;material.map?.dispose();material.map=signTexture('B',fixed?'STATION ONLINE / 已恢复':'STATION OFFLINE / 失联',fixed?COLORS.mint:COLORS.red);material.needsUpdate=true;
    const signal=this.signalSign.material as T.MeshBasicMaterial;signal.map?.dispose();signal.map=signTexture(fixed?'200':'404',fixed?'ALL STATIONS REACHABLE':'POINTER DOCK / 指针港',fixed?COLORS.mint:COLORS.amber);signal.needsUpdate=true;
    (this.beacons[1].material as T.Material)=this.mats[fixed?'mint':'red'] as T.Material;
    const nodeB=this.nodes.children[1] as T.Mesh;
    (nodeB.material as T.Material).dispose();nodeB.material=new T.MeshBasicMaterial({color:fixed?COLORS.mint:COLORS.red,wireframe:true});
    if(!fixed){this.daughter.group.visible=true;this.daughter.group.position.set(36,13,-56);}
    // Collision support uses the identical committed link set as the rendered rails.
    this.surfaces=this.surfaces.filter(s=>!s.id.startsWith('rail-support-'));
    for(const [from,to] of Object.entries(state.next)) {
      if(!to) continue;const a=STATION_POS[from as Station],b=STATION_POS[to];const length=Math.hypot(b.x-a.x,b.z-a.z);const count=Math.ceil(length/.75);
      for(let i=0;i<=count;i++)this.surfaces.push({id:`rail-support-${from}-${i}`,x:a.x+(b.x-a.x)*i/count,z:a.z+(b.z-a.z)*i/count,w:3.5,d:1.9,y:13});
    }
  }
  scan(position: V3): void {this.scanTime=this.time;this.scanRing.position.set(position.x,position.y+.05,position.z);}
  startReplay(result: RunResult, riding = false): void {
    this.replay={result,start:this.time,duration:riding?17:10,riding};this.trainRoute=[];this.rideDone=false;
  }
  get replaying(): boolean {return this.replay!==null;}
  get riding(): boolean {return this.replay?.riding??false;}
  update(dt: number, hero: V3, moving: number, frozen: boolean, reducedMotion: boolean): void {
    this.time+=dt;
    (this.water.material as T.ShaderMaterial).uniforms.time.value=this.time;
    (this.rain.material as T.ShaderMaterial).uniforms.time.value=this.time;
    this.rain.position.set(hero.x,hero.y,hero.z);
    this.recovery=T.MathUtils.damp(this.recovery,this.targetRecovery,.6,dt);
    this.mintMaterial.color.setRGB(.15+this.recovery*.35,.3+this.recovery*.55,.29+this.recovery*.35);
    for(const key of ['facadeA','facadeB']){const material=(this.mats[key] as T.Material[])[0] as T.MeshStandardMaterial;material.emissiveIntensity=.38+this.recovery*.4;}
    this.gate.rotation.z=reducedMotion?0:Math.sin(this.time*.025)*.03;
    this.nodes.children.forEach((node,i)=>{node.rotation.y=this.time*.35+i;node.rotation.z=this.time*.14;});
    for(const car of this.cars) car.position.x=((this.time*car.userData.speed+car.userData.offset)%360)-180;
    const scanAge=this.time-this.scanTime;
    this.scanRing.visible=scanAge<1.8;
    if(this.scanRing.visible){const scale=1+scanAge*25;this.scanRing.scale.setScalar(scale);(this.scanRing.material as T.MeshBasicMaterial).opacity=(1-scanAge/1.8)*.55;}
    this.hero.group.position.copy(vec(hero));
    const walk=Math.sin(this.time*(moving>7?14:10))*Math.min(moving/5.4,1)*.65;
    this.hero.leftLeg.rotation.x=walk;this.hero.rightLeg.rotation.x=-walk;
    this.hero.leftArm.rotation.x=-walk*.65;this.hero.rightArm.rotation.x=walk*.55-.2;
    this.hero.head.rotation.z=Math.sin(this.time*1.4)*.025;
    this.hero.cape.rotation.x=Math.max(0,moving*.015)+Math.sin(this.time*5)*.018;
    this.mira.head.rotation.y=Math.sin(this.time*.4)*.15;
    if(!this.bridgeFixed&&!frozen){const phase=(this.time%7)/7;this.passenger.group.position.y=phase<.65?3:3-Math.min((phase-.65)*35,12);this.passenger.group.visible=phase<.94;}
    else this.passenger.group.visible=true;
    if(frozen) return;
    if(this.replay) {
      const replay=this.replay,age=this.time-replay.start;
      const route=replay.result.route;
      if(route.length>0) {
        const progress=Math.min(.999999,age/replay.duration)*(route.length-1);
        const segment=Math.min(route.length-2,Math.floor(progress));const local=progress-segment;
        const t=T.MathUtils.smoothstep(local,.15,.85);
        this.moveTrain(route[segment],route[segment+1],t);
        const visitedIndex=local>.85?segment+1:segment;this.trainStation=route[visitedIndex];
        this.trainRoute=route.slice(0,visitedIndex+1);
        if(replay.result.passed&&this.trainRoute.includes('B')){this.daughter.group.visible=false;}
      }
      if(age>=replay.duration){this.trainRoute=[...route];this.replay=null;if(replay.riding)this.rideDone=true;}
    } else if(!this.railFixed) {
      const phase=(this.time%16)/16*(this.route.length-1);const segment=Math.min(this.route.length-2,Math.floor(phase));
      this.moveTrain(this.route[segment],this.route[segment+1],T.MathUtils.smoothstep(phase-segment,.15,.85));
    }
  }
  private moveTrain(from: Station,to: Station,t: number): void {
    const a=STATION_POS[from],b=STATION_POS[to];this.train.position.set(T.MathUtils.lerp(a.x,b.x,t),13.55,T.MathUtils.lerp(a.z,b.z,t));this.train.rotation.y=Math.atan2(a.x-b.x,a.z-b.z);
  }
  getTrainRider(): V3 {return {x:this.train.position.x,y:this.train.position.y+2.7,z:this.train.position.z};}
  finishReplay(): void {
    if(!this.replay)return;
    const {result,riding}=this.replay;this.trainRoute=[...result.route];
    if(result.route.length>1){const last=result.route.at(-1)!;this.moveTrain(result.route.at(-2)!,last,1);this.trainStation=last;}
    if(result.passed&&result.route.includes('B'))this.daughter.group.visible=false;
    this.replay=null;this.rideDone=riding;
  }
  resetTrain(): void {this.replay=null;this.rideDone=false;this.train.position.set(0,13.55,-49);this.train.rotation.y=0;}
  setQuality(low: boolean): void {this.rain.geometry.setDrawRange(0,low?700:2800);}
}
