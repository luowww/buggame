# 新手图文攻略 · 实机截图

玩家阅读入口：[仓库首页的完整图文玩法](../../README.md)。本目录保存配套的实际运行截图，图片均通过游戏正常界面操作取得，没有使用传送或注入关卡状态。

截图日期：2026-10-24。首城原截图基线为 V6 `332406d`；`10-finish.jpg` 和首页封面已更新到 V6.1 两城版，显示新的城际入口。所有图片使用本地生产构建。工作台的滚动位置因讲解按钮不同。

当前游戏为 V6.3 四城版。前三城图片保留各自验收时的历史版本；旧截图中 2/8、3/8 的计数不表示当前开放数量。第四城的图文与最终四城地图在 `snow/`，详见下表。

| 文件 | 说明 |
| --- | --- |
| [01-mira-interact.jpg](01-mira-interact.jpg) | 靠近 MIRA，出现对话提示 |
| [02-event-order-before.jpg](02-event-order-before.jpg) | 事件排序的错误初始状态 |
| [03-event-order-solved.jpg](03-event-order-solved.jpg) | 调整为先撤离、再移除、再归档，露出验证按钮 |
| [04-station-a-scan.jpg](04-station-a-scan.jpg) | 从维修桥与坡道走到高架 A 站，完成扫描 |
| [05-rail-before.jpg](05-rail-before.jpg) | A→C→END 跳过 B 的现场 |
| [06-rail-solved.jpg](06-rail-solved.jpg) | 上排源 A、下排目标 B，候选方案 A.next→B |
| [07-loop-error.jpg](07-loop-error.jpg) | 实际提交 A→A 后产生的循环反例 |
| [08-board-train.jpg](08-board-train.jpg) | 修复后还需要按 E 登上返航列车 |
| [09-checkpoint.jpg](09-checkpoint.jpg) | 暂停菜单和回到检查点选项 |
| [10-finish.jpg](10-finish.jpg) | 沿实际修复路线返航后完成结算 |

首页封面与初始操作总览复用仓库 `artifacts/` 中已有的 V6 实机截图。角色概念图不用于说明游戏操作。

V6.1 第二城截图保存在 `forge/`：入城、天气保电报告、ZERO 反例、CARRY 接线与回归、实际升降、同一全景的晴天/雨天、八城规划地图，以及 390×844 下的天气台、接线和通关。均由正常交互取得；第一城与第二城的开发传送钩子未用于拍摄。

V6.2 第三城截图日期为 2026-10-25，保存在 `thread/`。全部来自本地生产构建与正常游戏操作；任务册中的已扫描站台接驳属于正式玩法。没有注入存档、调用隐藏传送或开发完成钩子。

| 文件 | 说明 |
| --- | --- |
| [02-deadlock-error.jpg](thread/02-deadlock-error.jpg) | 相反锁序的真实等待环反例 |
| [03-lock-order.jpg](thread/03-lock-order.jpg) | 共同先 B 的替代解与受控重启 |
| [04-journal.jpg](thread/04-journal.jpg) | 六关任务册、任务阶段与导航 |
| [05-aging.jpg](thread/05-aging.jpg) | 老化间隔与三种背景优先级回归 |
| [06-spurious-wakeup.jpg](thread/06-spurious-wakeup.jpg) | 重新检查条件后安全放行 |
| [07-lost-update.jpg](thread/07-lost-update.jpg) | 分离读写导致丢票的交错 |
| [08-counter-mutex.jpg](thread/08-counter-mutex.jpg) | 互斥区有效替代解 |
| [09-double-shadow.jpg](thread/09-double-shadow.jpg) | CAS 独占权限回归 |
| [10-memory-error.jpg](thread/10-memory-error.jpg) | FIFO 超过缺页预算 |
| [11-memory-lru.jpg](thread/11-memory-lru.jpg) | LRU 三负载回归与执行日志 |
| [12-evacuation.jpg](thread/12-evacuation.jpg) | 实际双线列车返航中的城市 |
| [13-complete-rain.jpg](thread/13-complete-rain.jpg) | 雨天六关结算 |
| [14-complete-sun.jpg](thread/14-complete-sun.jpg) | 晴天六关结算 |
| [15-mobile-complete.jpg](thread/15-mobile-complete.jpg) | 390×844 完成界面 |
| [16-mobile-journal.jpg](thread/16-mobile-journal.jpg) | 手机任务册滚动与固定关闭入口 |
| [17-mobile-counter.jpg](thread/17-mobile-counter.jpg) | 手机原子提交与执行回放 |
| [18-mobile-memory.jpg](thread/18-mobile-memory.jpg) | 手机内存策略、回放与固定验证按钮 |
| [19-city-map.jpg](thread/19-city-map.jpg) | 三城往返与其余五城规划标识 |

