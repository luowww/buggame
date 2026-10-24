import type { Intent } from './physics';
export class GameInput {
  keys=new Set<string>();
  stick={x:0,y:0};
  touchJump=false;
  touchSprint=false;
  onAction: (key:string)=>void=()=>{};
  onLook: (x:number,y:number)=>void=()=>{};
  private lookPointer:number|null=null;
  private lookPosition={x:0,y:0};
  constructor(canvas: HTMLCanvasElement) {
    window.addEventListener('keydown',e=>{
      if((e.target instanceof HTMLInputElement||e.target instanceof HTMLSelectElement)&&!['Tab','Escape'].includes(e.code))return;
      if(['Tab','Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();
      this.keys.add(e.code);if(!e.repeat)this.onAction(e.code);
    });
    window.addEventListener('keyup',e=>this.keys.delete(e.code));
    window.addEventListener('blur',()=>this.clear());
    canvas.addEventListener('contextmenu',e=>e.preventDefault());
    canvas.addEventListener('pointerdown',e=>{
      if(e.button===2||(e.pointerType==='touch'&&e.clientX>window.innerWidth*.45)){
        this.lookPointer=e.pointerId;this.lookPosition={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);
      }
    });
    canvas.addEventListener('pointermove',e=>{
      if(this.lookPointer!==e.pointerId)return;
      this.onLook(e.clientX-this.lookPosition.x,e.clientY-this.lookPosition.y);this.lookPosition={x:e.clientX,y:e.clientY};
    });
    const end=(e:PointerEvent):void=>{if(e.pointerId===this.lookPointer)this.lookPointer=null;};
    canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);
    this.bindStick();
  }
  clear():void{this.keys.clear();this.stick={x:0,y:0};this.touchJump=false;this.lookPointer=null;document.getElementById('stick-knob')?.style.removeProperty('transform');}
  intent(yaw:number):Intent {
    const x=Number(this.keys.has('KeyD')||this.keys.has('ArrowRight'))-Number(this.keys.has('KeyA')||this.keys.has('ArrowLeft'))+this.stick.x;
    const z=Number(this.keys.has('KeyS')||this.keys.has('ArrowDown'))-Number(this.keys.has('KeyW')||this.keys.has('ArrowUp'))+this.stick.y;
    return {x:x*Math.cos(yaw)+z*Math.sin(yaw),z:-x*Math.sin(yaw)+z*Math.cos(yaw),jump:this.keys.has('Space')||this.touchJump,sprint:this.keys.has('ShiftLeft')||this.keys.has('ShiftRight')||this.touchSprint};
  }
  private bindStick():void {
    const stick=document.getElementById('touch-stick')!;const knob=document.getElementById('stick-knob')!;
    let pointer:number|null=null;
    const move=(e:PointerEvent):void=>{const r=stick.getBoundingClientRect();let x=(e.clientX-r.x-r.width/2)/38,y=(e.clientY-r.y-r.height/2)/38;const length=Math.max(1,Math.hypot(x,y));x/=length;y/=length;this.stick={x,y};knob.style.transform=`translate(${x*32}px,${y*32}px)`;};
    stick.addEventListener('pointerdown',e=>{pointer=e.pointerId;stick.setPointerCapture(e.pointerId);move(e);});
    stick.addEventListener('pointermove',e=>{if(e.pointerId===pointer)move(e);});
    const release=(e:PointerEvent):void=>{if(e.pointerId===pointer){pointer=null;this.stick={x:0,y:0};knob.style.transform='';}};
    stick.addEventListener('pointerup',release);stick.addEventListener('pointercancel',release);
  }
}
