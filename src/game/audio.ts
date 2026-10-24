/** Original procedural soundtrack. No files, tracking, external requests or autoplay. */
export class CityAudio {
  private ctx: AudioContext | null = null;
  private bus: GainNode | null = null;
  private enabled = false;
  private paused = false;
  private timer: number | null = null;
  private beat = 0;
  private next = 0;
  recovered = false;
  city: 'dock'|'forge' = 'dock';
  unlock(): void {
    try {
      if(!this.ctx){this.ctx=new AudioContext();this.bus=this.ctx.createGain();this.bus.gain.value=0;const limiter=this.ctx.createDynamicsCompressor();limiter.threshold.value=-16;limiter.ratio.value=6;this.bus.connect(limiter);limiter.connect(this.ctx.destination);}
      if(this.ctx.state==='suspended')void this.ctx.resume().catch(()=>{});
    } catch {this.enabled=false;}
  }
  setEnabled(enabled: boolean): void {
    this.enabled=enabled;if(enabled)this.unlock();
    this.applyVolume();
    if(enabled&&!this.timer&&this.ctx){this.next=this.ctx.currentTime+.05;this.timer=window.setInterval(()=>this.schedule(),80);}
    if(!enabled&&this.timer){clearInterval(this.timer);this.timer=null;}
  }
  setPaused(paused: boolean): void {
    this.paused=paused;this.applyVolume();
    if(!paused&&this.ctx)this.next=this.ctx.currentTime+.1;
  }
  private applyVolume(): void {
    if(this.ctx&&this.bus)this.bus.gain.setTargetAtTime(this.enabled && !this.paused ? .38 : 0,this.ctx.currentTime,.12);
  }
  private tone(freq: number,at: number,duration: number,volume: number,type: OscillatorType='sine'): void {
    if(!this.ctx||!this.bus)return;
    const osc=this.ctx.createOscillator(),gain=this.ctx.createGain();osc.type=type;osc.frequency.value=freq;
    gain.gain.setValueAtTime(.0001,at);gain.gain.exponentialRampToValueAtTime(volume,at+.025);gain.gain.exponentialRampToValueAtTime(.0001,at+duration);
    osc.connect(gain);gain.connect(this.bus);osc.start(at);osc.stop(at+duration+.02);osc.onended=()=>{osc.disconnect();gain.disconnect();};
  }
  private schedule(): void {
    if(!this.ctx||this.paused)return;
    const now=this.ctx.currentTime;
    if(this.next<now-.5)this.next=now+.05;
    const notes=this.recovered?[146.83,185,220,277.18,293.66,220,185,164.81]:[146.83,164.81,220,196,146.83,130.81,164.81,110];
    while(this.next<now+.2){
      const at=this.next;
      if(this.beat%4===0){this.tone(notes[Math.floor(this.beat/4)%8]/2,at,2.5,.09,'sine');this.tone(notes[Math.floor(this.beat/4)%8],at,3,.025,'triangle');}
      if(this.beat%2===0)this.tone(notes[(this.beat/2)%8]*2,at,1.3,this.recovered ? .027 : .013,'sine');
      if(this.beat%4===0)this.tone(43,at,.14,.11);
      if(this.city==='forge'){
        if(this.beat%2===1)this.tone(110*(1+this.beat%3),at,.06,.018,'square');
        if(this.beat%8===4)this.tone(55,at,.16,.08,'triangle');
      }
      this.beat++;this.next+=60/(this.city==='forge'?110:88)/2;
    }
  }
  cue(kind:'scan'|'select'|'fail'|'success'|'step'|'jump'): void {
    if(!this.enabled||this.paused||!this.ctx)return;
    const at=this.ctx.currentTime;
    if(kind==='scan'){for(let i=0;i<5;i++)this.tone(220+i*110,at+i*.06,.22,.04);}
    if(kind==='select'){this.tone(660,at,.09,.07);this.tone(880,at+.03,.12,.025);}
    if(kind==='fail'){this.tone(146.83,at,.3,.08,'triangle');this.tone(138.59,at+.1,.4,.06,'triangle');}
    if(kind==='success'){[146.83,220,293.66,369.99,440].forEach((n,i)=>this.tone(n,at+i*.16,1.5,.07));}
    if(kind==='jump')this.tone(220,at,.18,.03,'triangle');
    if(kind==='step')this.tone(68,at,.04,.04);
  }
}