V6.3 第四城截图日期为 2026-10-25，保存在 `snow/`。全部来自生产构建的正常操作：亲自走到新设施扫描、使用原生工作台、已扫描站点的正式雪地车接驳、WASD/F 穿越三站。没有注入存档或调用开发传送钩子。带性能小窗的早期验收图显示实际渲染读数；最终封面和手机图已移除该调试显示。手机图是 390×844 浏览器视口验收。

| 文件 | 说明 |
| --- | --- |
| [01-snowfield.jpg](snow/01-snowfield.jpg) | 第四城水平雪原、锈红天线与雪地车 |
| [02-blizzard.jpg](snow/02-blizzard.jpg) | 暴风雪环境 |
| [03-survey.jpg](snow/03-survey.jpg) | 初入雪原的阶段门与未开放站点 |
| [04-wind-error.jpg](snow/04-wind-error.jpg) | 天线持续加热造成断供的反例 |
| [05-wind-proof.jpg](snow/05-wind-proof.jpg) | 风向、风闸、恒温除冰的三天气报告 |
| [06-route-boundary.jpg](snow/06-route-boundary.jpg) | TTL 太短时暴风绕行失败 |
| [07-route-proof.jpg](snow/07-route-proof.jpg) | A 首选 C 的有效替代路由 |
| [08-discovery.jpg](snow/08-discovery.jpg) | 地址、缓存有效期与健康站点 |
| [09-reliable-error.jpg](snow/09-reliable-error.jpg) | 指出具体重复/缺失逻辑信的报告 |
| [10-reliable-proof.jpg](snow/10-reliable-proof.jpg) | 重传、会话序号去重与重复 ACK |
| [11-checksum-proof.jpg](snow/11-checksum-proof.jpg) | CRC-8 与损坏重传 |
| [12-congestion-error.jpg](snow/12-congestion-error.jpg) | 固定大窗口的丢弃与耗时反例 |
| [13-congestion-proof.jpg](snow/13-congestion-proof.jpg) | 上限 12、自适应与退避通过三负载 |
| [14-clock-error.jpg](snow/14-clock-error.jpg) | 逻辑时间缺少统一平局规则仍不一致 |
| [15-clock-proof.jpg](snow/15-clock-proof.jpg) | 四塔在已知批次内取得共同因果顺序 |
| [16-storm-protocol.jpg](snow/16-storm-protocol.jpg) | 五系统回归开启风暴投递 |
| [17-whiteout-crossing.jpg](snow/17-whiteout-crossing.jpg) | 第一段冰桥的正常稳身步行 |
| [18-handoff-checkpoint.jpg](snow/18-handoff-checkpoint.jpg) | 第一站交接后重载，恢复同一检查点 |
| [19-west-crossing.jpg](snow/19-west-crossing.jpg) | 第二段向西横穿峡谷 |
| [20-observatory-approach.jpg](snow/20-observatory-approach.jpg) | 第三段向北抵达极光观测站 |
| [21-main-ending.jpg](snow/21-main-ending.jpg) | 五主线与三交接完成、支线尚有一条未完成 |
| [22-heartbeat-proof.jpg](snow/22-heartbeat-proof.jpg) | 通关后完成心跳/恢复/代次栅栏支线 |
| [23-complete-sun.jpg](snow/23-complete-sun.jpg) | 最终 5/5、3/3、3/3 晴霁结局 |
| [24-complete-blizzard.jpg](snow/24-complete-blizzard.jpg) | 同一结局镜头切换暴风雪 |
| [25-survey-complete.jpg](snow/25-survey-complete.jpg) | 八关全收集勘测册 |
| [26-mobile-survey.jpg](snow/26-mobile-survey.jpg) | 手机完整路线与单列勘测卡片 |
| [27-mobile-workbench.jpg](snow/27-mobile-workbench.jpg) | 手机滚动报告与固定验证入口 |
| [28-mobile-ending.jpg](snow/28-mobile-ending.jpg) | 手机结算的所有操作均可滚动到达 |
| [29-four-cities.jpg](snow/29-four-cities.jpg) | 重玩第三城时第四城资格仍保留；其余四城规划 |
