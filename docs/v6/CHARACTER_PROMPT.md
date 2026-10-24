# 零号 / NULL ZERO · AI 创作记录

工具：内置 `imagegen`，非 CLI、非本地模型。日期：2026-10-24。

输出：`public/art/null-zero-concept.png`。角色卡：`public/character-card.html`。该图为概念设定，并非实机截图。游戏内角色由 `src/game/world.ts` 的 `makeAvatar()` 原创程序化建模；使用断环、胸前红点、深青披风和带三枚环的细针作为共同识别特征。

采用原创设定，没有使用第三方角色图、商标或游戏模型作为参考。已对生成图进行视觉检查：空心断环没有面部，胸前单枚红点，细长工具为针状而非枪械，配色和主要剪影符合本次设定。概念图的材质细节多于当前实机模型，未宣称已完成高精模型导入。

## 最终生成提示词

```text
Use case: stylized-concept. Asset type: original character concept sheet for RE:FLOW 404, an independent 3D browser game. Create a refined landscape character design sheet on a dark petrol blue background (#10272e), warm ivory fine typography, understated technical marks, tasteful empty space. Subject NULL ZERO: a small slender humanoid made of worn titanium and deep teal cloth, head is an EMPTY OPEN CIRCULAR METAL RING with a clear missing segment upper left, absolutely no face inside ring; small amber light edges; a SINGLE tiny glowing vermilion dot on the chest. Trapezoidal long dark teal coat/cape, thin mechanical arms and articulated legs, hands hold a long delicate needle-like causal weaving instrument with three small amber rings, never a gun. Main 3/4 full-body view occupies center right, smaller front and back studies on left. Entire silhouette readable, quiet stubborn gentle personality. Restrained cinematic lighting, hand-painted 3D concept rendering, tactile fabric and brushed metal. Minimal exact text only: 'RE:FLOW 404', 'NULL / ZERO', 'CAUSAL INVESTIGATOR', 'CHARACTER CONCEPT'. Original design; no existing characters, logos, weapons, watermarks; avoid generic armored soldier or cyberpunk neon magenta. This is a concept reference sheet, not a game screenshot. Landscape 3:2 composition.
```

生成结果已复制到项目中，正式角色卡不会依赖 Codex 用户目录中的文件。原始生成结果保留在 Codex 的 generated_images 目录。
