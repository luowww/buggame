# 素材来源与许可（ASSET LICENSES）

更新：2026-10-24

## 总原则

本页以 V6 正式入口为准。城市、实机角色、纹理、界面与声音由原创代码生成；独立角色卡使用本次生成的 AI 概念图。没有下载第三方游戏模型、音乐或字体。

| 类别 | 实现 | 来源 |
| --- | --- | --- |
| 三维指针港、站台、轨道、列车、窗格与地面纹理 | Three.js 几何、实例化和 CanvasTexture（`src/game/world.ts`） | 原创代码 |
| 零号及 NPC | 断环、外骨骼、披风和因果织针的程序化低多边形模型（`makeAvatar`） | 原创设定与建模代码 |
| 雨与港口水面 | 原创 GLSL 与种子化缓冲几何（`src/game/world.ts`） | 原创代码 |
| 音乐与交互反馈 | Web Audio 实时合成，故障/恢复编曲（`src/game/audio.ts`） | 原创合成 |
| 字体 | 系统字体栈（PingFang SC / Microsoft YaHei / monospace），无外嵌字体 | 系统自带 |
| 图标 favicon | 内联 SVG data URI | 原创 |
| V6 角色概念图 | `public/art/null-zero-concept.png` | 内置 imagegen，本次原创提示词生成；完整记录在 `docs/v6/CHARACTER_PROMPT.md` |
| V5 角色卡及旧页面 | `docs/character-card/zero-four.svg`、`legacy-v5.html` | 历史原创素材；不作为 V6 实机画面 |

## 第三方依赖

运行时依赖 Three.js 0.186.1（MIT），包括其 RoundedBoxGeometry 附加几何工具。开发工具使用 Vite 8.3.5（MIT）、Vitest 5.0.5（MIT）、TypeScript 5.6.3（Apache-2.0）、Playwright（Apache-2.0）及 @types/three（MIT）。精确安装树记录在 `package-lock.json`，依赖版权声明保留于软件包和正式分发的 `THIRD_PARTY_NOTICES.txt`。

## AI 工具使用记录

- 设计与编程：Codex 按用户提供的 V6 设计包实现指针港与脉冲炉，包含独立领域模拟、3D 场景、交互、音频与测试。新增铜色金属、甲板、集电阵列、云层、雨线、蒸汽和八位塔均为程序几何、Canvas 纹理或着色器，没有新增第三方美术下载。
- 角色：内置 imagegen 生成概念设定图；当前实机模型为代码建模，并未将概念渲染冒充游戏截图。
- 运行时不调用任何网络 API / 云端模型。
