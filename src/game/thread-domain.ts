import type { Assertion, EventLog, RunResult } from './domain';

export const THREAD_MAIN = ['OS-01','OS-02','OS-03','OS-04'] as const;
export const THREAD_SIDE = ['OS-S1','OS-S2'] as const;
export type ThreadCase = typeof THREAD_MAIN[number] | typeof THREAD_SIDE[number];
export type ThreadPhase = 'arrival'|'locks'|'schedule'|'counter'|'memory'|'audit'|'evacuate'|'complete';
export const THREAD_PHASES: ThreadPhase[] = ['arrival','locks','schedule','counter','memory','audit','evacuate','complete'];
export type Lock = 'A'|'B';
export interface LockPatch { p:Lock; q:Lock; restart:boolean }
export interface SchedulePatch { aging:number; oldestFirst:boolean }
export type CounterPatch = 'split'|'atomic'|'mutex';
export interface MemoryPatch { touchOnHit:boolean; evict:'oldest'|'newest' }
export type WakePatch = 'if'|'while';
export type LeasePatch = 'split'|'cas';
export interface ThreadPatches {
  'OS-01':LockPatch; 'OS-02':SchedulePatch; 'OS-03':CounterPatch;
  'OS-04':MemoryPatch; 'OS-S1':WakePatch; 'OS-S2':LeasePatch;
}
export interface ThreadProgress {
  phase:ThreadPhase; completed:ThreadCase[]; evidence:ThreadCase[]; patches:ThreadPatches; audited:boolean;
}
export interface ThreadRun extends RunResult { metrics:Record<string,number> }
export const freshThread = ():ThreadProgress => ({phase:'arrival',completed:[],evidence:[],audited:false,patches:{
  'OS-01':{p:'A',q:'B',restart:false},'OS-02':{aging:0,oldestFirst:false},'OS-03':'split',
  'OS-04':{touchOnHit:false,evict:'oldest'},'OS-S1':'if','OS-S2':'split',
}});
const cases:readonly ThreadCase[]=[...THREAD_MAIN,...THREAD_SIDE];
const event=(tick:number,kind:string,actor:string,detail:string):EventLog=>({tick,kind,actor,detail});
const assertion=(name:string,passed:boolean,detail:string):Assertion=>({name,passed,detail});
function report(runId:string,assertions:Assertion[],log:EventLog[],metrics:Record<string,number>,success:string):ThreadRun {
  const passed=assertions.every(a=>a.passed);
  return {runId,passed,assertions,log,metrics,route:[],reason:passed?success:assertions.find(a=>!a.passed)!.detail};
}

interface Transition<S> { state:S; kind:string; actor:string; detail:string }
interface Exploration { passed:boolean; states:number; terminal:number; reason:string; log:EventLog[] }
/** Explore every reachable state, with parent links instead of copying every history. No scheduler stuttering. */
function explore<S>(initial:S,next:(s:S)=>Transition<S>[],done:(s:S)=>boolean,bad:(s:S)=>string|null):Exploration {
  const nodes:{state:S;parent:number;step:EventLog|null;depth:number}[]=[{state:initial,parent:-1,step:null,depth:0}];
  const seen=new Set([JSON.stringify(initial)]);let terminal=0,last=0;
  const trace=(index:number):EventLog[]=>{const out:EventLog[]=[];while(index>0){out.push(nodes[index].step!);index=nodes[index].parent;}return out.reverse();};
  for(let index=0;index<nodes.length;index++){
    const node=nodes[index],error=bad(node.state);
    if(error)return {passed:false,states:seen.size,terminal,reason:error,log:trace(index)};
    if(done(node.state)){terminal++;last=index;continue;}
    const transitions=next(node.state);
    if(!transitions.length)return {passed:false,states:seen.size,terminal,reason:'等待环没有可执行的下一步。',log:trace(index)};
    for(const t of transitions){
      const key=JSON.stringify(t.state);if(seen.has(key))continue;
      if(seen.size>=25000)return {passed:false,states:seen.size,terminal,reason:'状态空间超过安全预算，实验未提交。',log:trace(index)};
      seen.add(key);nodes.push({state:t.state,parent:index,depth:node.depth+1,step:event(node.depth+1,t.kind,t.actor,t.detail)});
    }
  }
  return {passed:terminal>0,states:seen.size,terminal,reason:terminal?'全部可达状态正常终止。':'没有可达的完成状态。',log:trace(last)};
}

