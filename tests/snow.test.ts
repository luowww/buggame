import { describe, expect, it } from 'vitest';
import { freshSnow, SnowCampaign, SNOW_MAIN, SNOW_CASES, SNOW_WEATHERS, runWind, runRouting, runReliable, runCongestion, runClock, runDiscovery, runChecksum, runHeartbeat, simulateRoute, simulateReliable, simulateCongestion, logicalTimes, crc8, evaluateSnow, parseSnow, parseSnowPatch, runSnowAudit, type SnowPatches, type SnowCase } from '../src/game/snow-domain';
import { SNOW_START, SNOW_POS, SNOW_POSTS, SNOW_BOUNDS, SNOW_AUDIT, snowSurfaces, snowForces, inSnowShelter } from '../src/game/snow-layout';
import { Motor, floorAt, STILL_AIR } from '../src/game/physics';
import { Campaign, parseProgress, relink } from '../src/game/domain';
import { freshThread, ThreadCampaign, type ThreadPatches } from '../src/game/thread-domain';

const solved:SnowPatches={
  'WF-02':{alignment:'vane',shutter:'gust',cutoff:9,heater:'thermostat'},
  'NET-01':{A:'B',B:'D',C:'E',E:'D',ttl:4,fallback:true},
  'NET-02':{retry:true,key:'session',ackDuplicates:true},
  'NET-03':{window:12,adaptive:true,backoff:true},
  'NET-04':{clock:'lamport',tie:'node',barrier:true},
  'NET-S1':{refresh:true,respectTTL:true,probe:true},
  'NET-S2':{algorithm:'crc8',retryCorrupt:true},
  'NET-S3':{misses:3,recovery:2,fencing:true},
};
function completeMain(){const c=new SnowCampaign(freshSnow());c.meet();for(const id of SNOW_MAIN){c.observe(id);expect(c.submit(id,solved[id]).passed).toBe(true);}return c;}
function completeThreeCities(){
  const c=new Campaign();c.meet();c.observe('Q-01');c.submitOrder(['EXIT','DELETE','ARCHIVE']);c.observe('DS-01');c.submitRail(relink(c.data.rail,'A','B'));c.finish();
  c.data.forge={phase:'complete',power:{charge:84,temperature:30,isolated:true,energized:true},flag:'CARRY',evidence:['WF-01','CO-01']};c.data.forgeClearance=structuredClone(c.data.forge);
  const t=new ThreadCampaign(freshThread()),patches:ThreadPatches={'OS-01':{p:'A',q:'A',restart:true},'OS-02':{aging:8,oldestFirst:true},'OS-03':'atomic','OS-04':{touchOnHit:true,evict:'oldest'},'OS-S1':'while','OS-S2':'cas'};
  t.meet();for(const id of ['OS-01','OS-02','OS-03','OS-04'] as const){t.observe(id);t.submit(id,patches[id]);}t.audit();t.finish();c.data.thread=t.data;return c;
}
describe('snowfield environmental and networking models',()=>{
  it.each(SNOW_CASES)('%s original failure and computed repair',id=>{expect(evaluateSnow(id,freshSnow().patches[id]).passed).toBe(false);expect(evaluateSnow(id,solved[id]).passed).toBe(true);});
  it('wind control protects mast and maintains all-weather reception',()=>{const r=runWind(solved['WF-02']);expect(r.metrics.packets).toBeGreaterThanOrEqual(20);expect(r.metrics.peakStress).toBe(0);expect(r.traces).toHaveLength(3);});
  it.each([{alignment:'fixed'},{shutter:'open'},{heater:'off'},{heater:'always'},{cutoff:7}] as const)('partial wind fix fails: %j',change=>{expect(runWind({...solved['WF-02'],...change}).passed).toBe(false);});
  it('heater brownouts are rejected without allowing negative stored energy',()=>{const r=runWind({...solved['WF-02'],heater:'always'});expect(r.passed).toBe(false);expect(r.metrics.brownouts).toBeGreaterThan(0);expect(r.assertions.some(a=>a.detail.includes('最低储能 -'))).toBe(false);});
  it('TTL bounds the real A-B-C-A loop without claiming delivery',()=>{const r=simulateRoute({...freshSnow().patches['NET-01'],ttl:10},'calm');expect(r.arrived).toBe(false);expect(r.log).toHaveLength(11);expect(r.log.at(-1)?.kind).toBe('TTL_EXPIRED');});
  it('three hops work in calm weather but expire before the storm detour',()=>{const p={...solved['NET-01'],ttl:3};expect(simulateRoute(p,'calm').arrived).toBe(true);expect(simulateRoute(p,'whiteout').arrived).toBe(false);});
  it('TTL one cannot be forwarded by an intermediate router; the destination does not decrement it',()=>{const r=simulateRoute(solved['NET-01'],'whiteout');expect(r.arrived).toBe(true);expect(r.ttl).toBe(1);expect(r.route).toEqual(['A','B','C','E','D']);const short=simulateRoute({...solved['NET-01'],ttl:1},'calm');expect(short.arrived).toBe(false);expect(short.log.at(-1)?.kind).toBe('TTL_EXPIRED');});
  it('choosing C first is a valid alternative when healthy fallback is enabled',()=>{expect(runRouting({...solved['NET-01'],A:'C'}).passed).toBe(true);expect(runRouting({...solved['NET-01'],fallback:false}).passed).toBe(false);});
  it.each(['none','payload','sequence'] as const)('dedup by %s cannot preserve all four logical letters',key=>{expect(runReliable({...solved['NET-02'],key}).passed).toBe(false);});
  it('retries are required for missing data, and duplicates still need ACKs',()=>{expect(runReliable({...solved['NET-02'],retry:false}).passed).toBe(false);expect(runReliable({...solved['NET-02'],ackDuplicates:false}).passed).toBe(false);});
  it('both morning and evening sequence 1 are delivered exactly once',()=>{const r=simulateReliable(solved['NET-02'],'whiteout');expect(r.exact).toBe(true);expect(r.counts.get('AM:1')).toBe(1);expect(r.counts.get('PM:1')).toBe(1);expect(r.copies).toBeGreaterThan(4);expect(r.acknowledgements).toBe(4);});
  it('the maximum fixed window floods the bottleneck instead of buying speed',()=>{expect(runCongestion({window:16,adaptive:false,backoff:false}).passed).toBe(false);});
  it('a window of one avoids drops but misses the delivery deadline',()=>{const r=simulateCongestion({window:1,adaptive:true,backoff:true},'whiteout');expect(r.dropped).toBe(0);expect(r.elapsed).toBeGreaterThan(76);});
  it('adaptive recovery works in all three changing capacity profiles',()=>{for(const w of SNOW_WEATHERS){const r=simulateCongestion(solved['NET-03'],w);expect(r.delivered).toBe(48);expect(r.dropped).toBeLessThanOrEqual(18);expect(r.elapsed).toBeLessThanOrEqual(76);}});
  it('logical timestamps encode parents and per-node local order',()=>{expect(logicalTimes()).toEqual({A1:1,B1:1,A2:2,C1:3,B2:4,A3:5});});
  it.each([{clock:'wall'},{tie:'arrival'},{barrier:false}] as const)('clock partial fix fails: %j',change=>{expect(runClock({...solved['NET-04'],...change}).passed).toBe(false);});
  it.each(['refresh','respectTTL','probe'] as const)('discovery needs %s under a separate regression',key=>{expect(runDiscovery({...solved['NET-S1'],[key]:false}).passed).toBe(false);});
  it('CRC-8 polynomial 0x07 matches the independent 123456789 check vector',()=>{expect(crc8(Array.from('123456789',c=>c.charCodeAt(0)))).toBe(0xf4);});
  it('an additive checksum misses balanced byte damage; detection alone cannot deliver',()=>{expect(runChecksum({algorithm:'sum8',retryCorrupt:true}).passed).toBe(false);expect(runChecksum({algorithm:'crc8',retryCorrupt:false}).passed).toBe(false);});
  it.each([{misses:1},{recovery:1},{fencing:false}] as const)('heartbeat partial fix fails: %j',change=>{expect(runHeartbeat({...solved['NET-S3'],...change}).passed).toBe(false);});
});
describe('snowfield authority, proof gates and delivery',()=>{
  it('requires meeting, stage access, and evidence before editing',()=>{const c=new SnowCampaign(freshSnow());expect(c.observe('WF-02')).toBe(false);expect(()=>c.submit('WF-02',solved['WF-02'])).toThrow();c.meet();expect(()=>c.submit('WF-02',solved['WF-02'])).toThrow();expect(c.observe('NET-04')).toBe(false);});
  it('previews and failures do not mutate authoritative state',()=>{const c=new SnowCampaign(freshSnow());c.meet();c.observe('WF-02');const original=structuredClone(c.data);c.preview('WF-02',solved['WF-02']);c.submit('WF-02',freshSnow().patches['WF-02']);expect(c.data).toEqual(original);});
  it('commits a clone and advances only one main stage',()=>{const c=new SnowCampaign(freshSnow());c.meet();c.observe('WF-02');const patch={...solved['WF-02']};c.submit('WF-02',patch);patch.heater='off';expect(c.data.patches['WF-02'].heater).toBe('thermostat');expect(c.data.phase).toBe('route');expect(parseSnow(c.data)).toEqual(c.data);});
  it('audit forces whiteout and still requires three delivery stations in order',()=>{const c=completeMain();expect(c.finish()).toBe(false);c.audit();expect(c.data.weather).toBe('whiteout');expect(c.deliver(2)).toBe(false);expect(c.deliver(1)).toBe(true);expect(c.finish()).toBe(false);expect(c.deliver(1)).toBe(false);c.deliver(2);c.deliver(3);expect(c.finish()).toBe(true);expect(c.finish()).toBe(true);expect(parseSnow(c.data)).toEqual(c.data);});
  it('the authority rejects a calm-weather expedition independently of UI controls',()=>{const c=completeMain();c.audit();c.data.weather='calm';expect(c.deliver(1)).toBe(false);c.data.delivery=3;expect(c.finish()).toBe(false);});
  it('a saved third handoff can finish safely when the ending was interrupted',()=>{const c=completeMain();c.audit();for(let i=1;i<=3;i++)c.deliver(i);const restored=new SnowCampaign(parseSnow(JSON.parse(JSON.stringify(c.data)))!);expect(restored.data.phase).toBe('expedition');expect(restored.finish()).toBe(true);restored.data.weather='calm';expect(restored.finish()).toBe(true);expect(parseSnow(restored.data)?.phase).toBe('complete');});
  it('optional quests remain playable after the main ending',()=>{const c=completeMain();c.audit();for(let i=1;i<=3;i++)c.deliver(i);c.finish();for(const id of ['NET-S1','NET-S2','NET-S3'] as const){c.observe(id);c.submit(id,solved[id]);}expect(c.data.phase).toBe('complete');expect(c.data.completed).toHaveLength(8);expect(parseSnow(c.data)).toEqual(c.data);});
  it('audit and finish re-execute the current policies rather than trusting labels',()=>{const c=completeMain();c.data.patches['NET-02'].ackDuplicates=false;expect(runSnowAudit(c.data).passed).toBe(false);expect(c.audit().passed).toBe(false);});
  it('rejects fabricated completion, phase skips, duplicate evidence and unseen tasks',()=>{expect(parseSnow({...freshSnow(),phase:'complete',delivery:3,audited:true})).toBeNull();const c=completeMain();const p=structuredClone(c.data);p.evidence=[];expect(parseSnow(p)).toBeNull();const q=freshSnow();q.phase='wind';q.evidence=['WF-02','WF-02'];expect(parseSnow(q)).toBeNull();q.evidence=['NET-04'];expect(parseSnow(q)).toBeNull();});
  it('rejects a calm-weather expedition save and invalid stage counters',()=>{const c=completeMain();c.audit();c.data.weather='calm';expect(parseSnow(c.data)).toBeNull();for(const delivery of [-1,1.5,4,Infinity])expect(parseSnow({...c.data,weather:'whiteout',delivery})).toBeNull();});
  it('reconstructs bounded patch fields and rejects coercion',()=>{for(const n of [0,17,NaN,Infinity,1.5])expect(parseSnowPatch('NET-03',{...solved['NET-03'],window:n})).toBeNull();expect(parseSnowPatch('NET-02',{...solved['NET-02'],retry:'true'})).toBeNull();expect(parseSnowPatch('NET-01',{...solved['NET-01'],A:'D'})).toBeNull();expect(parseSnowPatch('WF-02',[])).toBeNull();});
  it('rejects unknown and completed-but-unproven optional cases',()=>{const c=completeMain();c.data.completed.push('NET-S2');c.data.evidence.push('NET-S2');expect(parseSnow(c.data)).toBeNull();const p=freshSnow();p.evidence=['NET-99' as SnowCase];expect(parseSnow(p)).toBeNull();});
  it('migrates V6.2 saves with an earned third-city clearance and a fresh fourth city',()=>{const c=completeThreeCities(),old=structuredClone(c.data) as unknown as Record<string,unknown>;delete old.snow;delete old.threadClearance;const clean=parseProgress(old);expect(clean?.snow).toEqual(freshSnow());expect(clean?.threadClearance?.phase).toBe('complete');});
  it('cannot enter the fourth city before third-city completion',()=>{const c=new Campaign();c.data.city='snow';expect(parseProgress(c.data)).toBeNull();});
  it('fourth-city progress survives third-city replay only with a validated clearance',()=>{const c=completeThreeCities();c.data.threadClearance=structuredClone(c.data.thread);c.data.snow=completeMain().data;c.data.city='snow';c.data.thread=freshThread();expect(parseProgress(c.data)?.snow.phase).toBe('audit');c.data.threadClearance=null;expect(parseProgress(c.data)).toBeNull();});
  it('a forged third-city clearance cannot unlock the snowfield',()=>{const c=completeThreeCities();c.data.threadClearance={...freshThread(),phase:'complete',audited:true};expect(parseProgress(c.data)).toBeNull();});
  it('a third-city clearance still depends on proven first and second city progress',()=>{const c=completeThreeCities();c.data.threadClearance=structuredClone(c.data.thread);c.data.chapter='meet';expect(parseProgress(c.data)).toBeNull();});
});
describe('snowfield wind physics and horizontal routes',()=>{
  it('locked main bridges and the final expedition have real collision gaps',()=>{const surfaces=snowSurfaces();for(const p of [{x:-46,z:56},{x:0,z:9},{x:52,z:-39},{x:105,z:-91},{x:49,z:-141},{x:0,z:-187}])expect(floorAt(surfaces,p.x,p.z)).toBeNull();});
  it('shelters remove wind and retain normal grip',()=>{expect(inSnowShelter(SNOW_START)).toBe(true);expect(snowForces('whiteout',3,SNOW_POS['NET-02'],false)).toEqual(STILL_AIR);});
  it('bracing resists wind at the cost of walking speed',()=>{const p={x:0,y:4,z:-188},normal=snowForces('whiteout',4,p,false),braced=snowForces('whiteout',4,p,true);expect(braced.windX).toBeLessThan(normal.windX*.1);expect(braced.pace).toBeLessThan(normal.pace);expect(braced.grip).toBeGreaterThan(normal.grip);});
  it('wind integration remains close across 30, 60 and 120 Hz direct steps',()=>{
    const positions=[30,60,120].map(hz=>{const surfaces=snowSurfaces();surfaces.forEach(s=>s.enabled=true);const m=new Motor(surfaces,[],{...SNOW_BOUNDS});m.warp({x:0,y:4,z:-188});for(let i=0;i<hz*3;i++){m.environment=snowForces('whiteout',i/hz,m.position,true);m.step(1/hz,{x:0,z:-1,jump:false,sprint:false});}return m.position;});
    expect(Math.max(...positions.map(p=>p.x))-Math.min(...positions.map(p=>p.x))).toBeLessThan(.08);expect(Math.max(...positions.map(p=>p.z))-Math.min(...positions.map(p=>p.z))).toBeLessThan(.15);
  });
  it('a stationary unbraced traveler is blown off an exposed ice bridge',()=>{const surfaces=snowSurfaces();surfaces.forEach(s=>s.enabled=true);const m=new Motor(surfaces,[],{...SNOW_BOUNDS});const p={x:0,y:4,z:-188};m.warp(p);m.setCheckpoint(SNOW_AUDIT);for(let i=0;i<900&&m.falls===0;i++){m.environment=snowForces('whiteout',i/60,m.position,false);m.step(1/60,{x:0,z:0,jump:false,sprint:false});}expect(m.falls).toBe(1);});
  it('braced directional walking crosses every main bridge and final leg without a fall',()=>{
    const surfaces=snowSurfaces();surfaces.forEach(s=>s.enabled=true);const m=new Motor(surfaces,[],{...SNOW_BOUNDS});m.warp(SNOW_START);m.setCheckpoint(SNOW_START);let time=0;
    const targets=[SNOW_POS['WF-02'],SNOW_POS['NET-01'],SNOW_POS['NET-02'],SNOW_POS['NET-03'],SNOW_POS['NET-04'],SNOW_AUDIT,...SNOW_POSTS];
    for(const target of targets){for(let i=0;i<5000&&Math.hypot(m.position.x-target.x,m.position.z-target.z)>.5;i++){const dx=target.x-m.position.x,dz=target.z-m.position.z;time+=1/60;m.environment=snowForces('whiteout',time,m.position,true);m.step(1/60,{x:dx/Math.max(1,Math.hypot(dx,dz)),z:dz/Math.max(1,Math.hypot(dx,dz)),jump:false,sprint:false});}expect(Math.hypot(m.position.x-target.x,m.position.z-target.z)).toBeLessThan(1);m.setCheckpoint(target);}
    expect(m.falls).toBe(0);expect(m.position.y).toBe(4);
  });
});
