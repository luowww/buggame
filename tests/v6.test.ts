import { describe, expect, it } from 'vitest';
import { Campaign, INITIAL_ORDER, INITIAL_RAIL, freshProgress, parseProgress, relink, runOrder, runRail, traverse, type EventAction, type RailState } from '../src/game/domain';
import { Motor, START, floorAt, makeSurfaces } from '../src/game/physics';

describe('V6 pointer transit: independent domain authority',()=>{
  it('the initial real traversal skips B and cannot pass',()=>{
    const result=runRail(INITIAL_RAIL);expect(result.route).toEqual(['A','C','END']);expect(result.passed).toBe(false);expect(result.reason).toContain('B');
  });
  it('relinking is immutable and repairs both mainline and service route',()=>{
    const patched=relink(INITIAL_RAIL,'A','B');expect(INITIAL_RAIL.next.A).toBe('C');
    const result=runRail(patched,'run-17');expect(result.passed).toBe(true);expect(result.route).toEqual(['A','B','C','END']);
    expect(result.runId).toBe('run-17');expect(result.log.map(e=>e.actor)).toEqual(result.route);expect(result.assertions).toHaveLength(3);
  });
  it('cycles produce bounded, concrete counterexamples',()=>{
    const loop=runRail(relink(INITIAL_RAIL,'A','A'));expect(loop.passed).toBe(false);expect(loop.reason).toContain('循环发生在 A');expect(loop.log).toHaveLength(1);
    const multi=relink(relink(INITIAL_RAIL,'A','B'),'B','A');expect(traverse(multi).error).toContain('循环');
  });
  it('schema rejects dangling pointers, prototype names, and sentinel mutation',()=>{
    for(const node of ['D','toString','__proto__'])expect(()=>relink(INITIAL_RAIL,'A',node)).toThrow('悬挂指针');
    expect(()=>relink(INITIAL_RAIL,'END','A')).toThrow('终点');
  });
  it('an early terminal is not a successful route',()=>{
    const result=runRail(relink(INITIAL_RAIL,'A','END'));expect(result.passed).toBe(false);expect(result.reason).toContain('B、C');
  });
  it('accepts another acyclic, fully reachable route rather than hardcoding one answer',()=>{
    const alternate=relink(relink(INITIAL_RAIL,'C','B'),'B','END');const result=runRail(alternate);
    expect(result.route).toEqual(['A','C','B','END']);expect(result.passed).toBe(true);
  });
});
describe('V6 event ordering uses two passenger inputs',()=>{
  it('initial deletion kills the passenger',()=>{
    const r=runOrder(INITIAL_ORDER);expect(r.passed).toBe(false);expect(r.reason).toContain('删除');expect(r.assertions.every(a=>!a.passed)).toBe(true);
  });
  it.each<EventAction[]>([['EXIT','DELETE','ARCHIVE'],['EXIT','ARCHIVE','DELETE']])('accepts both valid causal orders: %s %s %s',(...order)=>{
    const r=runOrder(order);expect(r.passed).toBe(true);expect(r.assertions).toHaveLength(2);expect(r.log.map(e=>e.kind)).toEqual(order);
  });
  it('archiving too early is a distinct failure even with evacuation',()=>{
    expect(runOrder(['ARCHIVE','EXIT','DELETE']).reason).toContain('归档');
  });
  it('rejects missing or duplicated events',()=>{expect(runOrder(['EXIT','EXIT','DELETE']).passed).toBe(false);});
});
describe('V6 transactional campaign and untrusted storage',()=>{
  it('cannot submit before collecting the corresponding evidence',()=>{
    const c=new Campaign();expect(()=>c.submitOrder(['EXIT','DELETE','ARCHIVE'])).toThrow('扫描');c.meet();expect(()=>c.submitOrder(['EXIT','DELETE','ARCHIVE'])).toThrow('扫描');
  });
  it('failed drafts preserve authority and evidence; a full successful run commits',()=>{
    const c=new Campaign();c.meet();c.observe('Q-01');expect(c.submitOrder(INITIAL_ORDER).passed).toBe(false);
    expect(c.data.chapter).toBe('reorder');expect(c.data.evidence).toContain('Q-01');
    c.submitOrder(['EXIT','DELETE','ARCHIVE']);expect(c.data.chapter).toBe('rail');c.observe('DS-01');
    c.submitRail(relink(c.data.rail,'A','A'));expect(c.data.rail.next.A).toBe('C');expect(c.data.chapter).toBe('rail');
    c.submitRail(relink(c.data.rail,'A','B'));expect(c.data.chapter).toBe('board');expect(c.finish()).toBe(true);expect(c.data.chapter).toBe('complete');
    expect(c.data.counterexamples).toBe(2);expect(c.data.attempts).toBe(4);expect(parseProgress(c.data)).toEqual(c.data);
  });
  it('forged success, corrupt schemas and invalid numbers do not load',()=>{
    expect(parseProgress({...freshProgress(),chapter:'complete'})).toBeNull();
    expect(parseProgress({...freshProgress(),attempts:NaN})).toBeNull();expect(parseProgress({...freshProgress(),elapsed:-1})).toBeNull();
    expect(parseProgress({...freshProgress(),evidence:['evil']})).toBeNull();expect(parseProgress({...freshProgress(),rail:{head:'A',next:{A:'D'}}})).toBeNull();
  });
  it('reset has no previously committed route or evidence',()=>{
    const c=new Campaign();c.meet();c.observe('Q-01');c.submitOrder(['EXIT','DELETE','ARCHIVE']);
    const clean=new Campaign();expect(clean.data).toEqual(freshProgress());expect(clean.finish()).toBe(false);
  });
  it('a changed downstream link is truly tested',()=>{
    const c=new Campaign();c.meet();c.observe('Q-01');c.submitOrder(['EXIT','DELETE','ARCHIVE']);c.observe('DS-01');
    const malformed={head:'A',next:{A:'B',B:'C',C:'END',END:'A'}} as RailState;expect(()=>c.submitRail(malformed)).toThrow('终点');
  });
});
describe('V6 authored collision and fixed-step motion',()=>{
  const neutral={x:0,z:0,jump:false,sprint:false};
  it('standing still never sinks into the ground',()=>{
    const motor=new Motor(makeSurfaces());for(let i=0;i<600;i++)motor.step(1/60,neutral);expect(motor.position.y).toBe(3);expect(motor.grounded).toBe(true);
  });
  it('the unrepaired gap is actually unsupported; repair activates the exact same deck',()=>{
    const surfaces=makeSurfaces();expect(floorAt(surfaces,0,-5)).toBeNull();surfaces.find(s=>s.id==='reorder-bridge')!.enabled=true;expect(floorAt(surfaces,0,-5)).toBe(3);
  });
  it('the complete ground-to-station route is walkable without jumping or teleporting',()=>{
    const surfaces=makeSurfaces();surfaces.find(s=>s.id==='reorder-bridge')!.enabled=true;
    const motor=new Motor(surfaces);for(let i=0;i<890;i++)motor.step(1/60,{...neutral,z:-1});
    expect(motor.position.z).toBeLessThan(-46);expect(motor.position.y).toBeCloseTo(13,4);expect(motor.falls).toBe(0);
  });
  it('jumping leaves and safely returns to the original deck',()=>{
    const motor=new Motor(makeSurfaces());motor.step(1/60,{...neutral,jump:true});expect(motor.position.y).toBeGreaterThan(3);
    for(let i=0;i<90;i++)motor.step(1/60,neutral);expect(motor.position.y).toBe(3);expect(motor.grounded).toBe(true);
  });
  it('the optional three-tier lookout route is continuously walkable',()=>{
    const motor=new Motor(makeSurfaces());
    for(let i=0;i<160&&motor.position.z<44;i++)motor.step(1/60,{...neutral,z:1});
    for(let i=0;i<240&&motor.position.x>-18;i++)motor.step(1/60,{...neutral,x:-1});
    for(let i=0;i<740&&motor.position.z>-18;i++)motor.step(1/60,{...neutral,z:-1});
    expect(motor.position.y).toBeCloseTo(23,4);expect(motor.position.z).toBeLessThan(-17);expect(motor.falls).toBe(0);
  });
  it('falling restores the safe checkpoint without changing game authority',()=>{
    const motor=new Motor(makeSurfaces());motor.warp({x:100,y:-8,z:0});for(let i=0;i<25;i++)motor.step(1/60,neutral);
    expect(motor.position).toEqual(START);expect(motor.falls).toBe(1);
  });
  it('obstacles block the body while leaving sideways motion available',()=>{
    const motor=new Motor(makeSurfaces(),[{x:0,z:27,w:4,d:1,bottom:3,top:6}]);
    for(let i=0;i<120;i++)motor.step(1/60,{...neutral,z:-1});expect(motor.position.z).toBeGreaterThan(27.8);
    for(let i=0;i<50;i++)motor.step(1/60,{...neutral,x:1});expect(motor.position.x).toBeGreaterThan(3);
  });
});
