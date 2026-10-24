# 新手图文攻略 · 实机截图

玩家阅读入口：[仓库首页的完整图文玩法](../../README.md)。本目录保存配套的实际运行截图，图片均通过游戏正常界面操作取得，没有使用传送或注入关卡状态。

截图日期：2026-10-24。首城原截图基线为 V6 `332406d`；`10-finish.jpg` 和首页封面已更新到 V6.1 两城版，显示新的城际入口。所有图片使用本地生产构建。工作台的滚动位置因讲解按钮不同。

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