export function runLocks(patch:LockPatch,runId='OS-01:preview'):ThreadRun {
  if(!patch.restart)return report(runId,[
    assertion('释放旧现场并受控重启',false,'只改申请顺序不会释放已持有的锁。勾选受控重启，先释放旧现场。'),
    assertion('不存在等待环',false,'P 持有 A 等 B；Q 持有 B 等 A。'),
  ],[event(0,'LOCK_HELD','P','P 已持有 A，等待 B'),event(1,'LOCK_HELD','Q','Q 已持有 B，等待 A')],{states:1},'');
  interface State { pc:number[]; owners:number[] }
  const first=[patch.p==='A'?0:1,patch.q==='A'?0:1];
  const result=explore<State>({pc:[0,0],owners:[-1,-1]},s=>{
    const out:Transition<State>[]=[];
    for(let worker=0;worker<2;worker++){
      const pc=s.pc[worker];if(pc===5)continue;
      const n:State={pc:[...s.pc],owners:[...s.owners]};let kind='';let detail='';
      if(pc<2){
        const lock=pc===0?first[worker]:1-first[worker];if(s.owners[lock]!==-1)continue;
        n.owners[lock]=worker;kind='LOCK';detail=`${worker?'Q':'P'} 获取 ${lock?'B':'A'}`;
      }else if(pc===2){kind='CROSS';detail=`${worker?'Q':'P'} 持有两把锁，安全通过交叉桥`;
      }else{const lock=pc===3?1-first[worker]:first[worker];n.owners[lock]=-1;kind='RELEASE';detail=`${worker?'Q':'P'} 释放 ${lock?'B':'A'}`;}
      n.pc[worker]++;out.push({state:n,kind,actor:worker?'Q':'P',detail});
    }return out;
  },s=>s.pc.every(pc=>pc===5),s=>s.pc.some((pc,i)=>pc===2&&s.owners.some(owner=>owner!==i))?'列车在没有持有两把锁时试图通过。':null);
  return report(runId,[assertion('旧现场先释放，再重启',true,'两列车均从未持锁的安全点开始'),
    assertion('所有可达交错均无死锁',result.passed,result.passed?`穷举 ${result.states} 个状态，无等待环`:`${result.reason} P 首锁 ${patch.p}，Q 首锁 ${patch.q}`),
    assertion('两列车都完成并释放锁',result.passed&&result.terminal>0,result.passed?'P 与 Q 都通过交叉桥，锁归还':'存在无法完成的交错')],
  [event(0,'CONTROLLED_RESTART','SYSTEM','释放旧持锁状态，从安全点重启'),...result.log],{states:result.states},'双线通过，共同锁序已恢复。');
}

interface Job { id:string; arrival:number; remaining:number; priority:number; wait:number }
export function simulateSchedule(patch:SchedulePatch,backgroundPriority=8):{completed:number;lowService:number;highService:number;lastFinish:number;log:EventLog[]} {
  const queue:Job[]=[];let completed=0,lowService=0,highService=0,lastFinish=-1;
  const log:EventLog[]=[];
  for(let tick=0;tick<200;tick++){
    if(tick===0||tick===20)queue.push({id:tick?'R2':'R1',arrival:tick,remaining:tick?2:3,priority:0,wait:0});
    queue.push({id:`H${tick}`,arrival:tick,remaining:1,priority:backgroundPriority,wait:0});
    const effective=(j:Job):number=>j.priority+(patch.aging?Math.floor(j.wait/patch.aging):0);
    queue.sort((a,b)=>effective(b)-effective(a)||(patch.oldestFirst?a.arrival-b.arrival:b.arrival-a.arrival)||a.id.localeCompare(b.id));
    const chosen=queue[0];chosen.remaining--;
    if(chosen.id.startsWith('R')){
      lowService++;log.push(event(tick,'RESIDENT_SERVICE',chosen.id,`${chosen.id} 有效优先级 ${effective(chosen)}，累计等待 ${chosen.wait} 周期`));
      if(chosen.remaining===0){completed++;lastFinish=tick;log.push(event(tick,'RESIDENT_ARRIVED',chosen.id,`${chosen.id} 已到站`));}
    }else{highService++;if(tick<3)log.push(event(tick,'PRIORITY_SERVICE',chosen.id,`背景快车优先级 ${backgroundPriority}`));}
    if(chosen.remaining===0)queue.shift();
    for(const job of queue)if(job!==chosen)job.wait++;
  }
  if(completed<2)log.push(event(200,'STARVED','R1/R2',`${2-completed} 列居民电车仍未到站，背景快车已服务 ${highService} 周期`));
  return {completed,lowService,highService,lastFinish,log};
}
export function runScheduling(patch:SchedulePatch,runId='OS-02:preview'):ThreadRun {
  const runs=[8,11,12].map(priority=>({priority,...simulateSchedule(patch,priority)}));
  const failed=runs.find(r=>r.completed<2||r.highService<180),sample=failed??runs[0];
  return report(runId,runs.map(r=>assertion(`背景优先级 ${r.priority} / 200 周期`,r.completed===2&&r.highService>=180,
    r.completed<2?`居民电车仅 ${r.completed}/2 到站；严格优先调度让旧请求一直等待`:`居民 2/2 到站，背景服务 ${r.highService} 周期，末班到站 ${r.lastFinish}`)),sample.log,
    {workloads:runs.length,completed:sample.completed,highService:sample.highService,lastFinish:sample.lastFinish},'三种高负载下，居民电车都获得了服务。');
}

