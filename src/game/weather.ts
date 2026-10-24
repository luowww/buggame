import * as T from 'three';
import type { Weather } from './forge-domain';
import { floorAt, type Surface, type V3 } from './physics';

/** Presentation blends gradually; authoritative device simulation switches on the selected weather. */
export class WeatherRig {
  weather: Weather = 'rain';
  wetness = 1;
  private time = 0;
  private sky: T.Mesh;
  private rain: T.LineSegments;
  private sun: T.Mesh;
  private clouds = new T.Group();
  private ripples: T.InstancedMesh;
  private matrix = new T.Object3D();
  private lights: { light: T.Light; intensity: number }[] = [];
  private fogRain: T.Color;
  private fogSun: T.Color;
  private groundY: number;
  constructor(private scene: T.Scene, forge = false, sky?: T.Mesh, rain?: T.LineSegments) {
    this.fogRain = new T.Color(forge ? '#253437' : '#10272e');
    this.groundY=forge?-7:-5;
    this.fogSun = new T.Color(forge ? '#a89373' : '#688d91');
    const skyMat = new T.ShaderMaterial({ side:T.BackSide, depthWrite:false, uniforms:{ wet:{value:1}, forge:{value:Number(forge)} },
      vertexShader:'varying vec3 vP;void main(){vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:'uniform float wet;uniform float forge;varying vec3 vP;void main(){float h=normalize(vP).y;vec3 day=mix(mix(vec3(.68,.75,.69),vec3(.86,.70,.47),forge),vec3(.17,.36,.47),smoothstep(-.06,.8,h));vec3 rain=mix(vec3(.13,.23,.25),vec3(.025,.065,.09),smoothstep(-.06,.6,h));gl_FragColor=vec4(mix(day,rain,wet),1.);}' });
    this.sky = sky ?? new T.Mesh(new T.SphereGeometry(1100,24,16));
    (this.sky.material as T.Material)?.dispose();this.sky.material=skyMat;scene.add(this.sky);
    if (!rain) {
      const points = new Float32Array(1600*6);
      let seed=144;const rand=():number=>{seed=(Math.imul(seed,1664525)+1013904223)|0;return(seed>>>0)/4294967296;};
      for(let i=0;i<1600;i++){const x=(rand()-.5)*100,y=rand()*90,z=(rand()-.5)*100;points.set([x,y,z,x-.15,y-1.05,z],i*6);}
      const geo=new T.BufferGeometry();geo.setAttribute('position',new T.BufferAttribute(points,3));rain=new T.LineSegments(geo);
    }
    this.rain=rain;(rain.material as T.Material)?.dispose();
    rain.material=new T.ShaderMaterial({ transparent:true,depthWrite:false,uniforms:{time:{value:0},wet:{value:1}},
      vertexShader:'uniform float time;varying float fade;void main(){vec3 p=position;p.y=mod(p.y-time*17.,90.);fade=1.-p.y/100.;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}',
      fragmentShader:'uniform float wet;varying float fade;void main(){gl_FragColor=vec4(.68,.81,.83,fade*.24*wet);}' });scene.add(rain);
    this.sun=new T.Mesh(new T.SphereGeometry(8,24,16),new T.MeshBasicMaterial({color:'#ffdb9c',transparent:true,opacity:0,fog:false}));
    this.sun.position.set(-170,145,-340);scene.add(this.sun);
    const cloudMat=new T.MeshBasicMaterial({color:'#849a9b',transparent:true,opacity:.1,depthWrite:false});
    const cloudGeo=new T.SphereGeometry(1,12,8);
    for(let i=0;i<12;i++){const cloud=new T.Mesh(cloudGeo,cloudMat);cloud.scale.set(55+(i%3)*12,3+(i%4),14);cloud.position.set(-240+i*48,110+(i%4)*18,-230-(i%3)*75);this.clouds.add(cloud);}scene.add(this.clouds);
    const rippleMat=new T.MeshBasicMaterial({color:'#bddee0',transparent:true,opacity:.16,depthWrite:false,side:T.DoubleSide});
    this.ripples=new T.InstancedMesh(new T.RingGeometry(.9,1,24),rippleMat,32);this.ripples.frustumCulled=false;scene.add(this.ripples);
    scene.children.forEach(obj=>{if(obj instanceof T.Light)this.lights.push({light:obj,intensity:obj.intensity});});
  }
  setQuality(low:boolean):void {this.rain.geometry.setDrawRange(0,low?700:2800);this.ripples.count=low?12:32;}
  update(dt:number, position:V3, reduced:boolean, surfaces:Surface[]=[]):void {
    this.time+=dt;
    this.wetness=T.MathUtils.damp(this.wetness,this.weather==='rain'?1:0,reduced?8:1.4,dt);
    (this.sky.material as T.ShaderMaterial).uniforms.wet.value=this.wetness;
    const rainMat=this.rain.material as T.ShaderMaterial;
    rainMat.uniforms.time.value=this.time;rainMat.uniforms.wet.value=this.wetness;
    this.rain.position.set(position.x,position.y,position.z);this.rain.visible=this.wetness>.008;
    (this.sun.material as T.MeshBasicMaterial).opacity=(1-this.wetness)*.95;
    this.clouds.position.x=reduced?0:Math.sin(this.time*.012)*30;
    ((this.clouds.children[0] as T.Mesh).material as T.MeshBasicMaterial).opacity=.1+this.wetness*.28;
    if(this.scene.fog instanceof T.FogExp2){this.scene.fog.color.copy(this.fogSun).lerp(this.fogRain,this.wetness);this.scene.fog.density=.0028+this.wetness*.0016;}
    this.lights.forEach(({light,intensity})=>{
      light.intensity=intensity*(1.3-this.wetness*.3);
      if(light instanceof T.DirectionalLight)light.color.set(this.wetness>.5?'#b3d0d5':'#ffe0a9');
    });
    (this.ripples.material as T.MeshBasicMaterial).opacity=this.wetness*.17;
    this.ripples.visible=this.rain.visible;
    for(let i=0;i<this.ripples.count;i++){
      const age=(this.time*1.1+i*.618)%1;
      const x=position.x+Math.sin(i*71)*8,z=position.z+Math.cos(i*43)*8;
      const floor=floorAt(surfaces,x,z,position.y+.5)??this.groundY;
      this.matrix.position.set(x,floor+.026,z);
      this.matrix.rotation.x=-Math.PI/2;this.matrix.scale.setScalar(.05+age*.32);this.matrix.updateMatrix();this.ripples.setMatrixAt(i,this.matrix.matrix);
    }this.ripples.instanceMatrix.needsUpdate=true;
  }
}
