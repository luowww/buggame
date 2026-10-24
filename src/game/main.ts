import './style.css';
import { Campaign, CHAPTERS, INITIAL_ORDER, INITIAL_RAIL, STATIONS, freshProgress, readProgress, readSettings, relink, runOrder, runRail, saveProgress, saveSettings, traverse, type Chapter, type EventAction, type RailState, type RunResult, type Station } from './domain';
import { CityView } from './view';
import { A_CHECKPOINT, CHECKPOINTS, Motor, type V3 } from './physics';
import { GameInput } from './input';
import { CityAudio } from './audio';
import { MIRA_POS, NODE_POS, REORDER_POS, STATION_POS } from './world';

const $ = <T extends HTMLElement = HTMLElement>(id:string):T => document.getElementById(id) as T;
const show = (id:string,visible:boolean):void=>{$(id).hidden=!visible;};
const setText=(id:string,value:string):void=>{$(id).textContent=value;};
const distance=(a:V3,b:V3):number=>Math.hypot(a.x-b.x,a.z-b.z);
const clock=(time:number):string=>`${Math.floor(time/60).toString().padStart(2,'0')}:${Math.floor(time%60).toString().padStart(2,'0')}`;
const actionInfo:Record<EventAction,{name:string;sub:string}>={EXIT:{name:'让旅客离开',sub:'PASSENGER.EXIT'},DELETE:{name:'移除旧站台',sub:'PLATFORM.DELETE'},ARCHIVE:{name:'保存生还记录',sub:'RECORD.ARCHIVE'}};
const settings=readSettings();
let hasSettings=false;
try {hasSettings=localStorage.getItem('reflow-404:v6:settings')!==null;}catch{/* optional storage */}
if(!hasSettings) {
  settings.quality=window.innerWidth<700?'low':'high';
  settings.reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
}
let view:CityView;
try { view=new CityView($('world-host'),settings); }
catch(error) {show('boot-error',true);show('loading',false);setText('boot-error-detail',`图形初始化失败。请开启浏览器硬件加速，或换用支持 WebGL 2 的浏览器。${error instanceof Error?' '+error.message:''}`);throw error;}
const world=view.world;
const motor=new Motor(world.surfaces,world.obstacles);
const input=new GameInput(view.renderer.domElement);
const audio=new CityAudio();
let campaign=new Campaign();
let mode:'menu'|'play'|'patch'|'cinema'|'result'='menu';
let patchCase:'Q-01'|'DS-01'|null=null;
let draftOrder:EventAction[]=[...INITIAL_ORDER];
let draftRail:RailState=structuredClone(INITIAL_RAIL);
let source:Exclude<Station,'END'>='A';
let scanUntil=0;
let toastUntil=0;
let now=0;
let cinemaStart=0;
let cinemaType:'order'|'recovery'|'ride'='order';
let modalType:string|null=null;
let priorFocus:HTMLElement|null=null;
let dialogueIndex=-1;
let hintCount=0;
let hudAccumulator=0;
let persistAccumulator=0;
let saved=readProgress();
let proof:RunResult|null=null;
let sourceDrag:{node:Exclude<Station,'END'>;x:number;y:number;moved:boolean}|null=null;
let eventDrag:{action:EventAction;startY:number;centers:number[];element:HTMLElement}|null=null;
let lastStep=0;
show('btn-continue',saved!==null);
const dialogue=[
  '我女儿在 B 站。列车每天经过那里，却再也没有停下来。系统说，那座车站不存在。',
  '你也没有身份记录？那就拿着这枚因果织针吧。按 Q，你会看见城市没来得及说完的话。',
  '先去前面的坏站台。它总在旅客离开前消失。如果你能改变事情发生的顺序，也许就能把她带回来。',
];