interface CounterState { pc:number[]; locals:number[]; value:number; owner:number }
export function counterOutcomes(policy:CounterPatch,workers:number):{value:number;log:EventLog[]}[] {
  if(!Number.isInteger(workers)||workers<1||workers>3)throw new RangeError('本关只模拟 1–3 个工人。');
  const results:{value:number;log:EventLog[]}[]=[];
  const end=policy==='mutex'?4:2;
  const visit=(s:CounterState,log:EventLog[]):void=>{
    if(s.pc.every(pc=>pc===end)){results.push({value:s.value,log});return;}
    for(let w=0;w<workers;w++){
      const pc=s.pc[w];if(pc===end||(policy==='mutex'&&pc===0&&s.owner!==-1))continue;
      const n:CounterState={pc:[...s.pc],locals:[...s.locals],value:s.value,owner:s.owner};let kind='';let detail='';
      if(policy==='atomic'){n.value++;n.pc[w]=end;kind='COUNTER_WRITE';detail=`原子提交：value=${n.value}`;
      }else if(policy==='mutex'&&pc===0){n.owner=w;n.pc[w]++;kind='MUTEX_LOCK';detail='独占临界区';
      }else if(policy==='mutex'&&pc===3){n.owner=-1;n.pc[w]++;kind='MUTEX_RELEASE';detail='释放临界区';
      }else if(pc===(policy==='mutex'?1:0)){n.locals[w]=s.value;n.pc[w]++;kind='COUNTER_READ';detail=`读取 value=${s.value}`;
      }else{n.value=s.locals[w]+1;n.pc[w]++;kind='COUNTER_WRITE';detail=`用先前读数写回：value=${n.value}`;}
      visit(n,[...log,event(log.length+1,kind,`W${w+1}`,detail)]);
    }
  };
  visit({pc:Array(workers).fill(0),locals:Array(workers).fill(0),value:0,owner:-1},[]);return results;
}
export function runCounter(policy:CounterPatch,runId='OS-03:preview'):ThreadRun {
  const runs=[2,3].map(workers=>({workers,outcomes:counterOutcomes(policy,workers)}));
  const sample=runs.flatMap(r=>r.outcomes.map(out=>({...out,workers:r.workers}))).find(r=>r.value!==r.workers)??{...runs[1].outcomes[0],workers:3};
  return report(runId,runs.map(r=>{
    const values=[...new Set(r.outcomes.map(o=>o.value))];return assertion(`${r.workers} 个工人的全部交错`,values.length===1&&values[0]===r.workers,
      `${r.outcomes.length} 种执行顺序；票数可能为 ${values.sort().join(' / ')}，期望 ${r.workers}`);
  }),sample.log,{interleavings:runs.reduce((n,r)=>n+r.outcomes.length,0),value:sample.value,expected:sample.workers},'每一票都被保留，两种人数回归通过。');
}

