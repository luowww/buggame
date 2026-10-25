import type { SnowCase } from './snow-domain';
export interface SnowLesson { name:string; subtitle:string; description:string; observation:string; story:string; hints:string[] }
export const SNOW_LESSONS:Record<SnowCase,SnowLesson>={
  'WF-02':{name:'驯风天线',subtitle:'01 / WIND, ICE & POWER',description:'天线必须迎风接收，又不能在阵风里折断。调整随风转向、风闸与除冰策略，让三个天气负载都保留至少二十帧。',observation:'固定朝向，风转弯就收不到信。\n风闸常开，强阵风会压弯支架。\n不加热会结冰；持续加热会耗尽电池。',story:'KESTREL：现在风会替我们传信。有人留在这里，不再只是为了等待好天气。',hints:['先解决风向与风速这两个不同的问题。收到足够的消息，也要保住结构和电源。','随风转向；阵风来时关闭风闸。除冰应在需要时才启动。','选择随风转向、阵风关闭，风速阈值设 9，使用恒温除冰，再验证。']},
  'NET-01':{name:'雪中迷路的信',subtitle:'02 / ROUTE AROUND THE STORM',description:'链路会随天气中断。建立可到 D 的路由，为断链准备备路，同时给绕行保留足够跳数。',observation:'默认 A → B → C → A，信在原地打转。\n降雪会切断 B→D；暴风雪还会切断 A→C。\nTTL 让错误终止，但不等于信已经到达。',story:'中继员：你修好的不只是最短路。是原来的路断了，我们还有下一条。',hints:['先把 C 的下一跳从 A 改向 E，再让 E 能去 D，打破默认环路。','晴天的 A→B→D 很短，但风雪时需要经过 C 和 E；下一跳也要做健康检查。','参考：A→B、B→D、C→E、E→D，TTL 设 4，开启健康检查与备用下一跳。先 C 的方案也可通过。']},
  'NET-02':{name:'同一封求救信',subtitle:'03 / RETRY WITHOUT REPEATING',description:'一封信可能抵达几次，回执也可能丢失。保留重传，同时区分两封内容相同的信和不同会话里的同一序号。',observation:'上午第二封信与第一封内容相同。\n下午的序号又从 1 开始。\n收件人已执行，但发送方可能没收到 ACK。',story:'邮局守望者：多出来的副本没有被当成多出来的人。每一份真正的请求，都被认真地算了一次。',hints:['先开启超时重传。去重不能只看正文，也不能只看一个会重复使用的序号。','用会话号和序号识别逻辑消息。丢掉重复业务之后，发送者仍然需要确认。','开启重传，去重键选「会话 + 序号」，勾选「重复副本也返回 ACK」。']},
  'NET-03':{name:'拥塞风墙',subtitle:'04 / MORE IS NOT ALWAYS FASTER',description:'链路容量会突然收缩。平衡窗口、丢弃数量与总耗时，让四十八帧消息按预算穿过风墙。',observation:'固定大窗口不断压满窄口。\n窗口缩到 1 虽然不丢包，却超过时限。\n刚失败就拥回来的重试副本，还会抢占下一轮容量。',story:'风墙调度员：你没有让每一封信都争第一。你让它们都还有机会抵达。',hints:['既不能一直发送上限，也不能永远缩到最小。容量会在中途改变。','成功时缓慢增窗，拥塞时减半；失败后给共享链路一个退避窗口。','将窗口上限设 12，开启「成功加一、丢包减半」和「失败后退避」。上限 6 也是可验证的另一种方案。']},
  'NET-04':{name:'四塔不同步',subtitle:'05 / ORDER WITHOUT A SHARED CLOCK',description:'四塔收件次序不同，墙钟也相互错开。为已知的六条消息建立尊重因果、四塔一致的本轮提交顺序。',observation:'A 的墙钟快，B 的墙钟慢。\nC1 必须在 A2、B1 之后；B2 又依赖 C1。\n同时的 A1 与 B1 还需要共同的平局规则。',story:'观测员：我们的钟仍然不同。但我们终于能讲述同一段发生过的事。',hints:['墙上的时间数字不能证明因果关系。先比较事件带着的前因。','选择逻辑时钟。同一逻辑时间用节点编号排序，并等这一批消息收齐再提交。','逻辑时间 + 节点编号 + 收齐本轮六条消息。此关使用已知批次屏障，不把时间戳当作真实网络共识。']},
  'NET-S1':{name:'过期的地址',subtitle:'SIDE 01 / AN ANSWER IS NOT THE RIGHT ADDRESS',description:'旧站点还会回应，但那里已经没有你要找的服务。更新地址记录，再考虑新站点也失联的情况。',observation:'R1 缓存到第 8 周期过期，之后却仍能回应。\n新服务迁到 R2；风暴可能再切断 R2。\nR3 是同一代服务的备用地址。',story:'旧站值守员：谢谢你记得，我们搬走以后，也应该有一个能找到我们的新地址。',hints:['能回应不代表是正确的服务。先看缓存的有效期和服务代次。','刷新记录、尊重 TTL，再探测候选站点是否存活。','三个开关都开启：刷新地址、尊重缓存有效期、探测并选择可用站点。']},
  'NET-S2':{name:'破损的雪花',subtitle:'SIDE 02 / DETECT, DISCARD, RECOVER',description:'风雪改变了数据位。选择能发现本关损坏模式的校验，还要让发现错误后仍有恢复交付的路径。',observation:'20,30 可能被改成 21,29，简单求和不变。\n只检测并丢弃，信件仍然会缺失。\n本关第二次重发可获得原始帧。',story:'修复员：有些伤痕很小，合在一起甚至看不出差别。但它们也值得被发现。',hints:['不要只看总和有没有变化。两个字节可以一增一减。','使用 CRC-8 检测这些位错误，并对损坏副本请求重传。','选择 CRC-8（多项式 0x07），开启「丢弃坏副本并请求重发」。']},
  'NET-S3':{name:'失联与归来',subtitle:'SIDE 03 / DO NOT CONFUSE SILENCE WITH FAILURE',description:'一次噪声不代表主站死去，一次回应也不代表已经恢复。等待连续证据，接管后阻止旧权限写回。',observation:'短风墙会连续丢失两次心跳。\n真正失联时必须在第 8–12 周期接管。\n第 20 周期仅短暂回应；旧主站的写入会在第 13 周期迟到。',story:'备用站：接过一个人的位置，需要耐心。把位置还回去，也一样。',hints:['缺失阈值太小会误接管；恢复阈值太小会在抖动中反复切换。','缺失至少三次再判断，恢复至少连续两次；用 epoch 拒绝旧主站的迟到写入。','缺失阈值 3、恢复阈值 2，开启代次栅栏。模型检验有限心跳轨迹，不声称完美区分真实网络分区。']},
};
export interface SnowControl { key:string; label:string; hint?:string; kind:'select'|'check'|'range'; options?:{value:string;label:string}[]; min?:number;max?:number }
const options=(pairs:string[][])=>pairs.map(([value,label])=>({value,label}));
export const SNOW_CONTROLS:Record<SnowCase,SnowControl[]>={
  'WF-02':[
    {key:'alignment',label:'天线朝向',kind:'select',options:options([['fixed','固定朝向'],['vane','随风转向']])},
    {key:'shutter',label:'风闸策略',kind:'select',options:options([['open','持续敞开'],['gust','强阵风时关闭']])},
    {key:'cutoff',label:'风速关闭阈值',hint:'风速超过这个值时避风；设得过低会错过接收窗口。',kind:'range',min:7,max:15},
    {key:'heater',label:'除冰加热',kind:'select',options:options([['off','关闭加热'],['always','持续加热'],['thermostat','恒温除冰 · 按需启动']])},
  ],
  'NET-01':[
    ...(['A','B','C','E'] as const).map(key=>({key,label:`${key} 的首选下一跳`,kind:'select' as const,options:options((key==='A'?['B','C']:key==='B'?['C','D']:key==='C'?['A','E']:['B','D']).map(value=>[value,`${key} → ${value}`]))})),
    {key:'ttl',label:'初始 TTL / 路由生存跳数',hint:'源站发出时保留初始值；中继站转发前减一，TTL≤1 时停止转发。',kind:'range',min:1,max:10},
    {key:'fallback',label:'健康检查与备用下一跳',hint:'首选链路不可用时，使用该节点的另一个合法邻居。',kind:'check'},
  ],
  'NET-02':[
    {key:'retry',label:'保留超时重传',kind:'check'},
    {key:'key',label:'以什么识别同一封逻辑信？',kind:'select',options:options([['none','不去重'],['payload','信件正文'],['sequence','序号'],['session','会话 + 序号']])},
    {key:'ackDuplicates',label:'重复副本也返回 ACK',hint:'业务不会重复执行，但发送者仍要知道已经送达。',kind:'check'},
  ],
  'NET-03':[
    {key:'window',label:'窗口上限 / 每轮最多发送',kind:'range',min:1,max:16},
    {key:'adaptive',label:'成功加一、丢包减半',hint:'根据观测调整当前窗口，不总是用上限发包。',kind:'check'},
    {key:'backoff',label:'失败后退避',hint:'上一轮溢出后等待 2 周期，让共享链路里的重试副本退去。',kind:'check'},
  ],
  'NET-04':[
    {key:'clock',label:'事件排序依据',kind:'select',options:options([['wall','各塔墙钟'],['lamport','Lamport 逻辑时间']])},
    {key:'tie',label:'相同时间如何打破平局？',kind:'select',options:options([['arrival','本塔收到的先后'],['node','统一按节点编号']])},
    {key:'barrier',label:'收齐本轮六条消息，再提交',hint:'本关的批次大小已知，等待边界内的全部消息。',kind:'check'},
  ],
  'NET-S1':[
    {key:'refresh',label:'刷新权威地址记录',kind:'check'},
    {key:'respectTTL',label:'尊重缓存有效期',kind:'check'},
    {key:'probe',label:'探测并选择可用站点',kind:'check'},
  ],
  'NET-S2':[
    {key:'algorithm',label:'帧校验方式',kind:'select',options:options([['none','不校验'],['sum8','8 位字节求和'],['crc8','CRC-8 / 0x07']])},
    {key:'retryCorrupt',label:'丢弃坏副本并请求重发',kind:'check'},
  ],
  'NET-S3':[
    {key:'misses',label:'连续缺失几次才接管？',kind:'range',min:1,max:5},
    {key:'recovery',label:'连续成功几次才归还？',kind:'range',min:1,max:3},
    {key:'fencing',label:'用代次栅栏拒绝旧权限',hint:'当前 epoch 与请求不一致时，拒绝旧主站的迟到写入。',kind:'check'},
  ],
};