function setMode(next:typeof mode):void {
  mode=next;$('app').dataset.mode=next;
  eventDrag=null;sourceDrag=null;
  if(next!=='play')$('world-markers').replaceChildren();
  show('menu',next==='menu');show('hud',next==='play'||next==='patch');
  show('patch-panel',next==='patch');show('patch-nodes',next==='patch'&&patchCase==='DS-01');
  show('cinema',next==='cinema');show('result',next==='result');
  if(next!=='patch')show('proof-panel',false);
  input.clear();
}
function persist():void {saveProgress(campaign.data);saved=structuredClone(campaign.data);show('btn-continue',true);}
function syncWorld():void {
  const chapter=CHAPTERS.indexOf(campaign.data.chapter);
  world.setBridge(chapter>=2);world.setRail(campaign.data.rail,chapter>=3);world.resetTrain();
  motor.surfaces=world.surfaces;motor.setCheckpoint(CHECKPOINTS[campaign.data.chapter]);
  world.hero.needle.visible=chapter>0;audio.recovered=chapter>=3;
  setText('world-state',chapter>=3?'状态 / 已修复':'状态 / 失序');
  $('mini-route').setAttribute('d',chapter>=3?'M0-49 37-56 56-82 18-98':'M0-49 56-82 18-98');
  $('mini-route').style.stroke=chapter>=3?'#8ef7c7':'#e28a7e';
}
function start(resume=false):void {
  closeModal();campaign=new Campaign(resume&&saved?saved:freshProgress());
  motor.reset();motor.warp(CHECKPOINTS[campaign.data.chapter]);view.yaw=0;view.pitch=.34;
  world.showDraft(null);syncWorld();setMode('play');view.mode='follow';
  dialogueIndex=-1;show('subtitle',false);show('scan-banner',false);scanUntil=0;hintCount=0;
  audio.unlock();audio.setEnabled(settings.sound);audio.setPaused(false);persist();updateHud();
  toast(resume?'旅程已恢复。检查点就在脚下。':'WASD 移动 · 右键拖动看四周 · 前往站长 MIRA',5);
}
function toast(message:string,duration=3.6):void{setText('toast',message);show('toast',true);toastUntil=now+duration;}
function goal():{pos:V3;label:string;code:string;title:string;description:string} {
  const c=campaign.data.chapter;
  if(c==='meet')return {pos:MIRA_POS,label:'MIRA / 站长',code:'PROLOGUE / 00',title:'有人还在等一列车',description:'沿港口灯带向前，找到站长 MIRA。'};
  if(c==='reorder')return {pos:REORDER_POS,label:'Q-01 / 事件失序',code:'Q-01 / CAUSAL ORDER',title:'先离开，再消失',description:'前方站台在旅客离开前消失。靠近后按 Q 扫描。'};
  if(c==='rail')return {pos:STATION_POS.A,label:'DS-01 / 失联线路',code:'DS-01 / BROKEN LINK',title:'一座被跳过的车站',description:'跨过修好的通道，沿坡道前往 A 站，扫描列车运行轨迹。'};
  if(c==='board')return {pos:STATION_POS.A,label:'A / 返航列车',code:'FINAL / HOMEBOUND',title:'带她回家',description:'回到 A 站，登上恢复运行的列车。沿途看看你改变的城市。'};
  return {pos:STATION_POS.END,label:'END / 已恢复',code:'CHAPTER 01 / RESTORED',title:'世界还在运行',description:'指针港已经恢复。自由探索三层步道，或从菜单重新修复。'};
}
function updateHud():void {
  const g=goal();setText('quest-code',g.code);setText('quest-title',g.title);setText('quest-description',g.description);
  const d=distance(motor.position,g.pos);setText('quest-distance',`${d<6?'◇ 已抵达':'↗ '+Math.round(d)+' m'}  /  ${g.label}`);
  setText('identity-status',campaign.data.chapter==='meet'?'身份未知 / UNKNOWN':'因果织针 / 已连接');
  const canInteract=mode==='play'&&!modalType&&(dialogueIndex>=0||nearInteraction()!==null);
  show('interact-prompt',canInteract&&dialogueIndex<0);
  setText('interact-label',nearInteraction()?.label??'');
  $('mini-player').setAttribute('transform',`translate(${motor.position.x} ${motor.position.z}) rotate(${-motor.facing*180/Math.PI})`);
  const markers=$('world-markers');
  markers.replaceChildren();
  if(mode==='play'&&!modalType) {
    const p=view.project({...g.pos,y:g.pos.y+3.9});
    if(p.visible) {const marker=document.createElement('div');marker.className='world-marker'+(campaign.data.chapter==='rail'?' error':'');marker.style.left=`${p.x}px`;marker.style.top=`${p.y}px`;marker.innerHTML=`<span>${g.label}</span><i></i>`;markers.append(marker);}
    if(scanUntil>now&&campaign.data.chapter==='rail')for(const id of STATIONS){const p=view.project(NODE_POS[id]);if(p.visible){const m=document.createElement('div');m.className='world-marker'+(id==='B'?' error':'');m.style.left=`${p.x}px`;m.style.top=`${p.y}px`;m.innerHTML=`<span>${id}${id==='B'?' / 无列车停靠':''}</span><i></i>`;markers.append(m);}}
  }
}
function nearInteraction():{kind:string;label:string}|null {
  const p=motor.position,c=campaign.data.chapter;
  if(dialogueIndex>=0)return {kind:'dialogue',label:'继续对话'};
  if(c==='meet'&&distance(p,MIRA_POS)<7)return {kind:'mira',label:'与 MIRA 对话'};
  if(c==='reorder'&&distance(p,REORDER_POS)<9&&Math.abs(p.y-3)<4)return {kind:'order',label:campaign.data.evidence.includes('Q-01')?'打断点 · 改写事件顺序':'按 Q 扫描异常站台'};
  if(c==='rail'&&distance(p,STATION_POS.A)<13&&p.y>10)return {kind:'rail',label:campaign.data.evidence.includes('DS-01')?'打断点 · 检查列车指针':'按 Q 扫描列车线路'};
  if(c==='board'&&distance(p,STATION_POS.A)<13&&p.y>10)return {kind:'board',label:'登上返航列车'};
  if(c!=='meet'&&distance(p,MIRA_POS)<5&&Math.abs(p.y-3)<3)return {kind:'mira-after',label:'听听 MIRA 怎么说'};
  if(distance(p,STATION_POS.B)<7&&p.y>10)return {kind:'daughter',label:'检查 B 站的等待记录'};
  return null;
}
function interact():void {
  if(modalType||mode==='menu'||mode==='result'||mode==='cinema')return;
  if(mode==='patch')return;
  if(dialogueIndex>=0){advanceDialogue();return;}
  const item=nearInteraction();
  if(!item){toast('靠近有菱形标记的地点，再按 E。');return;}
  if(item.kind==='mira'){dialogueIndex=0;advanceDialogue(false);}
  if(item.kind==='order'||item.kind==='rail') {
    const id=item.kind==='order'?'Q-01':'DS-01';
    if(!campaign.data.evidence.includes(id)){scan();return;}
    openPatch(id);
  }
  if(item.kind==='board')board();
  if(item.kind==='mira-after')toast(campaign.data.chapter==='board'||campaign.data.chapter==='complete'?'MIRA：她的名字又出现在站牌上了。谢谢你，零号。':'MIRA：听见了吗？每一个错误里，都还有人在等。',5);
  if(item.kind==='daughter')toast(campaign.data.chapter==='rail'?'等待记录：旅客仍在 B 站。列车从 A 直接开往 C，已错过 404 次。':'旅客记录：已登车。目的地：家。',5);
}
function advanceDialogue(increment=true):void {
  if(increment)dialogueIndex++;
  if(dialogueIndex>=dialogue.length){dialogueIndex=-1;show('subtitle',false);campaign.meet();world.hero.needle.visible=true;persist();updateHud();toast('获得因果织针 · Q 溯源 · E 进入断点');return;}
  input.clear();show('subtitle',true);setText('speaker','MIRA / 指针港站长');setText('subtitle-text',dialogue[dialogueIndex]);
}
function scan():void {
  if(mode!=='play'||modalType||dialogueIndex>=0)return;
  if(campaign.data.chapter==='meet'){toast('先找到 MIRA，获取因果织针。');return;}
  world.scan(motor.position);audio.cue('scan');scanUntil=now+6;
  const c=campaign.data.chapter;
  const nearOrder=c==='reorder'&&distance(motor.position,REORDER_POS)<15;
  const nearRail=c==='rail'&&distance(motor.position,STATION_POS.A)<24&&motor.position.y>8;
  if(nearOrder||nearRail){const id=nearOrder?'Q-01':'DS-01';campaign.observe(id);persist();show('scan-banner',true);setText('scan-detail',nearOrder?'观察：DELETE → EXIT → ARCHIVE。删除发生时，旅客还在站台上。按 E 冻结这段事件。':`列车访问了 ${traverse(campaign.data.rail).route.join(' → ')}。B 站仍有等待记录。按 E 检查线路。`);}
  else {show('scan-banner',true);setText('scan-detail',c==='board'||c==='complete'?'所有站点已恢复可达。城市仍记得你的补丁。':'远处标记着下一处异常。沿灯带靠近，才能捕获完整证据。');}
  updateHud();
}
function openPatch(id:'Q-01'|'DS-01'):void {
  patchCase=id;draftOrder=[...campaign.data.order];draftRail=structuredClone(campaign.data.rail);source='A';proof=null;
  setMode('patch');show('scan-banner',false);show('interact-prompt',false);view.mode=id==='Q-01'?'order':'rail';
  setText('patch-code',id==='Q-01'?'Q-01 / EVENT ORDER':'DS-01 / LINKED TRANSIT');
  setText('patch-title',id==='Q-01'?'先离开，再消失。':'找回被跳过的一站。');
  setText('patch-description',id==='Q-01'?'拖动事件卡片，改变发生顺序。旅客必须安全离开，生还记录也不能丢失。':'拖动三维节点的因果线，改写下一站。你也可以点选源节点，再点目标站。');
  $('patch-observation').innerHTML=id==='Q-01'?'<div class="observation"><small class="mono">OBSERVED / 观察到的顺序</small><strong>DELETE → EXIT → ARCHIVE</strong><p>站台消失时，旅客还没有离开。</p></div>':`<div class="observation"><small class="mono">OBSERVED / 实际停靠</small><strong>${traverse(campaign.data.rail).route.join(' → ')}</strong><p>B 站：有旅客等待，未收到列车。</p></div>`;
  renderEditor();renderNodes();world.showDraft(id==='DS-01'?draftRail:null);audio.cue('select');
  $('btn-close-patch').focus({preventScroll:true});$('patch-panel').scrollTop=0;
}
function closePatch():void {
  if(mode!=='patch')return;
  world.showDraft(null);world.nodes.visible=false;patchCase=null;show('patch-nodes',false);show('proof-panel',false);setMode('play');view.mode='follow';
}
function renderEditor():void {
  const editor=$('patch-editor');editor.replaceChildren();
  if(patchCase==='Q-01') {
    editor.innerHTML='<div class="editor-label">候选事件队列 <span>DRAG TO REORDER</span></div><div id="event-list"></div>';
    const list=$('event-list');
    draftOrder.forEach((action,index)=>{
      const item=document.createElement('div');item.className='event-item';item.dataset.action=action;
      item.innerHTML=`<span class="event-number">0${index+1}</span><button class="event-grip" aria-label="拖动${actionInfo[action].name}" title="拖动排序">⠿</button><span class="event-name"><b>${actionInfo[action].name}</b><small>${actionInfo[action].sub}</small></span><span class="event-arrows"><button data-dir="-1" aria-label="上移${actionInfo[action].name}" ${index===0?'disabled':''}>↑</button><button data-dir="1" aria-label="下移${actionInfo[action].name}" ${index===2?'disabled':''}>↓</button></span>`;
      item.querySelectorAll<HTMLButtonElement>('[data-dir]').forEach(button=>button.onclick=()=>moveEvent(index,index+Number(button.dataset.dir)));
      item.querySelector('.event-grip')!.addEventListener('pointerdown',event=>{
        const e=event as PointerEvent;e.preventDefault();
        eventDrag={action,startY:e.clientY,element:item,centers:Array.from(list.children).map(element=>{const r=element.getBoundingClientRect();return r.y+r.height/2;})};
        item.classList.add('dragging');
      });
      list.append(item);
    });
  } else {
    editor.innerHTML=`<div class="editor-label">选择要改写的源节点 <span>RELINK</span></div><div class="source-picker">${(['A','B','C'] as const).map(id=>`<button data-source="${id}" class="${id===source?'active':''}" aria-label="源节点 ${id}">${id}</button>`).join('')}</div><div class="link-summary">${source}<small>.next</small> → ${draftRail.next[source]??'NULL'}</div><div class="editor-label">连接到目标站 <span>或拖动场景节点</span></div><div class="target-picker">${STATIONS.map(id=>`<button data-target="${id}" class="${id===draftRail.next[source]?'active':''}" aria-label="连接到 ${id} 站">${id}</button>`).join('')}</div><p class="target-instruction">琥珀虚线是候选未来。重放验证通过后，列车才会采用你的线路。</p>`;
    editor.querySelectorAll<HTMLButtonElement>('[data-source]').forEach(button=>button.onclick=()=>{source=button.dataset.source as Exclude<Station,'END'>;renderEditor();renderNodes();audio.cue('select');});
    editor.querySelectorAll<HTMLButtonElement>('[data-target]').forEach(button=>button.onclick=()=>connect(button.dataset.target as Station));
  }
}
function moveEvent(from:number,to:number):void {
  if(from===to||to<0||to>2)return;const [item]=draftOrder.splice(from,1);draftOrder.splice(to,0,item);renderEditor();show('proof-panel',false);audio.cue('select');
}
function renderNodes():void {
  const host=$('patch-nodes');host.replaceChildren();
  if(patchCase!=='DS-01')return;
  STATIONS.forEach(id=>{
    const button=document.createElement('button');button.className=`causal-node ${id===source?'source':''} ${id==='B'?'error':''} ${id==='END'?'node-end':''}`;button.dataset.node=id;
    button.setAttribute('aria-label',`三维节点 ${id}${id===source?'，当前源节点':''}`);
    button.innerHTML=`<span class="node-core"><span>${id}</span></span><small>${id==='END'?'TERMINAL':id===source?'DRAG NEXT ↗':id==='B'?'UNREACHABLE':'STATION'}</small>`;
    button.addEventListener('pointerdown',e=>{if(id!=='END'){sourceDrag={node:id,x:e.clientX,y:e.clientY,moved:false};button.classList.add('drag-source');}e.preventDefault();});
    button.addEventListener('click',e=>{if(e.detail===0||id==='END')connect(id);});
    host.append(button);
  });
  positionNodes();
}
function positionNodes():void {
  $('patch-nodes').querySelectorAll<HTMLButtonElement>('[data-node]').forEach(button=>{
    const p=view.getStationScreen(button.dataset.node as Station);button.style.left=`${p.x}px`;button.style.top=`${p.y}px`;button.hidden=!p.visible;
  });
}
function connect(target:Station):void {
  try{draftRail=relink(draftRail,source,target);world.showDraft(draftRail);renderEditor();renderNodes();show('proof-panel',false);audio.cue('select');}
  catch(error){toast(error instanceof Error?error.message:'无法连接目标。');}
}
function showProof(result:RunResult,preview=false):void {
  proof=result;show('proof-panel',true);$('proof-panel').className=preview?'preview':result.passed?'passed':'';
  setText('proof-label',`${preview?'COUNTERFACTUAL / 未提交':'ASSERTION REPORT'} · ${result.runId}`);
  setText('proof-title',preview?(result.passed?'预演：路线可行':'预演：发现反例'):(result.passed?'回归验证通过':'世界给出了反例'));
  setText('proof-reason',result.reason);
  $('proof-checks').replaceChildren();
  result.assertions.forEach(assertion=>{const row=document.createElement('div');row.className='proof-check'+(assertion.passed?' good':'');const icon=document.createElement('span');icon.textContent=assertion.passed?'✓':'×';const text=document.createElement('p');text.textContent=assertion.name;const detail=document.createElement('small');detail.textContent=assertion.detail;text.append(detail);row.append(icon,text);$('proof-checks').append(row);});
  $('proof-log').replaceChildren();result.log.forEach(event=>{const row=document.createElement('div');row.className='log-event';const tick=document.createElement('b');tick.textContent=`t+${(event.tick/60).toFixed(2)}`;row.append(tick,document.createTextNode(event.detail));$('proof-log').append(row);});
  setText('btn-proof-action',preview?'返回草案 →':result.passed?'回到城市 →':'保留证据，继续实验 →');
}
function preview():void {
  if(mode!=='patch')return;
  const result=patchCase==='Q-01'?runOrder(draftOrder,'Q-01:preview'):runRail(draftRail,'DS-01:preview');
  showProof(result,true);if(patchCase==='DS-01')world.showDraft(draftRail);audio.cue('select');
}
function verify():void {
  if(mode!=='patch'||!patchCase)return;
  try {
    const id=patchCase;const result=id==='Q-01'?campaign.submitOrder(draftOrder):campaign.submitRail(draftRail);
    persist();showProof(result);
    if(!result.passed){audio.cue('fail');return;}
    closePatch();syncWorld();persist();audio.cue('success');cinemaStart=now;cinemaType=id==='Q-01'?'order':'recovery';
    setMode('cinema');view.mode=id==='Q-01'?'order':'recovery';
    setText('replay-id',result.runId);setText('cinema-label',id==='Q-01'?'CAUSAL ORDER RESTORED':'ALL STATIONS REACHABLE');
    setText('cinema-title',id==='Q-01'?'先让一个人，安全离开。':'把被跳过的人，接回世界。');
    setText('cinema-detail',id==='Q-01'?'普通与慢速旅客均已验证。维修通道正在展开。':`列车将沿 ${result.route.join(' → ')} 重新执行。B 站的灯，终于亮了。`);
    if(id==='DS-01')world.startReplay(result);
  } catch(error){toast(error instanceof Error?error.message:'补丁未通过校验。');}
}
function finishCinema():void {
  if(cinemaType==='ride'){world.finishReplay();showResult();return;}
  world.finishReplay();world.resetTrain();world.bridge.scale.set(1,1,1);world.passenger.group.position.set(5,3,8);
  if(cinemaType==='recovery')motor.warp(CHECKPOINTS.board);
  setMode('play');view.mode='follow';persist();updateHud();
  toast(cinemaType==='order'?'维修通道已展开。沿前方坡道前往 A 站。':'B 站已恢复。回到 A 站，登上列车带她回家。',5);
}
function board():void {
  const result=runRail(campaign.data.rail,'DS-01:homebound');if(!result.passed)return;
  setMode('cinema');cinemaType='ride';cinemaStart=now;world.startReplay(result,true);view.mode='ride';
  setText('replay-id',result.runId);setText('cinema-label','HOMEBOUND / 返航');setText('cinema-title','这一次，列车会为她停下。');
  setText('cinema-detail',`${result.route.join(' → ')}。每个名字，都值得被世界找到。`);audio.cue('success');
}
function showResult():void {
  if(!campaign.finish())return;
  persist();settings.best=settings.best===null?campaign.data.elapsed:Math.min(settings.best,campaign.data.elapsed);saveSettings(settings);
  motor.warp(CHECKPOINTS.complete);motor.setCheckpoint(CHECKPOINTS.complete);setMode('result');view.mode='result';audio.cue('success');
  $('result-stats').innerHTML=`<div class="result-stat"><b>${clock(campaign.data.elapsed)}</b><small>修复用时</small></div><div class="result-stat"><b>${campaign.data.attempts.toString().padStart(2,'0')}</b><small>补丁实验</small></div><div class="result-stat"><b>04 / 04</b><small>恢复可达的车站</small></div>`;
}
function hint():void {
  const c=campaign.data.chapter;hintCount++;
  const hints:Record<Chapter,string[]>={
    meet:['向前走，左侧雨棚下的断环角色就是 MIRA。靠近后按 E。'],
    reorder:['先观察：平台删除时，旅客还站在上面。按 Q 捕获轨迹，再按 E 进入编辑。','想一想：生还记录只能在旅客离开后保存；删除站台也要等旅客离开。','将「让旅客离开」移到第一位，另外两个事件放在后面。按 R 验证两个速度的旅客。'],
    rail:['沿刚修好的桥向前，再爬上长坡道。到 A 站后按 Q 扫描。','列车的访问记录里少了 B。检查 A 的下一站，以及 B 自己的下一站。','把 A.next 指向 B。B 已经连到 C；C 会继续去 END。再重放验证有没有循环。'],
    board:['到 A 站的列车旁按 E。列车会沿刚刚证明的线路返航。'],
    complete:['左侧还有通往核心观景台的两段坡道。你也可以从菜单重新开始。'],
  };
  const list=hints[c];toast(list[Math.min(hintCount-1,list.length-1)],7);
}