export const MEMORY_WORKLOADS = [
  {name:'两条热线路与流动客流',refs:['A','B','C','A','B','D','A','B','E','A','B','F','A','B','G','A','B'],maxFaults:7},
  {name:'换一组热门页面',refs:['E','A','B','E','A','C','E','A','D','E','A','F','E','A'],maxFaults:6},
  {name:'中途切换工作集',refs:['A','B','C','A','B','D','A','B','D','E','B','D','B','D','F','B','D'],maxFaults:6},
] as const;
export function simulateMemory(patch:MemoryPatch,refs:readonly string[]):{faults:number;log:EventLog[];valid:boolean} {
  const frames:string[]=[];let faults=0;let valid=true;const log:EventLog[]=[];
  refs.forEach((page,tick)=>{
    const hit=frames.includes(page);let evicted='—';
    if(hit&&patch.touchOnHit){frames.splice(frames.indexOf(page),1);frames.push(page);}
    if(!hit){faults++;if(frames.length===3)evicted=patch.evict==='oldest'?frames.shift()!:frames.pop()!;frames.push(page);}
    valid&&=frames.length<=3&&new Set(frames).size===frames.length;
    log.push(event(tick,hit?'PAGE_HIT':'PAGE_FAULT',page,`${page} ${hit?'命中':`缺页，换出 ${evicted}`}；帧 [${frames.join(' ')}]；累计缺页 ${faults}`));
  });return {faults,log,valid};
}
export function runMemory(patch:MemoryPatch,runId='OS-04:preview'):ThreadRun {
  const runs=MEMORY_WORKLOADS.map(w=>({...w,...simulateMemory(patch,w.refs)}));
  const sample=runs.find(r=>r.faults>r.maxFaults)??runs[2];
  return report(runId,runs.map(r=>assertion(r.name,r.valid&&r.faults<=r.maxFaults,
    `实测 ${r.faults} 次缺页 / 上限 ${r.maxFaults}，三个页框且无重复页面`)),sample.log,
    {faults:sample.faults,budget:sample.maxFaults,workloads:runs.length},'热门页面得以保留，三条走廊负载全部通过。');
}

export function simulateWake(policy:WakePatch,readyAt:number,wakes:readonly number[]):{consumedAt:number;log:EventLog[]} {
  let pc:'check'|'wait'|'consume'|'done'='check',consumedAt=-1;const log:EventLog[]=[];
  for(let tick=0;tick<120&&pc!=='done';tick++){
    const ready=tick>=readyAt;
    if(tick===readyAt)log.push(event(tick,'READY','PRODUCER','ready=true，货物确实抵达'));
    if(pc==='wait'&&wakes.includes(tick)){pc=policy==='while'?'check':'consume';log.push(event(tick,'WAKE','CONSUMER',ready?'收到就绪通知':'收到噪声唤醒，但 ready 仍为 false'));continue;}
    if(pc==='check'){log.push(event(tick,'CHECK','CONSUMER',`检查 ready=${ready}`));pc=ready?'consume':'wait';}
    else if(pc==='consume'){consumedAt=tick;pc='done';log.push(event(tick,'CONSUME','CONSUMER',ready?'货物已就绪，放行一次':'货物还没到，闸门却放行了'));}
  }
  if(consumedAt<0)log.push(event(120,'TIMEOUT','CONSUMER','没有完成放行'));return {consumedAt,log};
}
export function runWake(policy:WakePatch,runId='OS-S1:preview'):ThreadRun {
  const scenarios=[{ready:5,wakes:[2,6]},{ready:50,wakes:[2,9,18,51]},{ready:90,wakes:[2,15,36,91]},{ready:0,wakes:[]}];
  const runs=scenarios.map(s=>({...s,...simulateWake(policy,s.ready,s.wakes)})),sample=runs.find(r=>r.consumedAt<r.ready)??runs[1];
  return report(runId,runs.map((r,i)=>assertion(`唤醒场景 ${i+1}`,r.consumedAt>=r.ready&&r.consumedAt>=0,
    `货物 ${r.ready} 周期就绪，闸门 ${r.consumedAt<0?'未放行':r.consumedAt+' 周期放行'}`)),sample.log,{scenarios:runs.length,readyAt:sample.ready,consumedAt:sample.consumedAt},'每次醒来都先检查条件，噪声不再误开闸门。');
}

