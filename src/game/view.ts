import * as T from 'three';
import { CityWorld, NODE_POS, STATION_POS } from './world';
import type { Settings, Station } from './domain';
import type { V3 } from './physics';

export type ViewMode = 'menu' | 'follow' | 'order' | 'rail' | 'recovery' | 'ride' | 'result';
export class CityView {
  renderer: T.WebGLRenderer;
  camera = new T.PerspectiveCamera(62,1,.15,1300);
  world = new CityWorld();
  mode: ViewMode = 'menu';
  yaw = 0;
  pitch = .34;
  fps = 0;
  frameMs = 0;
  private ray = new T.Ray();
  private raycaster = new T.Raycaster();
  private desired = new T.Vector3();
  private target = new T.Vector3();
  private look = new T.Vector3(9,20,-46);
  private sampleTime = 0;
  private frames = 0;
  private elapsed = 0;
  private warmup = true;
  private settings: Settings;
  private width = 1;
  private height = 1;
  constructor(host: HTMLElement, settings: Settings) {
    this.settings=settings;
    this.renderer=new T.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
    this.renderer.outputColorSpace=T.SRGBColorSpace;
    this.renderer.toneMapping=T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure=1.28;
    this.renderer.domElement.id='city-canvas';
    this.renderer.domElement.setAttribute('aria-label','指针港三维游戏场景；WASD 移动，右键拖动视角，Q 扫描，E 互动');
    this.renderer.domElement.tabIndex=0;
    host.appendChild(this.renderer.domElement);
    this.camera.position.set(6,27,55);
    this.camera.lookAt(this.look);
    this.applySettings(settings);
    this.resize();
    window.addEventListener('resize',()=>this.resize());
  }
  applySettings(settings: Settings): void {
    this.settings=settings;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,settings.quality==='low'?1:1.65));
    this.world.setQuality(settings.quality==='low');
  }
  resize(): void {
    this.width=window.innerWidth;this.height=window.innerHeight;
    this.renderer.setSize(this.width,this.height);this.camera.aspect=this.width/this.height;this.camera.updateProjectionMatrix();
  }
  turn(dx: number,dy: number): void {
    this.yaw-=dx*.004*this.settings.sensitivity;
    this.pitch=Math.max(.12,Math.min(.85,this.pitch+dy*.003*this.settings.sensitivity));
  }
  project(p: V3): {x:number;y:number;visible:boolean} {
    const point=new T.Vector3(p.x,p.y,p.z).project(this.camera);
    return {x:(point.x*.5+.5)*this.width,y:(-.5*point.y+.5)*this.height,visible:point.z<1&&point.z>-1&&Math.abs(point.x)<1.15&&Math.abs(point.y)<1.15};
  }
  pickStation(x: number,y: number): Station | null {
    this.raycaster.setFromCamera(new T.Vector2(x/this.width*2-1,1-y/this.height*2),this.camera);
    const hit=this.raycaster.intersectObjects(this.world.nodes.children,false)[0];
    if(hit)return hit.object.userData.station as Station;
    // Generous screen-space touch target around the actual 3D node.
    let best:Station|null=null;let distance=54;
    for(const [id,p] of Object.entries(NODE_POS)) {
      const screen=this.project(p);const d=Math.hypot(screen.x-x,screen.y-y);
      if(screen.visible&&d<distance){best=id as Station;distance=d;}
    }
    return best;
  }
  render(dt: number,hero: V3,speed: number,paused: boolean): void {
    this.elapsed+=dt;
    this.world.update(paused?0:dt,hero,paused?0:speed,paused||this.mode==='order'||this.mode==='rail',this.settings.reducedMotion);
    this.world.nodes.visible=this.mode==='rail';
    if(this.mode==='menu') {
      const drift=this.settings.reducedMotion?0:Math.sin(this.elapsed*.07)*1.8;
      this.desired.set(6+drift,27,55);this.target.set(14,26,-70);
    } else if(this.mode==='rail') {
      // The central corridor avoids dock towers occluding the editable rail geometry.
      if(this.width<700){this.desired.set(28,164,27);this.target.set(28,13,-35);}
      else if(this.width<1000){this.desired.set(24,110,12);this.target.set(24,13,-45);}
      else {this.desired.set(24,105,6);this.target.set(24,13,-69);}
    } else if(this.mode==='order') {
      this.desired.set(17,15,19);this.target.set(0,3,-1);
    } else if(this.mode==='recovery') {
      this.desired.set(67,49,-6);this.target.set(24,17,-68);
    } else if(this.mode==='result') {
      this.desired.set(62,37,-57);this.target.set(23,20,-89);
    } else {
      const distance=this.width<700?10.5:8.8;
      this.target.set(hero.x,hero.y+1.55,hero.z);
      const yaw=this.mode==='ride'?-.75:this.yaw;
      this.desired.set(hero.x+Math.sin(yaw)*distance,hero.y+2.2+Math.sin(this.pitch)*distance,hero.z+Math.cos(yaw)*distance);
      const direction=this.desired.clone().sub(this.target);const length=direction.length();direction.normalize();
      this.ray.set(this.target,direction);
      for(const box of this.world.solids) {
        const hit=this.ray.intersectBox(box,new T.Vector3());
        if(hit) {const d=hit.distanceTo(this.target);if(d<length)this.desired.copy(this.target).addScaledVector(direction,Math.max(1.5,d-.5));}
      }
    }
    const response=this.warmup?1:1-Math.exp(-dt*(this.settings.reducedMotion?14:5));
    this.camera.position.lerp(this.desired,response);this.look.lerp(this.target,response);this.camera.lookAt(this.look);
    const fov=this.mode==='rail'?53:this.mode==='order'?54:62;
    if(Math.abs(this.camera.fov-fov)>.01){this.camera.fov=T.MathUtils.damp(this.camera.fov,fov,5,dt);this.camera.updateProjectionMatrix();}
    this.renderer.render(this.world.scene,this.camera);this.warmup=false;
    this.frames++;this.sampleTime+=dt;
    if(this.sampleTime>=1){this.fps=Math.round(this.frames/this.sampleTime);this.frameMs=this.sampleTime/this.frames*1000;this.frames=0;this.sampleTime=0;}
  }
  getDrawStats(): {calls:number;triangles:number;geometries:number;textures:number} {
    const info=this.renderer.info;return {calls:info.render.calls,triangles:info.render.triangles,geometries:info.memory.geometries,textures:info.memory.textures};
  }
  getStationScreen(id: Station): ReturnType<CityView['project']> {return this.project(NODE_POS[id]);}
  stationPosition(id: Station): V3 {return {...STATION_POS[id]};}
}