function openModal(type:string):void {
  if(modalType===null)priorFocus=document.activeElement as HTMLElement;
  modalType=type;input.clear();audio.setPaused(true);show('modal-layer',true);
  const content=$('modal-content');
  if(type==='pause')content.innerHTML='<div class="eyebrow">LOCAL TIME / FROZEN</div><h2 id="modal-title">城市会等你。</h2><p>时间、列车和因果事件均已暂停。<br>你的进度已保存在最近的检查点。</p><div class="modal-actions"><button class="primary" id="modal-resume">继续旅程 <span>→</span></button><button class="text-button" id="modal-checkpoint">回到检查点 ↶</button><button class="text-button" id="modal-menu">返回主菜单 ↗</button></div>';
  else if(type==='help')content.innerHTML='<div class="eyebrow">THE CAUSAL NEEDLE / 操作手册</div><h2 id="modal-title">看见错误，再改写因果。</h2><p>你是零号，一个没有身份记录的存在。港城里有人正在被系统遗忘。<br><b>靠近异常 → 扫描证据 → 打断点 → 改写 → 重放验证。</b></p><div class="modal-controls"><div><kbd>WASD</kbd>移动 / 方向键也可</div><div><kbd>Shift</kbd>冲刺</div><div><kbd>Space</kbd>跳跃</div><div><kbd>右键拖动</kbd>转动视角</div><div><kbd>Q</kbd>扫描因果</div><div><kbd>E</kbd>对话 / 打断点 / 登车</div><div><kbd>R</kbd>验证当前补丁</div><div><kbd>M / Tab</kbd>城市地图</div><div><kbd>Esc</kbd>退出编辑 / 暂停</div></div><p class="modal-rule">手机：左侧摇杆移动，右侧空白处拖动视角。「溯源」扫描，向上按钮跳跃，屏幕中间的交互提示可直接点按。<br>进入断点后局部时间冻结，随时可以撤销草案。失败不会丢掉已收集的证据。</p>';
  else if(type==='settings')content.innerHTML=`<div class="eyebrow">SYSTEM PREFERENCES</div><h2 id="modal-title">调整你的世界。</h2><label class="setting-row"><span>环境音乐与反馈<small>原创合成音轨，故障与恢复使用不同编曲</small></span><input id="setting-sound" type="checkbox" ${settings.sound?'checked':''}></label><label class="setting-row"><span>画面细节<small>低画质减少雨滴并降低渲染分辨率</small></span><select id="setting-quality"><option value="high" ${settings.quality==='high'?'selected':''}>细致 / HIGH</option><option value="low" ${settings.quality==='low'?'selected':''}>流畅 / LOW</option></select></label><label class="setting-row"><span>降低动态效果<small>固定城市全景，减弱动态镜头变化</small></span><input id="setting-motion" type="checkbox" ${settings.reducedMotion?'checked':''}></label><label class="setting-row"><span>视角灵敏度</span><input id="setting-sensitivity" type="range" min="0.3" max="2" step="0.1" value="${settings.sensitivity}" aria-label="视角灵敏度"></label><div class="modal-actions"><button class="text-button" id="modal-fullscreen">切换全屏 ↗</button><button class="primary" id="modal-resume">完成 <span>→</span></button></div>`;
  else if(type==='map') {
    content.innerHTML='<div class="eyebrow">SECTOR 01 / SYSTEM TOPOLOGY</div><h2 id="modal-title">指针港 · 因果地图</h2><div id="large-map"></div><div class="map-key"><span>◇ 琥珀：你的所在位置</span><span>红色：异常线路</span><span>细线：可达步道</span></div><p>下层港道 → 中层高架 → 上层核心观景台。<br>港区外为施工边界。列车能否停靠，取决于真实运行的 next 关系。</p><div class="chapter-list"><span class="active">01 指针港 / 可探索</span><span>02 脉冲炉 / 后续章节</span><span>03 千线程 / 后续章节</span></div>';
    const map=$('mini-svg').cloneNode(true) as SVGSVGElement;map.removeAttribute('id');map.classList.add('modal-map');map.querySelectorAll('[id]').forEach(node=>node.removeAttribute('id'));$('large-map').append(map);
  } else content.innerHTML='<div class="eyebrow">RE:FLOW 404 / 断点之城</div><h2 id="modal-title">一个错误，也有存在的意义。</h2><p>CIVITAS 是一座运行中的城市。路网是数据结构，列车是执行事件，居民的名字是一条不能丢失的记录。<br>当清除署决定删除异常，零号选择先听懂它们。</p><p>本版本包含指针港的完整章节：三维探索、事件重排、链路修复、列车返航与自由漫游。脉冲炉及其他城市属于后续计划。</p><p class="modal-rule">城市、角色与声音由原创程序生成。运行中无需登录，不上传存档，不调用 AI 或第三方服务。存档仅保留在当前浏览器。</p><div class="modal-actions"><button class="primary" id="modal-resume">回到世界 <span>→</span></button><button class="text-button" id="modal-card-link">查看零号设定卡 ↗</button></div>';
  $('modal-resume')?.addEventListener('click',closeModal);
  $('modal-checkpoint')?.addEventListener('click',()=>{closeModal();if(mode==='patch')closePatch();if(mode==='cinema'){toast('请先结束当前列车回放。');return;}motor.warp(motor.checkpoint);view.mode='follow';toast('已回到最近的安全检查点。');});
  $('modal-menu')?.addEventListener('click',()=>{persist();closeModal();setMode('menu');view.mode='menu';world.showDraft(null);show('subtitle',false);dialogueIndex=-1;});
  $('modal-fullscreen')?.addEventListener('click',()=>{if(document.fullscreenElement)void document.exitFullscreen().catch(()=>toast('当前浏览器不支持退出全屏。'));else void document.documentElement.requestFullscreen().catch(()=>toast('当前浏览器不支持全屏。'));});
  $('modal-card-link')?.addEventListener('click',()=>{window.open(new URL('character-card.html',document.baseURI).href,'_blank','noopener');});
  $('setting-sound')?.addEventListener('change',e=>{settings.sound=(e.target as HTMLInputElement).checked;audio.setEnabled(settings.sound);applySettings();});
  $('setting-quality')?.addEventListener('change',e=>{settings.quality=(e.target as HTMLSelectElement).value as 'high'|'low';applySettings();});
  $('setting-motion')?.addEventListener('change',e=>{settings.reducedMotion=(e.target as HTMLInputElement).checked;applySettings();});
  $('setting-sensitivity')?.addEventListener('input',e=>{settings.sensitivity=Number((e.target as HTMLInputElement).value);applySettings();});
  requestAnimationFrame(()=>$('btn-close-modal').focus());
}
function closeModal():void {
  if(!modalType)return;modalType=null;show('modal-layer',false);audio.setPaused(document.hidden);input.clear();priorFocus?.focus({preventScroll:true});
}
function applySettings():void {
  saveSettings(settings);view.applySettings(settings);
  setText('btn-sound','');$('btn-sound').innerHTML=settings.sound?'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4zM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/></svg><span class="button-label">声音开</span>':'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4zM16 9l6 6m0-6-6 6"/></svg><span class="button-label">声音关</span>';
  $('btn-sound').setAttribute('aria-label',`声音：${settings.sound?'开':'关'}`);$('btn-sound').setAttribute('aria-pressed',String(settings.sound));
}

