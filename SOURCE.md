# 来源与署名（SOURCE & ATTRIBUTION）

本仓库是 [RE:FLOW 404《断点之城》](https://github.com/qing1989620/game-1) 的**衍生仓库**，由 [luowww](https://github.com/luowww) 维护，用于黑客松参赛项目的持续开发。

## 原作

| 项 | 内容 |
| --- | --- |
| 项目 | RE:FLOW 404《断点之城》 |
| 原作者 | **YongBo Chen** — [@qing1989620](https://github.com/qing1989620) |
| 原仓库 | <https://github.com/qing1989620/game-1> |
| 原作提交历史 | `0c4df86` … `a8b36b0`（V6.3 四城版） |

原作的**游戏设计、全部代码、程序化美术、音频与文档**均由 YongBo Chen 创作。原作仓库未附带 LICENSE 文件，其 `THIRD_PARTY_NOTICES.txt` 仅声明第三方依赖（three.js 等）的许可。视觉资产、角色设定、世界观与关卡设计均属原作作者。

本仓库**完整保留**原作的全部代码与素材，仅在其之上追加少量改动（见下）。未经原作者书面许可，不得将本仓库的代码或素材用于商业分发。

## 本仓库的改动

相对原作 `a8b36b0`（V6.3）的全部增量：

| 改动 | 说明 |
| --- | --- |
| `src/game/coach.ts` | 上下文引导的纯逻辑层。按当前城市与实时进度给出唯一下一步动作（按哪个键、做什么、为什么），四城各自适配。 |
| `src/game/main.ts` | 接入引导卡；首次进入的上手说明；菜单「怎么玩？」入口。 |
| `src/game/ui.css` | 引导卡与上手说明的样式。 |
| `index.html` | 引导卡与上手说明的 DOM。 |
| `tests/coach.test.ts` | 13 项引导测试。 |
| `e2e/` | 5 个 Playwright 端到端脚本（桌面完整一局、移动端视口、触控热区、四城引导、自动截图）。 |
| `README.md`、`docs/v6/DEVELOPMENT.md` | 引导功能的说明。 |

**未改动**任何玩法规则、领域模型、关卡内容或美术资产。`src/game/domain.ts`、`forge-domain.ts`、`thread-domain.ts`、`snow-domain.ts` 等权威模型保持原作原样。

## 第三方依赖

运行时与开发依赖的许可见 `public/THIRD_PARTY_NOTICES.txt`（three.js MIT、Vite MIT、Vitest MIT、TypeScript Apache-2.0、Playwright Apache-2.0）。运行时不调用任何网络 API 或云端模型。

## AI 工具使用记录

沿用原作的记录（见 `docs/ASSET_LICENSES.md`）：

- 原作的设计与编程由 Codex 在 YongBo Chen 提供的设计包基础上实现。
- 角色概念图由内置 imagegen 生成；实机模型为代码建模，未将概念渲染冒充游戏截图。
- 本仓库追加的引导功能同样由 AI 辅助实现，并经完整测试与人工审阅。
