import { describe, expect, it } from 'vitest';
import { add8, freshForge, parseForge, runCarry, runPower, stepPower, type PowerState, type Weather } from '../src/game/forge-domain';
import { Campaign, freshProgress, parseProgress, relink } from '../src/game/domain';
import { forgeSurfaces, FORGE_START } from '../src/game/pulse-world';
import { floorAt, Motor } from '../src/game/physics';

function simulate(state:PowerState,weather:Weather,seconds:number,hz=60):PowerState {
  let p={...state};for(let i=0;i<seconds*hz;i++)p=stepPower(p,weather,1/hz);return p;
}
function dockComplete(){const c=new Campaign();c.meet();c.observe('Q-01');c.submitOrder(['EXIT','DELETE','ARCHIVE']);c.observe('DS-01');c.submitRail(relink(c.data.rail,'A','B'));c.finish();return c.data;}
describe('weather circuit: energy, cooling and isolation are causal',()=>{
  it('cannot start an empty capacitor or pass by changing weather alone',()=>{
    const initial=freshForge().power;
    expect(runPower(initial).passed).toBe(false);
    expect(runPower(simulate(initial,'rain',20)).passed).toBe(false);
    expect(runPower(simulate(initial,'clear',20)).passed).toBe(false);
  });
  it('unisolated rain consumes stored energy while cooling the core',()=>{
    const charged=simulate(freshForge().power,'clear',7);
    const rain=simulate(charged,'rain',5);
    expect(charged.charge).toBeCloseTo(84);expect(charged.temperature).toBeCloseTo(52);
    expect(rain.charge).toBeCloseTo(44);expect(rain.temperature).toBe(20);
    expect(runPower(rain).passed).toBe(false);
  });
  it('sun -> isolate -> rain passes, with measured retention in the proof',()=>{
    const charged=simulate(freshForge().power,'clear',7);
    const cooled=simulate({...charged,isolated:true},'rain',3);
    const report=runPower(cooled,'weather-17');
    expect(report.passed).toBe(true);expect(report.runId).toBe('weather-17');expect(cooled.charge).toBeCloseTo(84);expect(cooled.temperature).toBeCloseTo(22);
    expect(report.assertions.every(a=>a.passed)).toBe(true);
    expect(report.log.at(-1)?.detail).toContain('84.0%');
  });
  it('closed isolation prevents sunny charging and makes mistakes reversible',()=>{
    const closed=simulate({...freshForge().power,isolated:true},'clear',10);
    expect(closed.charge).toBe(0);
    const reopened=simulate({...closed,isolated:false},'clear',7);
    expect(reopened.charge).toBeCloseTo(84);
  });
  it('remains bounded and stable after a proven supply has latched',()=>{
    const p={charge:85,temperature:30,isolated:true,energized:true};
    expect(simulate(p,'rain',60)).toEqual(p);expect(simulate(p,'clear',60)).toEqual(p);
    expect(simulate(freshForge().power,'clear',60).charge).toBe(100);
    expect(simulate(freshForge().power,'rain',60).temperature).toBe(20);
  });
  it('the same timeline produces equivalent results at 30, 60 and 120 Hz',()=>{
    const states=[30,60,120].map(hz=>{
      const charged=simulate(freshForge().power,'clear',7,hz);
      return simulate({...charged,isolated:true},'rain',2,hz);
    });
    for(const p of states){expect(p.charge).toBeCloseTo(84,6);expect(p.temperature).toBeCloseTo(32,6);expect(runPower(p).passed).toBe(true);}
  });
});
describe('ALU: carry and zero remain independent',()=>{
  it.each([[255,1,0,true,true],[0,0,0,false,true],[254,1,255,false,false],[127,1,128,false,false],[128,128,0,true,true],[255,255,254,true,false]])('%i + %i has the correct bits and flags',(a,b,value,carry,zero)=>{
    expect(add8(a as number,b as number)).toEqual({value,carry,zero});
  });
  it('zero wiring fails on both false positives and missed carry pulses',()=>{
    const r=runCarry('ZERO');expect(r.passed).toBe(false);expect(r.reason).toContain('0+0');
    expect(r.assertions.find(a=>a.name==='255 + 255')?.passed).toBe(false);
    expect(r.assertions.find(a=>a.name==='65,536 组输入完整回归')?.passed).toBe(false);
  });
  it('permanent power cannot masquerade as a correct branch',()=>{expect(runCarry('POWER').passed).toBe(false);});
  it('carry wiring satisfies all 65,536 input pairs, not just 255+1',()=>{
    const r=runCarry('CARRY','carry-19');expect(r.passed).toBe(true);expect(r.runId).toBe('carry-19');
    expect(r.log.find(e=>e.detail.startsWith('0+0'))?.kind).toBe('HOLD');
    expect(r.log.find(e=>e.detail.startsWith('255+255'))?.kind).toBe('LIFT_PULSE');
    expect(r.assertions.at(-1)?.passed).toBe(true);
  });
});
describe('two-city saves and physical route',()=>{
  it('migrates previous V6 saves with no forge fields',()=>{
    const p=dockComplete() as unknown as Record<string,unknown>;delete p.city;delete p.weather;delete p.forge;
    const migrated=parseProgress(p)!;expect(migrated.city).toBe('dock');expect(migrated.weather).toBe('rain');expect(migrated.chapter).toBe('complete');expect(migrated.forge).toEqual(freshForge());
  });
  it('rejects entering city two with an unproven dock and forged power proof',()=>{
    expect(parseProgress({...freshProgress(),city:'forge'})).toBeNull();
    expect(parseForge({...freshForge(),phase:'carry'})).toBeNull();
    expect(parseForge({...freshForge(),phase:'carry',power:{charge:100,temperature:30,isolated:false,energized:true},evidence:['WF-01']})).toBeNull();
  });
  it('round trips both cities with independently validated evidence',()=>{
    const p=dockComplete();p.city='forge';p.weather='clear';p.forge={phase:'complete',power:{charge:84,temperature:30,isolated:true,energized:true},flag:'CARRY',evidence:['WF-01','CO-01']};
    expect(parseProgress(JSON.parse(JSON.stringify(p)))).toEqual(p);
    p.city='dock';expect(parseProgress(p)?.forge.phase).toBe('complete');
    p.forge.flag='ZERO';expect(parseProgress(p)).toBeNull();
  });
  it('rejects invalid device values and unknown evidence',()=>{
    for(const power of [{...freshForge().power,charge:Infinity},{...freshForge().power,temperature:-1},{...freshForge().power,isolated:'yes'}])expect(parseForge({...freshForge(),power})).toBeNull();
    expect(parseForge({...freshForge(),evidence:['made-up']})).toBeNull();
  });
  it('the unpowered bridge is a real gap in collision geometry',()=>{
    const surfaces=forgeSurfaces();expect(floorAt(surfaces,0,-10)).toBeNull();surfaces[1].enabled=true;expect(floorAt(surfaces,0,-10)).toBe(4);
  });
  it('walks from arrival through both ramps to the tower with no teleport or fall',()=>{
    const surfaces=forgeSurfaces();surfaces[1].enabled=true;
    const motor=new Motor(surfaces);motor.warp(FORGE_START);motor.setCheckpoint(FORGE_START);
    for(let i=0;i<1600&&motor.position.z>-84;i++)motor.step(1/60,{x:0,z:-1,jump:false,sprint:false});
    expect(motor.position.z).toBeLessThan(-84);expect(motor.position.y).toBeCloseTo(26);expect(motor.falls).toBe(0);
  });
});
