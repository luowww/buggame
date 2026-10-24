# 素材来源与许可（ASSET LICENSES）

更新：2026-10-24

## 总原则

本作**零外部素材**：无图片、无音频文件、无第三方字体文件。

| 类别 | 实现 | 来源 |
| --- | --- | --- |
| 网页世界（标题/按钮/卡片平台、地面、墙） | 真实 HTML 元素 + CSS（`src/styles/main.css`） | 原创代码 |
| 主角零四 + 清理波 + 粒子 | Canvas 2D 程序化逐帧绘制（`src/effects/CharacterRenderer.ts`） | 原创代码 |
| 音效（纸张滑动/陶瓷吸附/boop 弹跳/清理波低频呼吸/胜利和弦） | Web Audio 振荡器 + 噪声实时合成（`src/ui/AudioManager.ts`） | 原创合成 |
| 字体 | 系统字体栈（PingFang SC / Microsoft YaHei / monospace），无外嵌字体 | 系统自带 |
| 图标 favicon | 内联 SVG data URI | 原创 |
| 角色设定图 | `docs/character-card/zero-four.svg` 代码绘制 | 原创 |

## 第三方依赖

仅构建工具链：`vite@5.4.11`、`typescript@5.6.3`、`vitest@2.1.8`（均 MIT 许可，版本锁定于 package-lock.json）。**运行时零依赖**——生产包 gzip 仅 ~12KB。

## AI 工具使用记录

- 设计与编程：AI 编程协作工具（Codex 类）按《RE:FLOW 404 总纲 v3》执行，含纯逻辑引擎、DOM 物理桥、自动化测试。
- 角色：依总纲提示词方案设计，以程序化绘制落地（见 CHARACTER_CARD.md 第 ④ 节，如实标注）。
- 运行时不调用任何网络 API / 云端模型。
