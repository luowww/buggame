import type { Surface, V3, WorldBounds } from './physics';
import type { ThreadCase, ThreadProgress } from './thread-domain';
export const THREAD_START:V3={x:0,y:5,z:39};
export const IRIS:V3={x:-4.8,y:5,z:27};
export const THREAD_AUDIT:V3={x:0,y:39,z:-190};
export const THREAD_END:V3={x:18,y:64,z:-172};
export const THREAD_BOUNDS:WorldBounds={minZ:-215,maxZ:62,maxX:145,fallY:-9};
export const THREAD_POS:Record<ThreadCase,V3>={
  'OS-01':{x:0,y:5,z:14},'OS-02':{x:0,y:15,z:-44},'OS-03':{x:0,y:27,z:-104},'OS-04':{x:0,y:39,z:-162},
  'OS-S1':{x:-28,y:15,z:-44},'OS-S2':{x:28,y:27,z:-104},
};
export const threadSurfaces=():Surface[]=>[
  {id:'thread-arrival',x:0,z:28,w:24,d:44,y:5},
  {id:'thread-gate-1',x:0,z:-3,w:10,d:18,y:5,enabled:false},
  {id:'thread-ramp-1',x:0,z:-24,w:10,d:24,y:5,rise:10},
  {id:'thread-schedule',x:0,z:-44,w:26,d:16,y:15},
  {id:'thread-gate-2',x:0,z:-60,w:10,d:16,y:15,enabled:false},
  {id:'thread-ramp-2',x:0,z:-82,w:10,d:28,y:15,rise:12},
  {id:'thread-counter',x:0,z:-104,w:26,d:16,y:27},
  {id:'thread-gate-3',x:0,z:-119,w:10,d:14,y:27,enabled:false},
  {id:'thread-ramp-3',x:0,z:-140,w:10,d:28,y:27,rise:12},
  {id:'thread-memory',x:0,z:-162,w:28,d:16,y:39},
  {id:'thread-gate-4',x:0,z:-176,w:10,d:12,y:39,enabled:false},
  {id:'thread-audit',x:0,z:-191,w:28,d:18,y:39},
  {id:'thread-side-bridge-1',x:-17,z:-44,w:34,d:5,y:15},
  {id:'thread-side-1',x:-28,z:-44,w:14,d:14,y:15},
  {id:'thread-side-bridge-2',x:17,z:-104,w:34,d:5,y:27},
  {id:'thread-side-2',x:28,z:-104,w:14,d:14,y:27},
  {id:'thread-summit',x:18,z:-172,w:24,d:16,y:64,enabled:false},
];
export function threadCheckpoint(s:ThreadProgress):V3 {
  if(s.phase==='complete')return {...THREAD_END};
  if(s.phase==='evacuate')return {...THREAD_AUDIT,z:-185};
  const current=({'locks':'OS-01','schedule':'OS-02','counter':'OS-03','memory':'OS-04'} as const)[s.phase as 'locks'|'schedule'|'counter'|'memory'];
  if(current&&s.evidence.includes(current))return {...THREAD_POS[current],z:THREAD_POS[current].z+5};
  for(const id of ['OS-04','OS-03','OS-02','OS-01'] as const)if(s.completed.includes(id))return {...THREAD_POS[id],z:THREAD_POS[id].z+4};
  return {...THREAD_START};
}
