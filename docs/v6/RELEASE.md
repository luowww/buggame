# V6.2 三城发布与验收指南

## 发布内容

正式构建：`npm run build` 生成的整个 `dist/`。

- 主页：指针港、脉冲炉、千线程三城，城际往返、晴雨交互、各城修复和结算。
- 第三城：4 主线 + 2 可选故事、逐步回放、任务册、已扫描站台接驳、综合回归与双线列车疏散。
- `/character-card.html`：零号概念设定卡，单独页面。
- `/art/null-zero-concept.png`：原创文字设定对应的 AI 生成概念图。
- `/THIRD_PARTY_NOTICES.txt`：运行时依赖的版权与许可。

不发布 `src`、本地 `qa/viewport.html`、开发传送工具或老版入口。旧项目源码及 `legacy-v5.html` 留在本地供对照。

## 托管

已为本次创建独立的 owner-private Sites 项目，标识保存在 `.openai/hosting.json`。默认访问范围是所有者本人，不更改到公开或共享。

目标地址：https://reflow-404-breakpoint-city-1024.amber-haven-4753.chatgpt.site

目标地址在注册时分配，**仅分配地址不表示发布已经成功**。各版本部署回执保存在本地 `.openai/deployment-v6.2.local` 等忽略文件中；只有相应版本 `status` 为 `succeeded` 才确认部署完成。

使用 Sites 的标准源仓库及打包流程：先完成测试与构建，再提交并推送确切源状态，以同一 commit 生成发布归档，最后保存版本并部署。保留 GitHub origin，并按维护者明确要求同步至 `qing1989620/game-1` 的 main 分支。

## 自行部署到其他静态平台

1. 在 Node 24+ 环境执行 `npm ci`、`npm run release:check`。更改源码后先完成受影响的界面回归和自审，再按开发文档更新封存记录。
2. 将 `dist/` 作为静态发布目录，启用 HTTPS。
3. 首页、`/character-card.html` 与 JS/CSS/PNG 应全部返回 200；不要把整个源码目录当站点根目录。
4. 浏览器执行三城旅程；第三城四主线、两支线、综合回归与实际列车疏散分别检查。验证往返、第二城重玩后第三城续玩、后台暂停、旧存档迁移和手机布局。

`public/_headers` 提供支持该格式的平台可使用的资源类型、引用来源和权限头；实际平台是否应用这些头，需要在该平台的响应中核对。

## 交付范围

当前开放 3 / 8 主城。发布前测试与自审见 [THREAD_REVIEW.md](THREAD_REVIEW.md)。真机移动性能、跨浏览器长时运行、独立玩家试玩与后续内容制作仍需继续；首城及第二城历史基线分别保存在 `QA_REPORT.md`、`FORGE_QA.md`。