$('btn-start').onclick=()=>start();$('btn-continue').onclick=()=>start(true);$('btn-interact').onclick=interact;$('tool-patch').onclick=interact;
$('btn-dialogue').onclick=()=>advanceDialogue();$('tool-trace').onclick=scan;$('touch-scan').onclick=scan;
$('btn-hint').onclick=hint;$('btn-close-patch').onclick=closePatch;$('btn-preview').onclick=preview;$('btn-verify').onclick=verify;
$('btn-undo').onclick=()=>{draftRail=structuredClone(campaign.data.rail);draftOrder=[...campaign.data.order];renderEditor();world.showDraft(patchCase==='DS-01'?draftRail:null);renderNodes();show('proof-panel',false);toast('草案已撤销，原始证据保留。');};
$('btn-close-proof').onclick=()=>show('proof-panel',false);$('btn-proof-action').onclick=()=>show('proof-panel',false);
$('btn-skip-replay').onclick=finishCinema;$('btn-restart').onclick=()=>start();
$('btn-roam').onclick=()=>{setMode('play');view.mode='follow';toast('城市还在运行。欢迎留下来。');};
$('btn-copy-result').onclick=async()=>{const record=`RE:FLOW 404 · 指针港修复记录\n用时 ${clock(campaign.data.elapsed)} / ${campaign.data.attempts} 次实验 / ${campaign.data.counterexamples} 个反例\n线路：${traverse(campaign.data.rail).route.join(' → ')}\n系统找不到，不代表不存在。`;try{await navigator.clipboard.writeText(record);toast('修复记录已复制。');}catch{toast('浏览器未开放剪贴板权限。你可以截图保存结算。');}};
$('btn-settings').onclick=()=>openModal('settings');$('btn-help').onclick=()=>openModal('help');$('btn-about').onclick=()=>openModal('about');
$('btn-map').onclick=()=>openModal('map');$('tool-map').onclick=()=>openModal('map');$('btn-pause').onclick=()=>{persist();openModal('pause');};
$('brand-button').onclick=()=>openModal(mode==='menu'?'about':'pause');$('btn-close-modal').onclick=closeModal;
$('btn-sound').onclick=()=>{settings.sound=!settings.sound;audio.setEnabled(settings.sound);applySettings();};
$('touch-jump').addEventListener('pointerdown',e=>{e.preventDefault();input.touchJump=true;($('touch-jump') as HTMLButtonElement).setPointerCapture(e.pointerId);});
for(const event of ['pointerup','pointercancel'])$('touch-jump').addEventListener(event,()=>input.touchJump=false);

