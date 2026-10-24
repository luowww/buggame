import * as T from 'three';
import { makeAvatar, signTexture, deckTexture, COLORS } from './world';
import type { Obstacle, Surface, V3 } from './physics';
import { add8, CARRY_EXAMPLES, FORGE_PHASES, type Flag, type ForgeProgress } from './forge-domain';
import { WeatherRig } from './weather';

export const FORGE_START = { x:0, y:4, z:34 };
export const K13 = { x:-4, y:4, z:20 };
export const RELAY = { x:0, y:4, z:9 };
export const ALU = { x:0, y:26, z:-82 };
export const LIFT = { x:0, y:26, z:-89 };
export const SUMMIT = { x:0, y:50, z:-89 };
function copperTexture():T.CanvasTexture {
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=512;
  const ctx=canvas.getContext('2d')!;let seed=29;
  const rand=():number=>{seed=(Math.imul(seed,1664525)+1013904223)|0;return(seed>>>0)/4294967296;};
  ctx.fillStyle='#b6a695';ctx.fillRect(0,0,256,512);
  for(let i=0;i<7000;i++){ctx.fillStyle=rand()>.45?'#ffffff0c':'#172c3022';ctx.fillRect(rand()*256,rand()*512,rand()*24+1,1);}
  for(let x=0;x<256;x+=64){ctx.fillStyle='#24363670';ctx.fillRect(x,0,2,512);ctx.fillStyle='#e3d2b677';ctx.fillRect(x+2,0,1,512);}
  for(let y=0;y<512;y+=128){ctx.fillStyle='#28333566';ctx.fillRect(0,y,256,2);for(const x of [6,58,70,122,134,186,198,250]){ctx.fillStyle='#344241';ctx.beginPath();ctx.arc(x,y+7,1.7,0,Math.PI*2);ctx.fill();}}
  const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;map.wrapS=map.wrapT=T.RepeatWrapping;map.repeat.set(2,4);map.anisotropy=4;return map;
}
export const forgeSurfaces = (): Surface[] => [
  {id:'forge-arrival',x:0,z:20,w:24,d:48,y:4},
  {id:'forge-bridge',x:0,z:-10,w:10,d:12,y:4,enabled:false},
  {id:'forge-ramp-1',x:0,z:-29,w:10,d:26,y:4,rise:10},
  {id:'forge-solar',x:0,z:-48,w:28,d:12,y:14},
  {id:'forge-ramp-2',x:0,z:-65,w:10,d:22,y:14,rise:12},
  {id:'forge-core',x:0,z:-86,w:30,d:20,y:26},
  {id:'forge-summit',x:0,z:-89,w:28,d:18,y:50,enabled:false},
  {id:'forge-outlook-ramp',x:-17,z:-64,w:6,d:20,y:14,rise:12},
  {id:'forge-outlook',x:-17,z:-80,w:9,d:12,y:26},
];
type Box = [number,number,number,number,number,number,number?];
export class PulseWorld {
  scene = new T.Scene();
  hero = makeAvatar();
  mechanic = makeAvatar('#84d8ee');
  surfaces = forgeSurfaces();
  obstacles: Obstacle[] = [];
  solids: T.Box3[] = [];
  weather: WeatherRig;
  liftY = 26;
  flag: Flag = 'ZERO';
  private time = 0;
  private bridge = new T.Group();
  private summit = new T.Group();
  private lift = new T.Group();
  private rings: T.Mesh[] = [];
  private bits: T.Mesh[] = [];
  private steam: T.InstancedMesh;
  private capacitor: T.Mesh;
  private thermal: T.Mesh;
  private shutter: T.Mesh;
  private signal: T.Mesh;
  private carryLine: T.Line;
  private solar: T.Mesh[] = [];
  private copper = new T.MeshStandardMaterial({color:'#a87b50',map:copperTexture(),metalness:.68,roughness:.42});
  private basalt = new T.MeshStandardMaterial({color:'#26343a',metalness:.6,roughness:.62});
  private deck = new T.MeshStandardMaterial({color:'#a5b0a3',map:deckTexture(),metalness:.35,roughness:.56});
  private glow = new T.MeshBasicMaterial({color:'#ffbb6c'});
  private cyan = new T.MeshBasicMaterial({color:'#88d9db'});
  private red = new T.MeshBasicMaterial({color:'#f36d63'});
  private dim = new T.MeshBasicMaterial({color:'#445353'});
  private batches = new Map<T.Material, Box[]>();
  private dummy = new T.Object3D();
  private unit = new T.BoxGeometry(1,1,1);
  private repaired = false;
  private power = false;
  private replay = false;
  private relayRing: T.Mesh;
  private scanAt = -100;
  constructor() {
    this.scene.background=new T.Color('#253437');this.scene.fog=new T.FogExp2('#253437',.004);
    this.scene.add(new T.HemisphereLight('#d5e1db','#29343a',2.3));
    const sun=new T.DirectionalLight('#ffe1af',2.5);sun.position.set(-80,140,40);this.scene.add(sun);
    const rim=new T.DirectionalLight('#86b9c6',2.2);rim.position.set(70,60,-140);this.scene.add(rim);
    const ground=new T.Mesh(new T.PlaneGeometry(1500,1500),new T.MeshStandardMaterial({color:'#202e32',roughness:.24,metalness:.7}));ground.rotation.x=-Math.PI/2;ground.position.y=-7;this.scene.add(ground);
    this.buildArchitecture();
    for(const s of this.surfaces){
      if(s.id==='forge-bridge'||s.id==='forge-summit')continue;
      this.platform(s,this.scene);
    }
    this.platform(this.surfaces[1],this.bridge);this.scene.add(this.bridge);
    this.platform(this.surfaces[6],this.summit);this.scene.add(this.summit);this.summit.visible=false;
    this.sign('脉冲炉','PULSE FORGE / SECTOR 02',-14,11,20,12,4.5);
    this.sign('晴 · 蓄能','RAIN · COOL / 隔离后降温',0,10,-2,10,3.6);
    this.sign('进位不应被遗忘','CARRY ≠ ZERO / CO-01',0,33,-92,14,4.5);
    this.sign('02','A CITY THAT REMEMBERS',-46,39,-35,17,14);
    this.sign('ALU 8','UNSIGNED / 0000 0000',35,25,-63,15,7);
    this.sign('K-13','THERMAL ENGINEER',-6,8.7,19,4,1.5);
    this.mechanic.group.position.set(K13.x,K13.y,K13.z);this.mechanic.group.rotation.y=.6;this.mechanic.needle.visible=false;
    this.scene.add(this.mechanic.group,this.hero.group);
    // Physical capacitor, moving isolator and thermometer share the console's live state.
    this.capacitor=this.mesh(new T.CylinderGeometry(1.3,1.3,6,16),this.cyan,5,7.2,7);
    this.mesh(new T.CylinderGeometry(1.5,1.5,6.5,16,1,true),new T.MeshStandardMaterial({color:'#516568',transparent:true,opacity:.3,metalness:.7,roughness:.2,side:T.DoubleSide}),5,7.2,7);
    this.thermal=this.mesh(new T.CylinderGeometry(.13,.13,5,8),this.red,-5,7,7);
    this.mesh(new T.BoxGeometry(4,.8,2),this.basalt,0,4.4,9);
    this.shutter=this.mesh(new T.BoxGeometry(2,.15,1),this.copper,0,6.2,9);this.shutter.rotation.z=.65;
    this.relayRing=this.mesh(new T.RingGeometry(.98,1,64),new T.MeshBasicMaterial({color:COLORS.amber,transparent:true,opacity:0,side:T.DoubleSide,depthWrite:false}),0,4.04,9);this.relayRing.rotation.x=-Math.PI/2;
    this.mesh(new T.CylinderGeometry(4.3,4.3,.4,32),this.basalt,0,26.2,-89,this.lift);
    const liftRing=this.mesh(new T.TorusGeometry(4,.08,6,64),this.glow,0,26.5,-89,this.lift);liftRing.rotation.x=-Math.PI/2;
    this.scene.add(this.lift);
    this.signal=this.sign('ZERO','ELEVATOR / 错误归零',0,29.8,-82,6.5,2.2,'#ef8674');
    const points=[new T.Vector3(0,29,-82),new T.Vector3(9,29,-82),new T.Vector3(9,52,-82),new T.Vector3(22,52,-76)];
    this.carryLine=new T.Line(new T.BufferGeometry().setFromPoints(points),new T.LineBasicMaterial({color:'#ef8674'}));this.scene.add(this.carryLine);
    // Steam and industrial ribs are instanced, so the larger silhouette stays inexpensive.
    this.steam=new T.InstancedMesh(new T.SphereGeometry(1,8,6),new T.MeshBasicMaterial({color:'#adbfc0',transparent:true,opacity:.035,depthWrite:false}),36);this.steam.frustumCulled=false;this.scene.add(this.steam);
    this.flush();this.weather=new WeatherRig(this.scene,true);
  }
  private mesh(g:T.BufferGeometry,m:T.Material,x:number,y:number,z:number,parent:T.Object3D=this.scene):T.Mesh {
    const mesh=new T.Mesh(g,m);mesh.position.set(x,y,z);parent.add(mesh);return mesh;
  }
  private box(mat:T.Material,x:number,y:number,z:number,w:number,h:number,d:number,rot=0):void {
    if(!this.batches.has(mat))this.batches.set(mat,[]);this.batches.get(mat)!.push([x,y,z,w,h,d,rot]);
  }
  private flush():void {
    for(const [mat,boxes] of this.batches){const mesh=new T.InstancedMesh(this.unit,mat,boxes.length);boxes.forEach(([x,y,z,w,h,d,r],i)=>{this.dummy.position.set(x,y,z);this.dummy.scale.set(w,h,d);this.dummy.rotation.set(0,r??0,0);this.dummy.updateMatrix();mesh.setMatrixAt(i,this.dummy.matrix);});mesh.computeBoundingSphere();this.scene.add(mesh);}this.batches.clear();
  }
  private sign(title:string,sub:string,x:number,y:number,z:number,w:number,h:number,color=COLORS.amber):T.Mesh {
    return this.mesh(new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({map:signTexture(title,sub,color),side:T.DoubleSide}),x,y,z);
  }
  private platform(s:Surface,parent:T.Object3D):void {
    const rise=s.rise??0,length=Math.hypot(s.d,rise),angle=Math.atan2(rise,s.d);
    const g=new T.Group();g.position.set(s.x,s.y+rise/2-.25,s.z);g.rotation.x=angle;parent.add(g);
    const groups=new Map<T.Material,Box[]>();
    const put=(mat:T.Material,x:number,y:number,z:number,w:number,h:number,d:number):void=>{if(!groups.has(mat))groups.set(mat,[]);groups.get(mat)!.push([x,y,z,w,h,d]);};
    put(this.deck,0,0,0,s.w,.5,length);
    for(const side of [-1,1]){
      put(this.glow,side*(s.w/2-.25),.3,0,.13,.07,length);
      put(this.basalt,side*s.w/2,.8,0,.18,.13,length);
      for(let z=-length/2+2;z<length/2;z+=4)put(this.copper,side*s.w/2,.4,z,.12,1.2,.12);
    }
    // Dashed center line makes the rising route readable in both weather states.
    for(let z=-length/2+2;z<length/2;z+=4)put(this.cyan,0,.265,z,.12,.012,1.3);
    for(const [mat,boxes] of groups){const mesh=new T.InstancedMesh(this.unit,mat,boxes.length);boxes.forEach(([x,y,z,w,h,d],i)=>{this.dummy.position.set(x,y,z);this.dummy.rotation.set(0,0,0);this.dummy.scale.set(w,h,d);this.dummy.updateMatrix();mesh.setMatrixAt(i,this.dummy.matrix);});mesh.computeBoundingSphere();g.add(mesh);}
    if(!rise&&s.id!=='forge-summit')for(const x of [-s.w/2+1,s.w/2-1])this.box(this.basalt,s.x+x,(s.y-7)/2,s.z,1,s.y+7,1);
  }
  private buildArchitecture():void {
    // Broad heat-sink blocks replace the dock's apartment grid.
    for(const side of [-1,1])for(let i=0;i<8;i++){
      const x=side*(39+(i%2)*15),z=24-i*23,h=22+(i*17%39),w=17+(i%3)*2;
      this.box(this.basalt,x,h/2-7,z,w,h,16);
      for(let j=0;j<9;j++)this.box(this.copper,x-w/2+j*w/8,h/2-3,z, .45,h+8,19);
      this.box(this.dim,x,h-3,z, w+1,2,17);
      for(let k=0;k<3;k++)this.box(this.glow,x-w/2-.3,6+k*7,z, .15,.18,16);
      if(i%2===0){const tower=this.mesh(new T.CylinderGeometry(5,8,26,12,1,true),this.basalt,x+side*13,7,z-9);tower.rotation.y=.2;this.mesh(new T.TorusGeometry(5,.3,6,32),this.copper,x+side*13,20,z-9).rotation.x=-Math.PI/2;}
    }
    // Eight actual bit rings; lamps receive values from the same ALU examples as the proof.
    this.mesh(new T.CylinderGeometry(3.2,6,76,16),this.basalt,22,31,-76);
    for(let i=0;i<8;i++){
      const y=25+i*6.5,r=14-i*.45;
      const ring=this.mesh(new T.TorusGeometry(r,.48,8,80),this.copper,22,y,-76);ring.rotation.x=Math.PI/2;this.rings.push(ring);
      const light=this.mesh(new T.TorusGeometry(r-.2,.07,5,80,Math.PI*1.5),this.red,22,y+.35,-76);light.rotation.x=Math.PI/2;light.rotation.z=i*.25;
      const bit=this.mesh(new T.BoxGeometry(2.7,1.3,.35),this.dim,22,y,-76+r);this.bits.push(bit);
      this.sign(`BIT ${i}`,`${2**i} / REGISTER`,22,y+2,-76+r,4,1.2,'#adc3ba');
    }
    const halo=this.mesh(new T.TorusGeometry(19,.24,6,96),this.glow,22,78,-76);halo.rotation.x=Math.PI/2;
    this.mesh(new T.CylinderGeometry(.5,.5,94,12),this.copper,22,40,-76);
    for(const side of [-1,1])for(let row=0;row<3;row++)for(let col=0;col<4;col++){
      const panel=this.mesh(new T.BoxGeometry(3.8,.16,5),new T.MeshStandardMaterial({color:'#315a66',metalness:.85,roughness:.2,emissive:'#426c70',emissiveIntensity:.2}),side*(16+col*4.5),6+row*2,16-row*11);panel.rotation.z=side*.18;panel.rotation.x=-.4;this.solar.push(panel);
      this.box(this.basalt,panel.position.x,1,panel.position.z,.35,14,.35);
      for(let j=0;j<5;j++)this.box(this.cyan,panel.position.x, panel.position.y+.15,panel.position.z-2+j,3.4,.025,.025);
    }
    // Copper pipe arches frame the route without blocking the player/camera corridor.
    for(const z of [26,-44,-80])for(const side of [-1,1]){
      this.box(this.copper,side*13,12,z,1,38,1);this.box(this.copper,side*21,30,z,17,1,1);
      this.mesh(new T.TorusGeometry(4,.5,8,32,Math.PI),this.copper,side*17,30,z);
    }
    // Arrival train visibly connects the two cities.
    for(let i=0;i<2;i++){
      this.box(this.basalt,7,6,35+i*7,3.4,3,6.7);this.box(this.copper,7,7.7,35+i*7,3.6,.3,6.7);
      this.box(this.cyan,7,6.5,31.6+i*7,2.6,.9,.05);
      for(const side of [-1,1]){this.box(this.glow,7+side*1.73,5.3,35+i*7,.05,.12,6.4);for(let j=0;j<3;j++)this.box(this.cyan,7+side*1.73,6.6,33+j*1.7+i*7,.05,1,1.1);}
    }
    // Distant furnaces vary the skyline, with no external textures or runtime network.
    for(let i=0;i<22;i++){const angle=i*.67,r=150+(i%4)*38,x=Math.sin(angle)*r,z=-65+Math.cos(angle)*r,h=35+(i*31%86);this.box(this.basalt,x,h/2-7,z,14+(i%5)*6,h,19);for(let j=0;j<5;j++)this.box(this.copper,x-8+j*4,h/2,z,1,h+5,22);this.box(this.red,x,h,z,1,1,1);}
  }
  setProgress(f:ForgeProgress):void {
    this.power=f.power.energized;this.repaired=FORGE_PHASES.indexOf(f.phase)>=3;
    this.bridge.visible=this.power;this.surfaces[1].enabled=this.power;
    this.summit.visible=f.phase==='complete';this.surfaces[6].enabled=f.phase==='complete';
    this.capacitor.scale.y=Math.max(.015,f.power.charge/100);this.capacitor.position.y=4.2+3*this.capacitor.scale.y;
    this.thermal.scale.y=f.power.temperature/100;this.thermal.position.y=4.5+2.5*this.thermal.scale.y;
    this.shutter.rotation.z=f.power.isolated?0:.65;
    this.glow.color.set(this.power?'#ffd596':'#d49b63');
    this.copper.emissive.set(this.repaired?'#66452b':'#000000');this.copper.emissiveIntensity=this.repaired?.25:0;
  }
  setFlag(flag:Flag):void {
    if(flag===this.flag)return;this.flag=flag;
    const mat=this.signal.material as T.MeshBasicMaterial;mat.map?.dispose();mat.map=signTexture(flag,'LIFT ENABLE / 草案接线',flag==='CARRY'?'#8ef7c7':'#ef8674');
    (this.carryLine.material as T.LineBasicMaterial).color.set(flag==='CARRY'?'#8ef7c7':'#ef8674');
  }
  setReplay(on:boolean):void {this.replay=on;}
  scan(p:V3):void {this.scanAt=this.time;this.relayRing.position.set(p.x,p.y+.03,p.z);}
  setQuality(low:boolean):void {this.weather.setQuality(low);this.steam.count=low?16:36;}
  update(dt:number,hero:V3,speed:number,_frozen:boolean,reduced:boolean):void {
    this.time+=dt;this.hero.group.position.set(hero.x,hero.y,hero.z);
    const stride=Math.sin(this.time*Math.max(4,speed*1.8))*Math.min(.48,speed*.07);
    this.hero.leftLeg.rotation.x=stride;this.hero.rightLeg.rotation.x=-stride;this.hero.leftArm.rotation.x=-stride*.5;
    this.hero.head.rotation.z=reduced?0:Math.sin(this.time*.7)*.035;
    this.mechanic.head.rotation.y=Math.sin(this.time*.35)*.2;
    this.lift.position.y=this.liftY-26;
    this.rings.forEach((ring,i)=>{if(!reduced)ring.rotation.z=this.time*(.04+i*.006)*(i%2?1:-1);});
    const [a,b]=CARRY_EXAMPLES[Math.floor(this.time/(this.replay?1.1:3))%CARRY_EXAMPLES.length];
    const output=add8(a,b);this.bits.forEach((bit,i)=>bit.material=(output.value>>i)&1?this.glow:this.dim);
    if(this.repaired)this.bits.forEach((bit,i)=>{bit.material=Math.floor(this.time*3)%8===i?this.cyan:bit.material;});
    for(let i=0;i<this.steam.count;i++){
      const t=(this.time*.09+i*.618)%1;
      this.dummy.position.set((i%2?1:-1)*(50+(i%3)*9)+Math.sin(this.time*.3+i)*t*5,21+t*34,-15-Math.floor(i/6)*23);
      this.dummy.rotation.set(0,0,0);this.dummy.scale.set(1+t*5,2+t*7,1+t*5);this.dummy.updateMatrix();this.steam.setMatrixAt(i,this.dummy.matrix);
    }this.steam.instanceMatrix.needsUpdate=true;
    const scanAge=this.time-this.scanAt;this.relayRing.visible=scanAge<2;
    this.relayRing.scale.setScalar(1+scanAge*12);(this.relayRing.material as T.MeshBasicMaterial).opacity=Math.max(0,.6-scanAge*.3);
    this.solar.forEach(panel=>{(panel.material as T.MeshStandardMaterial).emissiveIntensity=.15+(1-this.weather.wetness)*.5;});
    this.deck.roughness=.57-this.weather.wetness*.32;
    this.weather.update(dt,hero,reduced,this.surfaces);
  }
}
