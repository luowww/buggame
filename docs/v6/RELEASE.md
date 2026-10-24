# V6.1 两城发布与验收指南

## 发布内容

正式构建：`npm run build` 生成的整个 `dist/`。

- 主页：指针港与脉冲炉两城、城际往返、晴雨交互、各城修复和结算。
- `/character-card.html`：零号概念设定卡，单独页面。
- `/art/null-zero-concept.png`：原创文字设定对应的 AI 生成概念图。
- `/THIRD_PARTY_NOTICES.txt`：运行时依赖的版权与许可。

不发布 `src`、本地 `qa/viewport.html`、开发传送工具或老版入口。旧项目源码及 `legacy-v5.html` 留在本地供对照。

## 托管

已为本次创建独立的 owner-private Sites 项目，标识保存在 `.openai/hosting.json`。默认访问范围是所有者本人，不更改到公开或共享。

目标地址：https://reflow-404-breakpoint-city-1024.amber-haven-4753.chatgpt.site

目标地址在注册时分配，**仅分配地址不表示发布已经成功**。最终部署回执保存在本地 `.openai/deployment.local`；只有其中 `status` 为 `succeeded` 才确认发布完成。聊天最终交付也会如实报告这一状态。

使用 Sites 的标准源仓库及打包流程：先完成测试与构建，再提交并推送确切源状态，以同一 commit 生成发布归档，最后保存版本并部署。保留 GitHub origin，并按维护者明确要求同步至 `qing1989620/game-1` 的 main 分支。

## 自行部署到其他静态平台

1. 在 Node 24+ 环境执行 `npm ci && npm test && npm run build`。
2. 将 `dist/` 作为静态发布目录，启用 HTTPS。
3. 首页、`/character-card.html` 与 JS/CSS/PNG 应全部返回 200；不要把整个源码目录当站点根目录。
4. 浏览器执行指针港修复→返航→城际列车→天气供电→登塔→进位修复→升降台→第二城结算，检查往返、重玩、后台暂停和旧存档迁移。

`public/_headers` 提供支持该格式的平台可使用的资源类型、引用来源和权限头；实际平台是否应用这些头，需要在该平台的响应中核对。

## 交付范围

当前开放 2 / 8 主城。真机移动性能、跨浏览器长时运行、独立玩家试玩与后续内容制作仍需继续。已执行项与限制见 `FORGE_QA.md`，首城历史基线见 `QA_REPORT.md`。