input.onLook=(x,y)=>{if(mode==='play'&&!modalType&&dialogueIndex<0)view.turn(x,y);};
input.onAction=key=>{
  if(modalType){
    if(key==='Escape'){closeModal();return;}
    if(key==='Tab') {const items=Array.from($('modal-card').querySelectorAll<HTMLElement>('button:not([disabled]),input,select'));const index=items.indexOf(document.activeElement as HTMLElement);const delta=input.keys.has('ShiftLeft')||input.keys.has('ShiftRight')?-1:1;items[(index+delta+items.length)%items.length]?.focus();}
    return;
  }
  if(key==='Escape') {if(mode==='patch')closePatch();else if(dialogueIndex>=0){dialogueIndex=dialogue.length;advanceDialogue();}else if(mode!=='menu'){persist();openModal('pause');}return;}
  if(key==='KeyQ')scan();if(key==='KeyE')interact();if(key==='KeyR'&&mode==='patch')verify();
  if((key==='KeyM'||key==='Tab')&&mode==='play')openModal('map');
  if(key==='Space'&&mode==='play'&&motor.grounded)audio.cue('jump');
};
window.addEventListener('pointermove',e=>{
  if(eventDrag)eventDrag.element.style.transform=`translateY(${e.clientY-eventDrag.startY}px)`;
  if(sourceDrag) {
    sourceDrag.moved ||=Math.hypot(e.clientX-sourceDrag.x,e.clientY-sourceDrag.y)>8;
    const target=view.pickStation(e.clientX,e.clientY);
    $('patch-nodes').querySelectorAll<HTMLElement>('[data-node]').forEach(button=>button.classList.toggle('drop-target',button.dataset.node===target));
  }
});
window.addEventListener('pointerup',e=>{
  if(eventDrag){const drag=eventDrag;eventDrag=null;let best=0;let d=Infinity;drag.centers.forEach((center,i)=>{if(Math.abs(center-e.clientY)<d){d=Math.abs(center-e.clientY);best=i;}});drag.element.classList.remove('dragging');drag.element.style.transform='';moveEvent(draftOrder.indexOf(drag.action),best);}
  if(sourceDrag){const drag=sourceDrag;sourceDrag=null;if(drag.moved){const target=view.pickStation(e.clientX,e.clientY);if(target){source=drag.node;connect(target);}else renderNodes();}else connect(drag.node);}
});
window.addEventListener('pointercancel',()=>{eventDrag?.element.classList.remove('dragging');if(eventDrag)eventDrag.element.style.transform='';eventDrag=null;sourceDrag=null;input.clear();});
view.renderer.domElement.addEventListener('click',e=>{if(mode==='patch'&&patchCase==='DS-01'){const target=view.pickStation(e.clientX,e.clientY);if(target)connect(target);}});
view.renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();persist();input.clear();audio.setPaused(true);show('boot-error',true);setText('boot-error-detail','图形上下文已被浏览器回收。进度已保存，请重新载入城市。');});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&mode!=='menu'&&mode!=='result'){persist();if(!modalType)openModal('pause');}audio.setPaused(document.hidden||modalType!==null);input.clear();});
window.addEventListener('blur',()=>{if(mode!=='menu'&&mode!=='result'&&!modalType){persist();openModal('pause');}});
window.addEventListener('pagehide',()=>{if(mode!=='menu')persist();});