export function runLease(policy:LeasePatch,runId='OS-S2:preview'):ThreadRun {
  interface State { pc:number[]; owner:number; inside:boolean[] }
  const runs=[2,3].map(workers=>{
    const end=policy==='cas'?4:5;
    return {workers,...explore<State>({pc:Array(workers).fill(0),owner:-1,inside:Array(workers).fill(false)},s=>{
      const out:Transition<State>[]=[];
      for(let w=0;w<workers;w++){
        const pc=s.pc[w];if(pc===end||(pc===0&&s.owner!==-1))continue;
        const n:State={pc:[...s.pc],owner:s.owner,inside:[...s.inside]};let kind='';let detail='';
        if(pc===0){if(policy==='cas')n.owner=w;kind=policy==='cas'?'CAS_CLAIM':'LEASE_READ';detail=policy==='cas'?'比较并交换成功，取得唯一所有权':'看到空闲快照，尚未取得所有权';}
        else if(policy==='split'&&pc===1){n.owner=w;kind='LEASE_WRITE';detail='根据旧快照直接写入 owner';}
        else if(pc===(policy==='cas'?1:2)){n.inside[w]=true;kind='ENTER';detail='进入独占工作区';}
        else if(pc===(policy==='cas'?2:3)){n.inside[w]=false;kind='LEAVE';detail='离开独占工作区';}
        else{if(n.owner===w)n.owner=-1;kind='LEASE_RELEASE';detail='只释放属于自己的权限';}
        n.pc[w]++;out.push({state:n,kind,actor:`D${w+1}`,detail});
      }return out;
    },s=>s.pc.every(pc=>pc===end),s=>s.inside.filter(Boolean).length>1?'两个影子同时进入了独占工作区。':null)};
  });
  const sample=runs.find(r=>!r.passed)??runs[1];
  return report(runId,runs.map(r=>assertion(`${r.workers} 个副本的所有可达交错`,r.passed,r.passed?`${r.states} 个状态中始终至多一个占用者`:`${r.reason} “检查”与“设置”之间仍会插入另一副本`)),sample.log,
    {states:runs.reduce((n,r)=>n+r.states,0)},'唯一权限已恢复，所有副本都能轮流完成。');
}

