import { describe, expect, it } from 'vitest';
import { freshThread, ThreadCampaign, runLocks, runScheduling, runCounter, runMemory, runWake, runLease, parseThread, runThreadAudit, counterOutcomes, simulateMemory, MEMORY_WORKLOADS, type ThreadCase, type ThreadPatches } from '../src/game/thread-domain';
import { Campaign, parseProgress, relink } from '../src/game/domain';
import { freshForge } from '../src/game/forge-domain';
import { THREAD_BOUNDS, THREAD_START, threadSurfaces } from '../src/game/thread-layout';
import { floorAt, Motor } from '../src/game/physics';

const solved:ThreadPatches={'OS-01':{p:'A',q:'A',restart:true},'OS-02':{aging:8,oldestFirst:true},'OS-03':'atomic','OS-04':{touchOnHit:true,evict:'oldest'},'OS-S1':'while','OS-S2':'cas'};
function completeMain(){const c=new ThreadCampaign(freshThread());c.meet();for(const id of ['OS-01','OS-02','OS-03','OS-04'] as const){c.observe(id);expect(c.submit(id,solved[id]).passed).toBe(true);}return c;}
describe('threadfall bounded process models',()=>{
  it('changing policy cannot release the already-held deadlock',()=>{const r=runLocks({p:'A',q:'A',restart:false});expect(r.passed).toBe(false);expect(r.reason).toContain('释放');});
  it('opposite lock orders remain deadlocked after a controlled restart',()=>{
    const r=runLocks({p:'A',q:'B',restart:true});expect(r.passed).toBe(false);expect(r.reason).toContain('等待环');expect(r.log.some(e=>e.actor==='P')).toBe(true);expect(r.log.some(e=>e.actor==='Q')).toBe(true);
  });
  it.each(['A','B'] as const)('a common %s-first order permits all reachable interleavings',lock=>{
    const r=runLocks({p:lock,q:lock,restart:true});expect(r.passed).toBe(true);expect(r.metrics.states).toBeGreaterThan(10);expect(r.log.filter(e=>e.kind==='CROSS')).toHaveLength(2);expect(r.log.filter(e=>e.kind==='RELEASE')).toHaveLength(4);
  });
  it('strict priority starves resident trams under a continuous stream',()=>{const r=runScheduling({aging:0,oldestFirst:true});expect(r.passed).toBe(false);expect(r.metrics.completed).toBe(0);expect(r.metrics.highService).toBe(200);});
  it('aging serves both resident trams without canceling background work',()=>{const r=runScheduling(solved['OS-02']);expect(r.passed).toBe(true);expect(r.metrics.highService).toBe(195);expect(r.metrics.completed).toBe(2);expect(r.assertions).toHaveLength(3);});
  it('an aging interval that is too slow fails the high-load regression',()=>{expect(runScheduling({aging:32,oldestFirst:true}).passed).toBe(false);});
  it('split read/write enumerates 90 three-worker interleavings with lost updates',()=>{
    const outcomes=counterOutcomes('split',3);expect(outcomes).toHaveLength(90);expect([...new Set(outcomes.map(r=>r.value))].sort()).toEqual([1,2,3]);expect(runCounter('split').passed).toBe(false);
  });
  it.each(['atomic','mutex'] as const)('%s preserves all votes under all tested interleavings',method=>{
    const r=runCounter(method);expect(r.passed).toBe(true);expect(r.metrics.value).toBe(3);expect(r.metrics.interleavings).toBe(8);
  });
  it('FIFO visibly thrashes on the authored hot-page workloads',()=>{
    const r=runMemory({touchOnHit:false,evict:'oldest'});expect(r.passed).toBe(false);expect(r.metrics.faults).toBeGreaterThan(r.metrics.budget);expect(r.log.some(e=>e.kind==='PAGE_HIT')).toBe(true);
  });
  it('LRU meets the independently authored budgets, including a working-set shift',()=>{
    const r=runMemory(solved['OS-04']);expect(r.passed).toBe(true);
    expect(MEMORY_WORKLOADS.map(w=>simulateMemory(solved['OS-04'],w.refs).faults)).toEqual([7,6,6]);
  });
  it('retaining old queue order and evicting the newest is not a universal shortcut',()=>{expect(runMemory({touchOnHit:false,evict:'newest'}).passed).toBe(false);});
  it('a one-time if opens on a spurious wakeup, while rechecking waits for readiness',()=>{
    const wrong=runWake('if'),right=runWake('while');expect(wrong.passed).toBe(false);expect(wrong.metrics.consumedAt).toBeLessThan(wrong.metrics.readyAt);expect(right.passed).toBe(true);expect(right.assertions).toHaveLength(4);
  });
  it('split check/set lets two shadows occupy the resource; CAS serializes them',()=>{
    const wrong=runLease('split'),right=runLease('cas');expect(wrong.passed).toBe(false);expect(wrong.reason).toContain('同时');expect(right.passed).toBe(true);expect(right.log.filter(e=>e.kind==='ENTER')).toHaveLength(3);
  });
});
describe('threadfall transaction, optional quests and save proof gates',()=>{
  it('requires both stage access and scanned evidence before submission',()=>{
    const c=new ThreadCampaign(freshThread());expect(()=>c.submit('OS-01',solved['OS-01'])).toThrow();c.meet();expect(()=>c.submit('OS-01',solved['OS-01'])).toThrow();expect(c.observe('OS-04')).toBe(false);
  });
  it('failed experiments and previews leave authoritative progress unchanged',()=>{
    const c=new ThreadCampaign(freshThread());c.meet();c.observe('OS-01');const original=structuredClone(c.data);
    expect(c.preview('OS-01',solved['OS-01']).passed).toBe(true);expect(c.data).toEqual(original);
    c.submit('OS-01',{p:'A',q:'B',restart:true});expect(c.data).toEqual(original);
  });
  it('a successful submission clones the patch and unlocks only the next main stage',()=>{
    const c=new ThreadCampaign(freshThread());c.meet();c.observe('OS-01');const patch={...solved['OS-01']};c.submit('OS-01',patch);patch.p='B';
    expect(c.data.patches['OS-01'].p).toBe('A');expect(c.data.phase).toBe('schedule');expect(parseThread(c.data)).toEqual(c.data);
  });
  it('the city audit and real evacuation are separate required transitions',()=>{
    const c=completeMain();expect(c.data.phase).toBe('audit');expect(c.finish()).toBe(false);expect(c.audit('city-run').passed).toBe(true);expect(c.data.phase).toBe('evacuate');expect(c.finish()).toBe(true);expect(parseThread(c.data)?.phase).toBe('complete');
  });
  it('optional quests remain playable after the main ending without resetting it',()=>{
    const c=completeMain();c.audit();c.finish();for(const id of ['OS-S1','OS-S2'] as const){expect(c.observe(id)).toBe(true);expect(c.submit(id,solved[id]).passed).toBe(true);}expect(c.data.phase).toBe('complete');expect(c.data.completed).toHaveLength(6);expect(parseThread(c.data)).toEqual(c.data);
  });
  it('replaying the evacuation is idempotent and rechecks the committed policies',()=>{
    const c=completeMain();c.audit();c.finish();const before=structuredClone(c.data);expect(c.finish()).toBe(true);expect(c.data).toEqual(before);
    c.data.patches['OS-01'].restart=false;expect(c.finish()).toBe(false);
  });
  it('rejects forged completion, unproven patches and missing evidence',()=>{
    expect(parseThread({...freshThread(),phase:'complete',audited:true})).toBeNull();const c=completeMain();
    const bad=structuredClone(c.data);bad.patches['OS-03']='split';expect(parseThread(bad)).toBeNull();bad.patches['OS-03']='atomic';bad.evidence=[];expect(parseThread(bad)).toBeNull();
  });
  it('rejects invalid controls instead of coercing them into a successful policy',()=>{
    for(const aging of [-1,33,1.5,NaN,Infinity]){const p=freshThread();p.patches['OS-02'].aging=aging;expect(parseThread(p)).toBeNull();}
    const p=freshThread();p.patches['OS-01'].restart='yes' as unknown as boolean;expect(parseThread(p)).toBeNull();
    const d=freshThread();d.evidence=['OS-99' as ThreadCase];expect(parseThread(d)).toBeNull();
  });
  it('audit re-executes current policies rather than trusting completion labels',()=>{
    const c=completeMain();c.data.patches['OS-04'].touchOnHit=false;expect(runThreadAudit(c.data).passed).toBe(false);
  });
  it('migrates V6.1 saves and requires the second city before the third',()=>{
    const c=new Campaign();c.meet();c.observe('Q-01');c.submitOrder(['EXIT','DELETE','ARCHIVE']);c.observe('DS-01');c.submitRail(relink(c.data.rail,'A','B'));c.finish();
    const old=structuredClone(c.data) as unknown as Record<string,unknown>;delete old.thread;expect(parseProgress(old)?.thread).toEqual(freshThread());
    c.data.city='thread';expect(parseProgress(c.data)).toBeNull();
    c.data.forge={phase:'complete',power:{charge:84,temperature:30,isolated:true,energized:true},flag:'CARRY',evidence:['WF-01','CO-01']};
    c.data.thread=completeMain().data;expect(parseProgress(c.data)?.city).toBe('thread');
  });
  it('replaying the second city retains a validated clearance and third-city progress',()=>{
    const c=new Campaign();c.meet();c.observe('Q-01');c.submitOrder(['EXIT','DELETE','ARCHIVE']);c.observe('DS-01');c.submitRail(relink(c.data.rail,'A','B'));c.finish();
    c.data.forge={phase:'complete',power:{charge:84,temperature:30,isolated:true,energized:true},flag:'CARRY',evidence:['WF-01','CO-01']};
    c.data.forgeClearance=structuredClone(c.data.forge);const t=completeMain();t.audit();t.finish();c.data.thread=t.data;
    c.data.forge=freshForge();c.data.city='forge';expect(parseProgress(c.data)?.thread.phase).toBe('complete');
    c.data.forgeClearance=null;expect(parseProgress(c.data)).toBeNull();
  });
  it('a clearance cannot bypass unproven first-city progress',()=>{
    const c=new Campaign();c.data.forgeClearance={phase:'complete',power:{charge:84,temperature:30,isolated:true,energized:true},flag:'CARRY',evidence:['WF-01','CO-01']};expect(parseProgress(c.data)).toBeNull();
  });
  it('rejects duplicate evidence and invalid unbounded worker counts',()=>{
    const t=freshThread();t.phase='locks';t.evidence=['OS-01','OS-01'];expect(parseThread(t)).toBeNull();
    for(const n of [0,4,2.5,Infinity])expect(()=>counterOutcomes('atomic',n)).toThrow(RangeError);
  });
});
describe('third-city authored routes and per-city bounds',()=>{
  it('every locked main crossing is a real collision gap',()=>{
    const surfaces=threadSurfaces();for(const z of [-3,-60,-119,-176])expect(floorAt(surfaces,0,z)).toBeNull();
  });
  it('walks the entire 230m route through three ramps without a fall',()=>{
    const surfaces=threadSurfaces();surfaces.filter(s=>s.id.startsWith('thread-gate-')).forEach(s=>s.enabled=true);
    const motor=new Motor(surfaces,[],{...THREAD_BOUNDS});motor.warp(THREAD_START);motor.setCheckpoint(THREAD_START);
    for(let i=0;i<3200&&motor.position.z>-190;i++)motor.step(1/60,{x:0,z:-1,jump:false,sprint:false});
    expect(motor.position.z).toBeLessThan(-190);expect(motor.position.y).toBeCloseTo(39);expect(motor.falls).toBe(0);
  });
  it.each([[-28,15,-44],[28,27,-104]])('can walk to optional platform x=%i y=%i z=%i',(x,y,z)=>{
    const motor=new Motor(threadSurfaces(),[],{...THREAD_BOUNDS});motor.warp({x:0,y,z});motor.setCheckpoint({x:0,y,z});
    for(let i=0;i<400&&Math.abs(motor.position.x-x)>.2;i++)motor.step(1/60,{x:Math.sign(x-motor.position.x),z:0,jump:false,sprint:false});
    expect(motor.position.x).toBeCloseTo(x,0);expect(motor.position.y).toBe(y);expect(motor.falls).toBe(0);
  });
  it('extending the third-city boundary does not expand the old city by accident',()=>{
    const surfaces=threadSurfaces();surfaces.filter(s=>s.id.startsWith('thread-gate-')).forEach(s=>s.enabled=true);
    const legacy=new Motor(surfaces);legacy.warp({x:0,y:39,z:-180});for(let i=0;i<20;i++)legacy.step(1/60,{x:0,z:0,jump:false,sprint:false});expect(legacy.falls).toBe(1);
    const third=new Motor(surfaces,[],{...THREAD_BOUNDS});third.warp({x:0,y:39,z:-180});for(let i=0;i<20;i++)third.step(1/60,{x:0,z:0,jump:false,sprint:false});expect(third.falls).toBe(0);
  });
});