let previous=performance.now();let accumulator=0;
const STEP=1/60;
function frame(timestamp:number):void {
  requestAnimationFrame(frame);
  const dt=Math.min(.1,Math.max(0,(timestamp-previous)/1000));previous=timestamp;
  const paused=modalType!==null||document.hidden;
  if(!paused) {
    now+=dt;
    if(mode==='play'||mode==='patch')campaign.data.elapsed+=dt;
    if(mode==='play'&&dialogueIndex<0) {
      accumulator+=dt;let steps=0;
      while(accumulator>=STEP&&steps<5){
        if(motor.step(STEP,input.intent(view.yaw)))toast('零号已从最近的安全检查点恢复。',3);
        accumulator-=STEP;steps++;
      }
      if(steps===5)accumulator=0;
      world.hero.group.rotation.y=motor.facing;
      if(motor.speed>1&&now-lastStep>.4&&motor.grounded){audio.cue('step');lastStep=now;}
      if(campaign.data.chapter==='rail'&&motor.position.y>12&&distance(motor.position,STATION_POS.A)<12)motor.setCheckpoint(A_CHECKPOINT);
    } else accumulator=0;
    if(mode==='cinema') {
      const age=now-cinemaStart;
      if(cinemaType==='order') {
        const t=Math.min(1,age/2);world.passenger.group.position.set(5*t,3,-5+13*t);world.bridge.scale.y=Math.min(1,.1+Math.max(0,age-1.7)/1.7);
        if(age>4.6)finishCinema();
      } else if(cinemaType==='recovery') {
        setText('cinema-detail',`当前停靠：${world.trainRoute.join(' → ')} · ${world.trainStation==='B'?'B 站旅客已登车。':'所有执行事件来自同一次回归。'}`);
        if(age>10.5)finishCinema();
      } else {
        motor.warp(world.getTrainRider());
        setText('cinema-detail',`已停靠：${world.trainRoute.join(' → ')}${world.trainRoute.includes('B')?' · 她终于上车了。':''}`);
        if(world.rideDone)showResult();
      }
    }
    if(now>toastUntil)show('toast',false);
    if(now>scanUntil)show('scan-banner',false);
    persistAccumulator+=dt;if(persistAccumulator>6&&mode!=='menu'){persistAccumulator=0;persist();}
  }
  view.render(dt,motor.position,mode==='play'?motor.speed:0,paused||dialogueIndex>=0);
  hudAccumulator+=dt;if(hudAccumulator>.07){hudAccumulator=0;if(mode==='play')updateHud();}
  if(mode==='patch'&&patchCase==='DS-01')positionNodes();
  if(!$('performance').hidden){const stats=view.getDrawStats();setText('performance',`${view.fps} FPS / ${view.frameMs.toFixed(1)} ms\n${stats.calls} draws · ${(stats.triangles/1000).toFixed(1)}k tris`);}
}
applySettings();syncWorld();requestAnimationFrame(frame);
requestAnimationFrame(()=>{show('loading',false);$('app').dataset.ready='true';});