export function evaluateThread<K extends ThreadCase>(id:K,patch:ThreadPatches[K],runId=`${id}:preview`):ThreadRun {
  // Parsing below is also used by the authority, so unchecked runtime input cannot fall through as a valid branch.
  const clean=parsePatch(id,patch);if(clean===null)return report(runId,[assertion('草案结构有效',false,'草案包含无效参数，未运行或提交。')],[],{},'');
  switch(id){
    case 'OS-01':return runLocks(clean as LockPatch,runId);
    case 'OS-02':return runScheduling(clean as SchedulePatch,runId);
    case 'OS-03':return runCounter(clean as CounterPatch,runId);
    case 'OS-04':return runMemory(clean as MemoryPatch,runId);
    case 'OS-S1':return runWake(clean as WakePatch,runId);
    case 'OS-S2':return runLease(clean as LeasePatch,runId);
  }throw new Error('未知关卡。');
}
function parsePatch<K extends ThreadCase>(id:K,raw:unknown):ThreadPatches[K]|null {
  if(id==='OS-03')return (['split','atomic','mutex'].includes(raw as string)?raw:null) as ThreadPatches[K]|null;
  if(id==='OS-S1')return (['if','while'].includes(raw as string)?raw:null) as ThreadPatches[K]|null;
  if(id==='OS-S2')return (['split','cas'].includes(raw as string)?raw:null) as ThreadPatches[K]|null;
  if(!raw||typeof raw!=='object')return null;
  if(id==='OS-01'){const p=raw as LockPatch;return (['A','B'].includes(p.p)&&['A','B'].includes(p.q)&&typeof p.restart==='boolean'?{p:p.p,q:p.q,restart:p.restart}:null) as ThreadPatches[K]|null;}
  if(id==='OS-02'){const p=raw as SchedulePatch;return (Number.isInteger(p.aging)&&p.aging>=0&&p.aging<=32&&typeof p.oldestFirst==='boolean'?{aging:p.aging,oldestFirst:p.oldestFirst}:null) as ThreadPatches[K]|null;}
  const p=raw as MemoryPatch;return (typeof p.touchOnHit==='boolean'&&['oldest','newest'].includes(p.evict)?{touchOnHit:p.touchOnHit,evict:p.evict}:null) as ThreadPatches[K]|null;
}
export function runThreadAudit(state:ThreadProgress,runId='CITY-03:audit'):ThreadRun {
  const runs=THREAD_MAIN.map(id=>({id,run:evaluateThread(id,state.patches[id],`${runId}/${id}`)}));
  const log:EventLog[]=[];let tick=0;
  for(const {id,run} of runs){for(const e of run.log.slice(0,12))log.push({...e,tick:tick++,detail:`${id} / ${e.detail}`});}
  return report(runId,runs.map(({id,run})=>assertion(`${id} 城际回归`,state.completed.includes(id)&&state.evidence.includes(id)&&run.passed,
    !state.completed.includes(id)?'该主线尚未提交修复':run.reason)),log,{systems:runs.length},'四个城市子系统共同通过，双线疏散许可已生成。');
}
export function threadUnlocked(state:ThreadProgress,id:ThreadCase):boolean {
  if(state.completed.includes(id))return true;
  if(id==='OS-S1')return state.completed.includes('OS-01');
  if(id==='OS-S2')return state.completed.includes('OS-02');
  return THREAD_MAIN[['locks','schedule','counter','memory'].indexOf(state.phase)]===id;
}
export class ThreadCampaign {
  constructor(public data:ThreadProgress){}
  meet():void {if(this.data.phase==='arrival')this.data.phase='locks';}
  observe(id:ThreadCase):boolean {if(!threadUnlocked(this.data,id))return false;if(!this.data.evidence.includes(id))this.data.evidence.push(id);return true;}
  preview<K extends ThreadCase>(id:K,patch:ThreadPatches[K],runId?:string):ThreadRun {
    if(!threadUnlocked(this.data,id)||!this.data.evidence.includes(id))throw new Error('先到已开放的设备旁扫描原始证据。');
    return evaluateThread(id,patch,runId);
  }
  submit<K extends ThreadCase>(id:K,patch:ThreadPatches[K],runId?:string):ThreadRun {
    const result=this.preview(id,patch,runId);if(!result.passed)return result;
    this.data.patches[id]=structuredClone(parsePatch(id,patch)!);
    const already=this.data.completed.includes(id);if(!already)this.data.completed.push(id);
    if(!already&&THREAD_MAIN.includes(id as typeof THREAD_MAIN[number]))this.data.phase=THREAD_PHASES[THREAD_PHASES.indexOf(this.data.phase)+1];
    return result;
  }
  audit(runId?:string):ThreadRun {
    if(this.data.phase!=='audit')throw new Error('先完成四关主线，再进行城市综合回归。');
    const result=runThreadAudit(this.data,runId);if(result.passed){this.data.audited=true;this.data.phase='evacuate';}return result;
  }
  finish():boolean {
    if(this.data.phase==='complete')return this.data.audited&&runThreadAudit(this.data).passed;
    if(this.data.phase!=='evacuate'||!this.data.audited||!runThreadAudit(this.data).passed)return false;
    this.data.phase='complete';return true;
  }
}
export function parseThread(raw:unknown):ThreadProgress|null {
  if(raw===undefined)return freshThread();
  if(!raw||typeof raw!=='object')return null;
  const p=raw as ThreadProgress;
  if(!THREAD_PHASES.includes(p.phase)||typeof p.audited!=='boolean'||!p.patches||typeof p.patches!=='object')return null;
  for(const list of [p.completed,p.evidence])if(!Array.isArray(list)||new Set(list).size!==list.length||list.some(id=>!cases.includes(id)))return null;
  const patches=freshThread().patches;
  for(const id of cases){const patch=parsePatch(id,p.patches[id]);if(patch===null)return null;Object.assign(patches,{[id]:patch});}
  const stage=THREAD_PHASES.indexOf(p.phase),required=Math.min(4,Math.max(0,stage-1));
  if(p.audited!==(stage>=6)||THREAD_MAIN.some((id,i)=>p.completed.includes(id)!==(i<required)))return null;
  if(p.evidence.some(id=>!p.completed.includes(id)&&!threadUnlocked({...p,patches},id)))return null;
  for(const id of p.completed){
    if(!p.evidence.includes(id)||!evaluateThread(id,patches[id]).passed)return null;
    if(id==='OS-S1'&&!p.completed.includes('OS-01'))return null;
    if(id==='OS-S2'&&!p.completed.includes('OS-02'))return null;
  }
  return {phase:p.phase,audited:p.audited,patches,completed:[...p.completed],evidence:[...p.evidence]};
}
