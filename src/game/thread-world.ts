import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { deckTexture, makeAvatar, signTexture } from './world';
import { WeatherRig } from './weather';
import { THREAD_POS, IRIS, THREAD_AUDIT, THREAD_END, threadSurfaces } from './thread-layout';
import { THREAD_MAIN, type ThreadCase, type ThreadProgress, type ThreadRun } from './thread-domain';
import type { Obstacle, Surface, V3 } from './physics';

type Box=[number,number,number,number,number,number,number?,number?];
const colors={cyan:'#83d2e8',amber:'#f2c887',red:'#ec7979',mint:'#9ce6c3',ink:'#172c3a'};
export class ThreadWorld {
  scene=new T.Scene();surfaces=threadSurfaces();obstacles:Obstacle[]=[];solids:T.Box3[]=[];
  hero=makeAvatar(colors.amber);guide=makeAvatar(colors.cyan);
  weather:WeatherRig;
  focus:V3={...THREAD_POS['OS-01']};
  rideT:number|null=null;
  private time=0;private recovery=0;private target=0;private scanAt=-100;
  private batches=new Map<T.Material,Box[]>();private unit=new T.BoxGeometry(1,1,1);private dummy=new T.Object3D();
  private steel=new T.MeshStandardMaterial({color:'#344c60',metalness:.68,roughness:.43});
  private shell=new T.MeshStandardMaterial({color:'#506b7d',metalness:.72,roughness:.32});
  private deck=new T.MeshStandardMaterial({color:'#a4b9bb',map:deckTexture(),metalness:.36,roughness:.55});
  private glass=new T.MeshStandardMaterial({color:'#183949',metalness:.78,roughness:.2,emissive:'#15313e',emissiveIntensity:.5});
  private cyan=new T.MeshBasicMaterial({color:colors.cyan});private amber=new T.MeshBasicMaterial({color:colors.amber});
  private red=new T.MeshBasicMaterial({color:colors.red});private dim=new T.MeshBasicMaterial({color:'#335569'});
  private recovered=new T.MeshBasicMaterial({color:'#345c68'});
  private gates:{deck:T.Group;ghost:T.Mesh;surface:Surface}[]=[];
  private lamps=new Map<ThreadCase,T.Mesh>();private signs=new Map<ThreadCase,T.Mesh>();
  private trainP:T.Group;private trainQ:T.Group;private lockA:T.Mesh;private lockB:T.Mesh;
  private counter:T.Mesh;private memory:T.Mesh[]=[];private memorySigns:T.Mesh[]=[];private residentDots:T.InstancedMesh;
  private shadows:T.Mesh[]=[];private broadcast:T.Mesh;
  private sparks:T.InstancedMesh;private scan:T.Mesh;private phase:ThreadProgress['phase']='arrival';
  private solved=new Set<ThreadCase>();private lastTrace='';
  private rideCurve=new T.CatmullRomCurve3([
    new T.Vector3(0,39,-190),new T.Vector3(35,55,-175),new T.Vector3(66,72,-119),new T.Vector3(35,81,-69),
    new T.Vector3(-25,76,-90),new T.Vector3(-66,70,-135),new T.Vector3(-28,66,-183),new T.Vector3(18,64,-172),
  ]);
  constructor(){
    this.scene.background=new T.Color('#102735');this.scene.fog=new T.FogExp2('#102735',.0038);
    this.scene.add(new T.HemisphereLight('#b4d9ef','#172c37',2.5));
    const sun=new T.DirectionalLight('#e0e6d8',2.4);sun.position.set(-60,150,75);this.scene.add(sun);
    const rim=new T.DirectionalLight('#72b7dd',2.7);rim.position.set(70,60,-220);this.scene.add(rim);
    const floor=this.mesh(new T.PlaneGeometry(1600,1600),new T.MeshStandardMaterial({color:'#132e3b',roughness:.24,metalness:.8}),0,-5,-90);floor.rotation.x=-Math.PI/2;
    this.architecture();
    this.surfaces.forEach(s=>{
      if(s.id.startsWith('thread-gate-')){
        const group=new T.Group();this.platform(s,group);this.scene.add(group);
        const ghost=this.mesh(new T.BoxGeometry(s.w,.4,s.d),new T.MeshBasicMaterial({color:colors.red,wireframe:true,transparent:true,opacity:.18}),s.x,s.y-.2,s.z);
        this.gates.push({deck:group,ghost,surface:s});
      }else if(s.id==='thread-summit'){
        // The summit balcony exists physically but only becomes collidable after the evacuation.
        this.platform(s);
      }else this.platform(s);
    });
    this.sign('千线程','THREADFALL / SECTOR 03',-14,12,30,12,4.5,colors.cyan);
    this.sign('不要让等待变成永远','FOUR SYSTEMS / SIX STORIES',0,12,2,13,4.2,colors.amber);
    this.sign('IRIS','DISPATCHER / 两条生命线',-7,9.8,27,4.5,1.7,colors.cyan);
    for(const id of [...THREAD_MAIN,'OS-S1','OS-S2'] as ThreadCase[]){
      const p=THREAD_POS[id];this.console(id,p);
    }
    this.sign('WAIT-FOR-∞','CITY AUDIT / 双线疏散',THREAD_AUDIT.x,THREAD_AUDIT.y+7,THREAD_AUDIT.z-9,17,5,colors.red);
    this.sign('03 / ARRIVED','NO ONE LEFT WAITING',THREAD_END.x,THREAD_END.y+5,-179,13,3,colors.mint);
    this.guide.group.position.set(IRIS.x,IRIS.y,IRIS.z);this.guide.group.rotation.y=.65;this.guide.needle.visible=false;
    this.scene.add(this.guide.group,this.hero.group);
    this.trainP=this.train(colors.cyan);this.trainQ=this.train(colors.amber);
    this.lockA=this.mesh(new T.OctahedronGeometry(1.1,0),this.red,-6,10,4);
    this.lockB=this.mesh(new T.OctahedronGeometry(1.1,0),this.red,6,10,-6);
    this.sign('A','TRACK LOCK',-6,12,4,2.5,1.5,colors.red);this.sign('B','TRACK LOCK',6,12,-6,2.5,1.5,colors.red);
    this.counter=this.sign('01 / 02','LOST UPDATE / 消失的那一票',0,32,-109,10,4,colors.red);
    for(let i=0;i<3;i++){
      const frame=this.mesh(new T.BoxGeometry(3.1,3.5,.4),this.glass,(i-1)*4,44,-166);this.memory.push(frame);
      this.memorySigns.push(this.sign(`${i+1}`,'PAGE FRAME',(i-1)*4,44,-165.75,2.6,2.4,colors.cyan));
    }
    const speaker=THREAD_POS['OS-S1'];
    this.mesh(new T.CylinderGeometry(.15,.3,5.5,8),this.shell,speaker.x-5,speaker.y+2.75,speaker.z-3);
    this.broadcast=this.mesh(new T.CylinderGeometry(.25,.9,1.8,12,1,true),this.red,speaker.x-5,speaker.y+6,speaker.z-3);this.broadcast.rotation.x=Math.PI/2;
    const lease=THREAD_POS['OS-S2'];
    const zone=this.mesh(new T.RingGeometry(1.8,1.95,48),this.cyan,lease.x,lease.y+.035,lease.z-4);zone.rotation.x=-Math.PI/2;
    for(let i=0;i<3;i++){
      const shadow=this.mesh(new T.CapsuleGeometry(.4,.95,4,10),i===2?this.recovered:i?this.amber:this.cyan,lease.x+i*.3,lease.y+1.1,lease.z);shadow.visible=i<2;this.shadows.push(shadow);
    }
    const particles=new T.SphereGeometry(.14,6,5);
    this.residentDots=new T.InstancedMesh(new T.CapsuleGeometry(.22,.65,3,6),this.amber,18);this.residentDots.frustumCulled=false;this.scene.add(this.residentDots);
    this.sparks=new T.InstancedMesh(particles,this.recovered,110);this.sparks.frustumCulled=false;this.scene.add(this.sparks);
    this.scan=this.mesh(new T.RingGeometry(.98,1,72),new T.MeshBasicMaterial({color:colors.cyan,transparent:true,opacity:0,side:T.DoubleSide,depthWrite:false}),0,5.03,20);this.scan.rotation.x=-Math.PI/2;
    const route=this.mesh(new T.TubeGeometry(this.rideCurve,220,.08,5,false),this.dim,0,0,0);route.name='evacuation-route';
    this.flush(this.batches,this.scene);this.weather=new WeatherRig(this.scene);
  }
  private mesh(g:T.BufferGeometry,m:T.Material,x:number,y:number,z:number,parent:T.Object3D=this.scene):T.Mesh {
    const mesh=new T.Mesh(g,m);mesh.position.set(x,y,z);parent.add(mesh);return mesh;
  }
  private box(m:T.Material,x:number,y:number,z:number,w:number,h:number,d:number,rx=0,ry=0,batches=this.batches):void {
    if(!batches.has(m))batches.set(m,[]);batches.get(m)!.push([x,y,z,w,h,d,rx,ry]);
  }
  private flush(batches:Map<T.Material,Box[]>,parent:T.Object3D):void {
    for(const [m,boxes] of batches){const mesh=new T.InstancedMesh(this.unit,m,boxes.length);boxes.forEach(([x,y,z,w,h,d,rx,ry],i)=>{this.dummy.position.set(x,y,z);this.dummy.rotation.set(rx??0,ry??0,0);this.dummy.scale.set(w,h,d);this.dummy.updateMatrix();mesh.setMatrixAt(i,this.dummy.matrix);});mesh.computeBoundingSphere();parent.add(mesh);}batches.clear();
  }
  private platform(s:Surface,parent?:T.Object3D):void {
    const rise=s.rise??0,length=Math.hypot(s.d,rise),angle=Math.atan2(rise,s.d),q=new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),angle);
    const batch=parent?new Map<T.Material,Box[]>():this.batches;
    const put=(m:T.Material,x:number,y:number,z:number,w:number,h:number,d:number):void=>{const p=new T.Vector3(x,y,z).applyQuaternion(q).add(new T.Vector3(s.x,s.y+rise/2-.25,s.z));this.box(m,p.x,p.y,p.z,w,h,d,angle,0,batch);};
    put(this.deck,0,0,0,s.w,.5,length);
    for(const side of [-1,1]){
      put(this.cyan,side*(s.w/2-.3),.3,0,.09,.06,length);put(this.steel,side*s.w/2,1.1,0,.12,.14,length);
      for(let z=-length/2+1;z<length/2;z+=4)put(this.shell,side*s.w/2,.5,z,.09,1.2,.09);
    }
    for(let z=-length/2+1;z<length/2;z+=4)put(this.amber,0,.265,z,.1,.012,1.2);
    if(!rise&&s.id!=='thread-summit')for(const x of [-s.w/2+1,s.w/2-1])this.box(this.steel,s.x+x,(s.y-5)/2,s.z,.5,s.y+5,.5);
    if(parent)this.flush(batch,parent);
  }
  private sign(text:string,sub:string,x:number,y:number,z:number,w:number,h:number,color:string):T.Mesh {
    return this.mesh(new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({map:signTexture(text,sub,color),side:T.DoubleSide}),x,y,z);
  }
  private write(sign:T.Mesh,text:string,sub:string,color:string):void {
    const m=sign.material as T.MeshBasicMaterial;m.map?.dispose();m.map=signTexture(text,sub,color);m.needsUpdate=true;
  }
  private architecture():void {
    for(const side of [-1,1]){
      const x=side*48,z=-108;
      this.mesh(new T.CylinderGeometry(8.5,11.5,105,16),this.glass,x,47,z);
      this.solids.push(new T.Box3(new T.Vector3(x-12,-5,z-15),new T.Vector3(x+12,101,z+15)));
      for(let strand=0;strand<2;strand++){
        const points:T.Vector3[]=[];
        for(let i=0;i<=160;i++){const t=i/160,angle=t*Math.PI*7+strand*Math.PI+side*.5;points.push(new T.Vector3(x+Math.cos(angle)*15,2+t*109,z+Math.sin(angle)*15));}
        this.mesh(new T.TubeGeometry(new T.CatmullRomCurve3(points),240,.27,6,false),strand?this.recovered:this.cyan,0,0,0);
      }
      for(let level=0;level<16;level++){
        const y=3+level*6.6,rotation=level*.47*side;
        const ring=this.mesh(new T.TorusGeometry(11.4,.15,5,48),this.shell,x,y,z);ring.rotation.x=-Math.PI/2;
        for(let module=0;module<6;module++){
          const a=module*Math.PI/3+rotation,px=x+Math.cos(a)*10.9,pz=z+Math.sin(a)*10.9;
          this.box(this.steel,px,y+2,pz,4.8,3.8,3.1,0,-a);
          this.box(this.recovered,px+Math.cos(a)*1.6,y+2,pz+Math.sin(a)*1.6,.12,2.7,2.6,0,-a);
          this.box(this.shell,px,y+4,pz,5.1,.18,3.8,0,-a);
        }
      }
      this.sign(side<0?'P / 01':'Q / 02','THREAD RESIDENCY',x,95,z+14,11,6,side<0?colors.cyan:colors.amber);
    }
    // The skyline is made of thin server blades and suspended process clusters.
    for(let i=0;i<45;i++){
      const side=i%2?1:-1,x=side*(85+(i*31%130)),z=65-i*8,h=25+(i*19%90),w=8+i%4*4;
      this.box(this.glass,x,h/2-5,z,w,h,15);this.box(this.shell,x-w/2,h/2,z,.45,h+10,16);
      for(let y=5;y<h;y+=6)this.box(i%3?this.dim:this.recovered,x,y-3,z+7.6,w-.7,.1,.06);
      this.box(this.red,x,h-4,z,.4,.4,.4);
    }
    for(const [i,z] of [-8,-56,-116,-176].entries()){
      const y=16+i*12;
      for(const side of [-1,1])this.box(this.steel,side*27,y,z,45,.5,3.4);
      this.box(this.red,0,y+3,z,.15,6,.15);
      this.box(this.cyan,0,y,z,96,.07,.07);
    }
    for(let i=0;i<9;i++){
      const rack=this.mesh(new T.TorusGeometry(7+i*.18,.11,5,64,Math.PI*1.6),this.dim,0,105+i*.65,-108);rack.rotation.x=Math.PI/2;rack.rotation.z=i*.22;
    }
  }
  private console(id:ThreadCase,p:V3):void {
    this.box(this.steel,p.x,p.y+.45,p.z,3.8,.9,1.3);
    const lamp=this.mesh(new T.OctahedronGeometry(.55,0),id.startsWith('OS-S')?this.cyan:this.red,p.x,p.y+4,p.z);this.lamps.set(id,lamp);
    const names:Record<ThreadCase,string>={'OS-01':'互相等待的人','OS-02':'等不到的电车','OS-03':'消失的那一票','OS-04':'内存走廊','OS-S1':'噪声广播','OS-S2':'双重影子'};
    this.sign(id,names[id],p.x,p.y+6,p.z-2.5,6,2.4,id.startsWith('OS-S')?colors.cyan:colors.amber);
    const display=this.sign('TRACE','等待扫描 / 设备现场',p.x+4.5,p.y+2.3,p.z-1,4.7,2,colors.red);this.signs.set(id,display);
  }
  private train(color:string):T.Group {
    const group=new T.Group(),glow=new T.MeshBasicMaterial({color});
    this.mesh(new RoundedBoxGeometry(3,2.6,7.5,2,.28),this.shell,0,1.5,0,group);
    this.mesh(new T.BoxGeometry(2.4,.85,.05),glow,0,2,-3.78,group);
    for(const side of [-1,1]){
      this.mesh(new T.BoxGeometry(.05,.12,7),glow,side*1.52,.8,0,group);
      for(let i=0;i<4;i++)this.mesh(new T.BoxGeometry(.06,.75,1),this.glass,side*1.52,2,-2.6+i*1.7,group);
    }this.scene.add(group);return group;
  }
  setProgress(state:ThreadProgress):void {
    this.solved=new Set(state.completed);this.phase=state.phase;this.target=state.completed.filter(id=>THREAD_MAIN.includes(id as typeof THREAD_MAIN[number])).length/4;
    this.gates.forEach((g,i)=>{const on=this.solved.has(THREAD_MAIN[i]);g.deck.visible=on;g.ghost.visible=!on;g.surface.enabled=on;});
    this.surfaces.find(s=>s.id==='thread-summit')!.enabled=state.phase==='complete';
    for(const [id,lamp] of this.lamps)lamp.material=this.solved.has(id)?this.recovered:id.startsWith('OS-S')?this.cyan:this.red;
    this.lockA.material=this.lockB.material=this.solved.has('OS-01')?this.recovered:this.red;
    if(!this.lastTrace)this.resetDisplays();
  }
  private resetDisplays():void {
    for(const [id,sign] of this.signs)this.write(sign,this.solved.has(id)?'200 OK':'TRACE',this.solved.has(id)?'已提交 / COMMITTED':'原始现场 / OBSERVED',this.solved.has(id)?colors.mint:colors.red);
    this.write(this.counter,this.solved.has('OS-03')?'03 / 03':'01 / 02',this.solved.has('OS-03')?'每一票都被保留':'LOST UPDATE / 消失的那一票',this.solved.has('OS-03')?colors.mint:colors.red);
    this.memorySigns.forEach((sign,i)=>this.write(sign,String(i+1),'PAGE FRAME',colors.cyan));
  }
  present(id:ThreadCase,run:ThreadRun,cursor:number):void {
    const key=`${run.runId}/${cursor}`;if(this.lastTrace===key)return;this.lastTrace=key;
    const e=run.log[Math.max(0,Math.min(cursor,run.log.length-1))];if(!e)return;
    const sign=this.signs.get(id)!;this.write(sign,`${e.actor} / ${e.tick}`,`预演 · ${e.kind}`,colors.cyan);
    if(id==='OS-03'){
      const value=/value=(\d+)/.exec(e.detail);if(value)this.write(this.counter,value[1],`预演 / ${e.kind}`,colors.cyan);
    }
    if(id==='OS-04'){
      const pages=/帧 \[([^\]]*)\]/.exec(e.detail)?.[1].split(' ')??[];
      this.memory.forEach((frame,i)=>frame.material=pages[i]?this.cyan:this.glass);
      this.memorySigns.forEach((sign,i)=>this.write(sign,pages[i]??'—',`预演 / FRAME ${i+1}`,colors.cyan));
    }
    if(id==='OS-01'){
      const owners:Record<string,string|null>={A:null,B:null};
      for(const row of run.log.slice(0,cursor+1)){
        if(row.kind==='CONTROLLED_RESTART'){owners.A=null;owners.B=null;}
        const lock=/(?:获取|持有|释放) ([AB])/.exec(row.detail)?.[1];
        if(lock){if(row.kind==='RELEASE')owners[lock]=null;else if(row.kind==='LOCK'||row.kind==='LOCK_HELD')owners[lock]=row.actor;}
      }
      const material=(owner:string|null):T.Material=>owner==='P'?this.cyan:owner==='Q'?this.amber:this.dim;
      this.lockA.material=material(owners.A);this.lockB.material=material(owners.B);
    }
    if(id==='OS-S1'){const ready=run.log.slice(0,cursor+1).some(row=>row.kind==='READY'||row.detail.includes('ready=true'));this.broadcast.material=ready?this.recovered:this.red;}
    if(id==='OS-S2'){
      const inside=new Set<string>();for(const row of run.log.slice(0,cursor+1)){if(row.kind==='ENTER')inside.add(row.actor);if(row.kind==='LEAVE')inside.delete(row.actor);}
      this.shadows.forEach((shadow,i)=>{shadow.visible=i<2||run.log.some(row=>row.actor==='D3');const pos=THREAD_POS['OS-S2'],active=inside.has(`D${i+1}`);shadow.position.set(pos.x+(active?i*.3:(i-1)*3),pos.y+1.1,pos.z+(active?-4:3));});
    }
  }
  clearTrace():void {this.lastTrace='';this.resetDisplays();this.lockA.material=this.lockB.material=this.solved.has('OS-01')?this.recovered:this.red;this.memory.forEach(frame=>frame.material=this.glass);}
  scanAtPosition(p:V3):void {this.scanAt=this.time;this.scan.position.set(p.x,p.y+.03,p.z);}
  ridePosition(t:number):V3 {const p=this.rideCurve.getPointAt(T.MathUtils.clamp(t,0,1));return {x:p.x,y:p.y+2.9,z:p.z};}
  setQuality(low:boolean):void {this.weather.setQuality(low);this.sparks.count=low?48:110;}
  update(dt:number,hero:V3,speed:number,_frozen:boolean,reduced:boolean):void {
    this.time+=dt;this.recovery=T.MathUtils.damp(this.recovery,this.target,1,dt);
    this.recovered.color.set('#345c68').lerp(new T.Color(colors.mint),this.recovery);
    this.hero.group.position.set(hero.x,hero.y,hero.z);
    const stride=Math.sin(this.time*Math.max(4,speed*1.8))*Math.min(.48,speed*.07);
    this.hero.leftLeg.rotation.x=stride;this.hero.rightLeg.rotation.x=-stride;this.hero.leftArm.rotation.x=-stride*.6;
    this.hero.head.rotation.z=reduced?0:Math.sin(this.time*.6)*.03;this.guide.head.rotation.y=Math.sin(this.time*.4)*.18;
    for(const [id,lamp] of this.lamps){if(!reduced)lamp.rotation.y=this.time*.6;lamp.position.y=THREAD_POS[id].y+4+(reduced?0:Math.sin(this.time*1.6)*.13);}
    if(this.rideT!==null){
      const p=this.rideCurve.getPointAt(Math.min(1,this.rideT)),q=this.rideCurve.getPointAt(Math.max(0,this.rideT-.1));
      this.trainP.position.copy(p);this.trainQ.position.copy(q);
      const tangent=this.rideCurve.getTangentAt(Math.min(.999,this.rideT));this.trainP.rotation.y=this.trainQ.rotation.y=Math.atan2(-tangent.x,-tangent.z);
    }else if(!this.solved.has('OS-01')){this.trainP.position.set(-11,7,0);this.trainQ.position.set(11,7,-10);this.trainP.rotation.y=this.trainQ.rotation.y=0;
    }else{
      for(const [i,train] of [this.trainP,this.trainQ].entries()){
        const a=this.time*.09+i*Math.PI,t=(this.time*.022+i*.4)%1;
        train.position.set((i?1:-1)*48+Math.cos(a)*17,8+t*82,-108+Math.sin(a)*17);train.rotation.y=-a;
      }
    }
    for(let i=0;i<this.sparks.count;i++){
      const strand=i%2,phase=(this.time*(this.solved.has('OS-01')?.07:0)+i*.618)%1,a=phase*Math.PI*7+strand*Math.PI;
      this.dummy.position.set((strand?1:-1)*48+Math.cos(a)*15,2+phase*109,-108+Math.sin(a)*15);this.dummy.rotation.set(0,0,0);this.dummy.scale.setScalar(.7+this.recovery*.8);this.dummy.updateMatrix();this.sparks.setMatrixAt(i,this.dummy.matrix);
    }this.sparks.instanceMatrix.needsUpdate=true;
    for(let i=0;i<18;i++){
      const moving=this.solved.has('OS-02'),phase=moving?(this.time*.2+i*.13)%1:i/18;
      this.dummy.position.set(6+(i%2)*1.4,15.6,-39-phase*9);this.dummy.scale.setScalar(.8);this.dummy.updateMatrix();this.residentDots.setMatrixAt(i,this.dummy.matrix);
    }this.residentDots.instanceMatrix.needsUpdate=true;
    const age=this.time-this.scanAt;this.scan.visible=age<2;this.scan.scale.setScalar(1+age*13);(this.scan.material as T.MeshBasicMaterial).opacity=Math.max(0,.6-age*.3);
    this.deck.roughness=.56-this.weather.wetness*.26;
    if(!this.lastTrace){
      this.broadcast.material=this.solved.has('OS-S1')?this.recovered:this.red;
      this.shadows.forEach((shadow,i)=>{shadow.visible=i<2;const p=THREAD_POS['OS-S2'],inside=!this.solved.has('OS-S2')||Math.floor(this.time/3)%2===i;shadow.position.set(p.x+(inside?i*.3:(i-1)*3),p.y+1.1,p.z+(inside?-4:3));});
    }
    if(this.phase==='complete')this.shell.emissive.set('#18252a');else this.shell.emissive.set('#000000');
    this.weather.update(dt,hero,reduced,this.surfaces);
  }
}