// Read-only production diagnostics; movement and state mutation only exist in development.
const diagnostics=()=>({mode,chapter:campaign.data.chapter,position:{...motor.position},grounded:motor.grounded,elapsed:campaign.data.elapsed,
  attempts:campaign.data.attempts,evidence:[...campaign.data.evidence],rail:structuredClone(campaign.data.rail),order:[...campaign.data.order],
  proof:proof?structuredClone(proof):null,paused:modalType!==null,modal:modalType,bridge:world.bridgeFixed,railFixed:world.railFixed,
  route:[...world.trainRoute],draw:view.getDrawStats(),fps:view.fps,falls:motor.falls,checkpoint:{...motor.checkpoint},audioOn:settings.sound});
Object.defineProperty(window,'__REFLOW__',{value:{snapshot:diagnostics},configurable:false});
if(import.meta.env.DEV) {
  Object.assign(window,{__city:{snapshot:diagnostics,warp:(p:V3)=>motor.warp(p),view,world,motor,campaign:()=>campaign,
    simulate:(seconds:number,intent:{x:number;z:number;jump:boolean;sprint:boolean})=>{for(let i=0;i<seconds*60;i++)motor.step(STEP,intent);},
    checkpoint:(chapter:Chapter)=>{motor.warp(CHECKPOINTS[chapter]);view.yaw=0;},finishCinema,
    setCamera:(yaw:number,pitch=.34)=>{view.yaw=yaw;view.pitch=pitch;}}});
}
if(new URLSearchParams(location.search).has('perf'))show('performance',true);
