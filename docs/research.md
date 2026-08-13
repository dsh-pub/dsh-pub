# 面向人类与 AI 编码代理的 `DESIGN.md` 研究

- **检索日期：** 2026-07-22
- **研究问题：** 一个能长期约束人类设计者、工程师和 AI 编码代理的高质量 `DESIGN.md` 应写什么、不应写什么？
- **范围：** 文档目的、章节结构、token 与规范的职责边界、Web/iOS 跨平台表达、组件状态、无障碍、内容语言、反模式、维护与版本治理。
- **证据口径：** 优先采用规范、平台所有者文档、官方设计系统和官方仓库。本文把“事实”“推断”“对本模板的建议”“尚未验证项”分开陈述；链接尽量就近放在所支持的结论旁。

## 执行摘要

1. **`DESIGN.md` 应是决策与语义契约，不是样式值的第二份副本。** Google Labs 的 alpha 规范把它定义为供人类与 AI 跨会话共同理解和修订的纯文本设计系统，机器可读 token 给出规范值，正文提供应用理由；DTCG 则只定义工具间交换 token 的格式。[Google Labs `DESIGN.md` format](https://github.com/google-labs-code/design.md/blob/main/docs/spec.md)；[DTCG Design Tokens Format Module 2025.10](https://www.designtokens.org/TR/2025.10/format/)
2. **人类和代理都需要显式的“真实来源地图”。** 文档必须逐项声明：哪份文件拥有 token 值，哪份文档拥有设计原则，哪套平台组件拥有原生行为，哪份测试结果证明当前实现。不能让代理凭最近出现的代码块猜权威来源。
3. **跨平台统一的是语义、任务、内容和质量底线，不是像素与控件外观。** Apple 要求产品适应平台约定、尺寸和显示环境；Material 3 的实现同样由平台主题、组件和交互状态承载。[Apple HIG](https://developer.apple.com/design/human-interface-guidelines)；[Material 3 in Compose](https://developer.android.com/develop/ui/compose/designsystems/material3)
4. **组件规范必须以状态和行为为中心。** Carbon 的组件文档把用途、禁用场景、变体、状态、鼠标/键盘交互、响应行为和无障碍测试状态放在一起；Google Labs 的格式也把按钮、选择控件、输入和不同状态列入组件章节。[Carbon Tabs](https://carbondesignsystem.com/components/tabs/usage/)；[Google Labs components section](https://github.com/google-labs-code/design.md/blob/main/docs/spec.md#components)
5. **“使用了设计系统组件”不等于产品已经无障碍。** USWDS 明确说明其组件只是基础，项目仍需自行做页面级研究和测试；因此 `DESIGN.md` 应记录验收方法和已验证范围，而不是笼统写“符合 WCAG”。[USWDS Accessibility](https://designsystem.digital.gov/documentation/accessibility/)
6. **文档要短到代理会读、严谨到人类可审查，并通过版本与弃用信息演进。** Hallmark 把 `design.md` 视为用户确认后的显式锁定步骤，建议保持紧凑、后续运行优先读取、差异通过 variants 演进；DTCG 和 Atlassian 都提供弃用语义。[Hallmark `design-md.md`](https://github.com/Nutlope/hallmark/blob/main/skills/hallmark/references/design-md.md)；[Atlassian release phases](https://atlassian.design/release-phases)

## 结论的证据边界

### 已确认事实

- Google Labs 的 `DESIGN.md` 规范明确面向 coding agents，采用可选 YAML frontmatter 加 Markdown 正文；前者提供机器可读 token，后者提供人类可读的设计理由与应用指导。当前版本标为 `alpha`，组件结构仍在演进。[Google Labs `DESIGN.md` format](https://github.com/google-labs-code/design.md/blob/main/docs/spec.md)
- DTCG 2025.10 是 Design Tokens Community Group 发布的稳定 Candidate Recommendation，**不是 W3C Recommendation，也不在 W3C Standards Track 上**；其规范对象是设计 token 的 JSON 交换格式。[DTCG 规范状态与摘要](https://www.designtokens.org/TR/2025.10/format/)
- DTCG token 必须能确定类型；工具不能根据值猜类型。规范支持 `$description`、别名/引用、分组、`$deprecated` 和供应商扩展。[DTCG token 与 group 定义](https://www.designtokens.org/TR/2025.10/format/#design-token)
- Atlassian 将 token 描述为命名和存储 UI 决策的单一真实来源，并要求按含义选择 token，而不是按当前颜色“看起来相同”来选择。[Atlassian design tokens](https://atlassian.design/foundations/tokens/design-tokens/)
- Apple 建议优先采用平台约定，并让界面适应方向、Dark Mode、Dynamic Type 等系统配置；iOS/iPadOS 的默认控件尺寸为 `44×44 pt`，其跨平台表格另列各平台默认和最小尺寸。[Apple Designing for iOS](https://developer.apple.com/design/human-interface-guidelines/designing-for-ios)；[Apple Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)
- Carbon 的组件资料把视觉状态、交互语义、内容与无障碍放在组件上下文中，而不是只列颜色和尺寸。[Carbon Link](https://carbondesignsystem.com/components/link/usage/)；[Carbon Tabs](https://carbondesignsystem.com/components/tabs/usage/)
- WCAG 2.2 要求可见键盘焦点、可操作的键盘路径、可识别的状态消息等；AA 的指针目标最小标准是 `24×24 CSS px`（允许规范列出的例外），`44×44 CSS px` 是增强级 AAA 标准。[WCAG 2.2](https://www.w3.org/TR/WCAG22/)

### 最直接的现有格式参照

Google Labs 的官方规范是本次发现中与问题最直接对应的一手资料：它把 `DESIGN.md` 定义为视觉身份的 living source of truth，规定 Overview、Colors、Typography、Layout、Elevation & Depth、Shapes、Components、Do's and Don'ts 的顺序，并要求消费者保留未知章节；这使格式可以渐进扩展。[Google Labs specification](https://github.com/google-labs-code/design.md/blob/main/docs/spec.md)

它仍不能直接成为本模板的最终答案：其 alpha schema 主要覆盖颜色、排版、圆角、间距和有限的组件属性，尺寸单位面向 Web，组件规范也明确仍在演进。**推断：** 本模板可以兼容其“结构化 token + 解释性正文 + 保留未知内容”思想，但必须另外补充平台映射、无障碍、内容语言、状态行为和治理；如果 `tokens.css` 保持权威来源，就不应再在 frontmatter 手写第二套值。

### 从事实得到的推断

- 单个 Markdown 文件无法同时成为“设计意图、所有 token 值、Web CSS、SwiftUI 实现、测试结果”的可靠真实来源。让它成为**索引和契约**，再链接到机器可验证的实现文件，更能避免复制与漂移。
- 跨平台 token 应优先表达角色，例如“主要操作背景”“危险文本”“正文层级”，而不是表达平台实现，例如 `blue-500`、`14px` 或 `UIButtonBlue`。平台适配器再把角色映射到 CSS、SwiftUI 或系统动态颜色。
- 固定的“八状态清单”可作为审查提示，但不应机械套给每个组件。按钮需要 pressed/loading，文本输入需要 invalid/read-only，标签页需要 selected，链接可能需要 visited；状态集合必须由组件语义决定。
- AI 代理尤其需要禁止项、冲突优先级、允许修改范围和验收命令。只给审美形容词会迫使代理自行补全，产出最容易回到通用模板。

## `DESIGN.md` 的目的与非目标

### 应承担的职责

`DESIGN.md` 应让新的协作者或代理在开始实现前，用一次顺序阅读回答以下问题：

1. 产品为谁解决什么任务，界面应该传达怎样的明确气质？
2. 哪些原则和约束不可随页面临时改变？
3. 哪些文件分别是 token、组件实现、图标、内容和测试证据的真实来源？
4. Web 与 iOS 共享什么，又在哪些地方遵循平台约定？
5. 一个组件在各状态、输入方式、尺寸和内容条件下如何工作？
6. 什么算完成，什么必须通过人工或自动验证？
7. 如何提出变体、弃用旧决策并迁移，而不在局部偷偷覆盖？

Hallmark 的官方规则把 `design.md` 定义为“显式锁定后的便携设计系统”，后续运行先读取它，并让页面共享系统而非继续随机多样化。[Hallmark `design-md.md`](https://github.com/Nutlope/hallmark/blob/main/skills/hallmark/references/design-md.md) 这证明轻量、代理可读取的项目级设计记忆是可行模式，但并不证明 Hallmark 的具体格式是通用标准。

### 不应承担的职责

- 不复制 `tokens.css`、DTCG JSON、Swift 资源或组件源码中的全部值。
- 不取代 Apple HIG、WCAG、ARIA 或平台 API 文档；应声明采用的基线并链接原文。
- 不充当页面规格、产品需求文档、组件 API 参考和验收报告的混合仓库。
- 不记录尚未验证却写成事实的对比度、设备覆盖、用户偏好或业务指标。
- 不把个人审美偏好包装成不可讨论的普遍规律。

## 推荐章节结构

以下结构按代理的读取顺序设计，核心文档应保持紧凑；组件很多时，把详细矩阵拆到 `design/components/`，由 `DESIGN.md` 建立索引。

### 1. 文档状态

- 状态：草案、试用、稳定、拟弃用、已弃用。
- 负责人或评审角色。
- 最近复核日期、适用版本、变更记录链接。
- 适用平台和明确不在范围内的平台。
- 冲突优先级，例如：用户任务与安全要求 → 平台无障碍要求 → 本文稳定决策 → 原型示例。

Atlassian 区分 Early Access、Beta、General Availability、Intent to Deprecate 和 Deprecated，并说明稳定性及破坏性变更预期。[Atlassian release phases](https://atlassian.design/release-phases) 这类状态比含糊的“最新版”更适合人类和代理判断能否采用。

### 2. 产品与设计意图

- 目标用户、核心任务、使用环境。
- 三到五条可执行原则，每条附“因此我们会/不会”。
- 视觉与交互北极星：具体到层级、密度、节奏和品牌辨识方式。
- 非目标与禁用模式。
- 真实内容样例；未确认的数据一律标记为占位。

USWDS 把“从真实用户需要出发”设为设计原则，并要求以真实用户检验假设。[USWDS Design principles](https://designsystem.digital.gov/design-principles/) Hallmark 同样禁止虚构指标、客户证明和数据。[Hallmark `SKILL.md`](https://github.com/Nutlope/hallmark/blob/main/skills/hallmark/SKILL.md)

### 3. 真实来源地图

Google Labs 允许直接在 frontmatter 内嵌规范 token，而 Hallmark 把 `tokens.css` 设为 token 值来源。[Google Labs spec](https://github.com/google-labs-code/design.md/blob/main/docs/spec.md)；[Hallmark `design-md.md`](https://github.com/Nutlope/hallmark/blob/main/skills/hallmark/references/design-md.md) 两种模型都成立，关键是一个项目只能明确选一个上游。建议使用责任表，而不是反复写“唯一真实来源”：

| 信息                       | 权威来源                      | `DESIGN.md` 中保留什么     | 如何验证                 |
| -------------------------- | ----------------------------- | -------------------------- | ------------------------ |
| 设计意图、原则、跨平台语义 | `design/DESIGN.md`            | 决策、边界、映射           | 设计评审                 |
| Web token 值               | `design/tokens.css`           | 分类、命名规则、链接       | 解析 CSS、自定义属性检查 |
| iOS token 值               | 未来的生成资源或 Swift 适配层 | 语义映射，不复制值         | 编译与快照/界面检查      |
| 组件行为                   | 组件规范和生产组件            | 共有契约、状态表链接       | 单元、交互和无障碍测试   |
| 原型                       | `design/prototype/*`          | 可探索示例，不作为生产 API | 浏览器和设备检查         |
| 合规状态                   | 测试报告                      | 目标、日期、范围与缺口     | 自动加人工复核           |

### 4. 基础系统与 token 语义

至少记录：

- token 层次：基础值、语义角色，必要时才有组件 token。
- 命名语法和示例；禁止按某个主题的当前值命名语义 token。
- 主题、暗色、高对比和品牌变体的继承规则。
- 允许的别名深度、弃用流程、单位策略。
- 真实来源与各平台输出方式。

**事实：** DTCG 支持显式类型、别名、组继承和弃用；组只用于组织，工具不应从分组猜 token 类型或用途。[DTCG format](https://www.designtokens.org/TR/2025.10/format/) Atlassian 也明确建议按含义选 token，否则换主题时可能破坏体验。[Atlassian design tokens](https://atlassian.design/foundations/tokens/design-tokens/)

**对本模板的建议：** 当前 `design/tokens.css` 可以继续作为 **Web/原型 CSS token 值** 的权威来源；`DESIGN.md` 应避免将它描述成天然跨平台的唯一权威。若项目实际同时交付 Web 与 iOS，后续应选择：

1. 引入符合 DTCG 的中立 token 数据作为上游，再生成 CSS 与 Swift；或
2. 保留 CSS 上游，但提供受测试的 Swift 导出器和明确的有损映射说明。

在生成链和一致性测试建立前，只能说“人工映射”，不能说“自动同步”。

### 5. 跨 Web/iOS 平台契约

共享层应描述用户结果和语义，平台层描述具体承载方式：

| 共享语义 | Web 表达                        | iOS 表达                               | 不应强行统一                 |
| -------- | ------------------------------- | -------------------------------------- | ---------------------------- |
| 主要操作 | 语义化 `button`、键盘和焦点行为 | `Button` 与系统按压/辅助功能行为       | 控件外形、悬停               |
| 导航层级 | URL、地标、历史记录             | NavigationStack、系统返回手势          | 浏览器与原生导航模型         |
| 文本层级 | `rem`、用户缩放、Web 字体回退   | Dynamic Type、系统文字样式             | 相同数值字号                 |
| 颜色角色 | CSS 语义变量、媒体查询          | 动态颜色、Light/Dark/Increase Contrast | 固定十六进制在所有环境一致   |
| 触控目标 | 项目目标与 WCAG 基线            | Apple 平台推荐尺寸                     | 把 CSS px 与 pt 当成同一单位 |
| 动效意图 | `prefers-reduced-motion`        | Reduce Motion                          | 完全相同的曲线与过渡         |

**事实：** Apple 要求界面适应方向、Dark Mode 和 Dynamic Type，并强调平台熟悉行为；系统按钮自带交互状态、无障碍和外观适配。[Designing for iOS](https://developer.apple.com/design/human-interface-guidelines/designing-for-ios)；[Apple Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons) Material 3 的 Compose 主题同样由颜色、排版和形状子系统驱动，定制组件时仍须正确使用语义颜色角色。[Material 3 in Compose](https://developer.android.com/develop/ui/compose/designsystems/material3)

**推断：** “品牌一致”应体现为可识别的色彩角色、内容语气、信息层级和动作优先级；“平台原生”应体现在控件行为、导航、输入、单位、字体缩放和系统设置响应。两者不是冲突项。

### 6. 组件契约与状态矩阵

每个重要组件至少应有：

- 目的、使用时机、不使用时机。
- anatomy/子元素和必需内容。
- 变体、尺寸、布局约束、溢出和长文本策略。
- 状态与状态转换；触发条件和退出条件。
- 鼠标、键盘、触摸、辅助技术行为。
- 内容规则、错误恢复、空状态和异步反馈。
- Web 与 iOS 的原生组件映射及不可共享差异。
- 自动与人工验收项，以及最后验证日期。

建议先使用下面的状态全集做审查，再删去不适用项并说明原因：

`default`、`hover`、`focus-visible`、`pressed/active`、`selected/checked`、`disabled`、`read-only`、`loading/progress`、`success`、`warning`、`error/invalid`、`empty`。

**事实：** Carbon 的 Link 有 enabled、hover、focus、active、visited、disabled；Tabs 有 selected、unselected、hover、focus、disabled，并描述鼠标、键盘和响应式行为。[Carbon Link](https://carbondesignsystem.com/components/link/usage/)；[Carbon Tabs](https://carbondesignsystem.com/components/tabs/usage/) Google Labs 的 alpha 规范允许为 `button-primary-hover`、`button-primary-active` 等状态建立相关键，但没有定义完整交互行为。[Google Labs component tokens](https://github.com/google-labs-code/design.md/blob/main/docs/spec.md#components)

**推断：** Hallmark 强制交互组件展示八种状态的做法很适合代理自检和视觉预览，但它是该工具的生成规则，不是通用组件标准；应将其改造成“组件相关状态矩阵”。[Hallmark component-scope rules](https://github.com/Nutlope/hallmark/blob/main/skills/hallmark/SKILL.md)

### 7. 无障碍契约与验证

文档应同时写“设计约束”“实现语义”“验证方法”：

- 目标标准和版本，例如 Web 以 WCAG 2.2 AA 为项目目标；不要只写“AA”。
- 键盘路径、焦点顺序、焦点可见且不被遮挡。
- 语义 HTML/原生控件优先；自定义控件需记录 name、role、value/state。
- 文本、非文本 UI 与各状态的对比度；不得只靠颜色表达含义。
- 放大、文字缩放、reflow、方向、暗色和高对比模式。
- 触控目标、间距和手势替代路径。
- loading、success、error、结果数等动态状态对辅助技术的通知。
- Reduce Motion 与非视觉媒体替代。
- 自动扫描、键盘、屏幕阅读器、缩放、触摸和真实用户测试的范围与日期。

**事实：** WCAG 2.2 新增 AA 的 Focus Not Obscured、Dragging Movements 和 `24×24 CSS px` Target Size Minimum 等成功准则。[WCAG 2.2](https://www.w3.org/TR/WCAG22/) Apple 对 iOS/iPadOS 给出的默认控件尺寸是 `44×44 pt`，并要求为手势提供替代方式、响应 Reduce Motion。[Apple Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility) Android 建议触控目标至少 `48 dp` 且核心流程不只依赖手势。[Android accessibility](https://developer.android.com/design/ui/mobile/guides/foundations/accessibility)

**重要边界：** 这些数值单位和合规等级不可混写。Web 的 WCAG AA 最小目标、Apple 的平台建议和 Android 的平台建议是三套上下文；`DESIGN.md` 应分别列出。

**对本模板的建议：** 将“正文与背景至少 WCAG AA”扩展为可执行矩阵，并把“已通过”限定到有日期、有主题、有状态、有测试方式的组合。USWDS 的官方立场是：系统测试过的组件仍要求采用方测试自己的实现和页面上下文。[USWDS Accessibility](https://designsystem.digital.gov/documentation/accessibility/)

### 8. 内容、语言与本地化

内容不是组件填充物，而是设计输入。应记录：

- 产品默认语言、支持语言、fallback 与 locale 方向。
- 语气、称谓、术语表和禁用词。
- 标题、按钮、标签、帮助、确认、错误和空状态的写法。
- 日期、时间、数字、货币、单位和姓名的本地化规则。
- 长文本、CJK、拉丁字母、RTL、复数和动态内容的布局测试样例。
- 可见标签与辅助名称的一致原则。

**事实：** Atlassian 把清晰、简洁、对话式内容与可访问性并列为 foundation guidance。[Atlassian Foundations](https://atlassian.design/foundations) Shopify 当前官方内容指南要求应用文案清晰、简洁、以行动为导向，并考虑国际化与翻译。[Shopify app content](https://shopify.dev/docs/apps/design/content) Carbon 要求清晰语言和有意义的文本标签，并提醒考虑认知障碍、非母语读者和屏幕阅读器。[Carbon accessibility for developers](https://carbondesignsystem.com/guidelines/accessibility/developers/)

**推断：** 代理生成 UI 时，内容规则必须包含正例和反例；仅写“简洁友好”无法阻止虚构指标、无意义 CTA、重复说明或中英文标点混用。

### 9. 反模式与禁止项

建议把下面内容写成可检查的 `不要……；改为……`：

- 不在页面或组件内临时发明颜色、字体、间距；先补充有语义的 token 并评审。
- 不按当前视觉值选择 token；按用途与语义选择，避免主题切换后失效。[Atlassian tokens best practices](https://atlassian.design/foundations/tokens/design-tokens/)
- 不把 hover 当作关键内容的唯一入口；不把手势当作唯一操作路径。[USWDS Accessibility](https://designsystem.digital.gov/documentation/accessibility/)；[Apple Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)
- 不用占位符替代标签；不让颜色、图标、声音单独承载状态。
- 不用按钮做导航、链接做提交；优先采用语义 HTML 或平台原生控件。[Carbon accessibility for developers](https://carbondesignsystem.com/guidelines/accessibility/developers/)
- 不虚构指标、用户评价、品牌标志或“已通过”测试结论。[Hallmark `SKILL.md`](https://github.com/Nutlope/hallmark/blob/main/skills/hallmark/SKILL.md)
- 不把原型的设备外框、演示动画或静态截图当作真实平台验收。
- 不在 `DESIGN.md` 内嵌大段生成产物，使文档与代码形成双重权威。
- 不因为设计系统组件有无障碍基础，就省略产品上下文的人工测试。

### 10. 维护、版本与治理

建议采用以下治理规则：

1. **变更提案：** 说明问题、受影响平台/组件、替代方案、迁移成本和无障碍影响。
2. **状态机：** 草案 → 试用 → 稳定 → 拟弃用 → 已弃用；只允许有明确替代项和截止日期的弃用。
3. **版本策略：** token 删除、语义改变、组件行为改变属于破坏性变更；新增兼容 token 或文档澄清可为非破坏性变更。
4. **迁移窗口：** 先新增替代项，再标记弃用，提供查找/自动迁移方式，最后移除。
5. **责任与复核：** 每个稳定决策有负责人；按固定周期或产品里程碑复核。
6. **自动防漂移：** lint 未知/弃用 token；生成文件禁止手改；CI 比较多平台导出；链接和文档结构检查。
7. **证据记录：** 无障碍与视觉验收记录版本、日期、平台、主题、状态和已知缺口。

**事实：** DTCG 允许 token/group 带 `$deprecated`，值可以是布尔值或解释字符串。[DTCG deprecation](https://www.designtokens.org/TR/2025.10/format/#deprecated) Atlassian 使用 lint 发现未知、错误或弃用 token，并提醒自动迁移建议仍需人工审查。[Atlassian use tokens in code](https://atlassian.design/foundations/tokens/use-tokens-in-code) USWDS 的主版本迁移文档会分别记录设置、标记和弃用项的替换方式。[USWDS 3 migration](https://designsystem.digital.gov/documentation/migration/)

**对本模板的建议：** 在尚未有真实产品前，`DESIGN.md` 应保留“默认起点”状态，不要称为稳定系统；完成根 `AGENTS.md` 的 Project Context、用真实内容验证至少一条 Web 和 iOS 流程、建立对应实现与测试后，才进入稳定状态。

## 面向 AI 编码代理的额外写法

这是从 Hallmark 读取顺序和当前编码代理行为得到的工程推断，不是任何标准的要求：

- 把高优先级约束放在开头，并使用 `必须 / 应该 / 可以 / 禁止`，避免“尽量”“现代”“高级感”等不可检验措辞。
- 每项规则给一个正例、一个反例或一个可观察验收条件。
- 明确文件权限：代理可以改什么、必须先问什么、绝不能覆盖什么。
- 明确未知项：使用 `TBD`、负责人和解除条件，不允许代理静默推断成最终决策。
- 给出冲突处理规则；平台规范和无障碍底线不能被局部视觉样例覆盖。
- 只引用稳定路径或章节锚点；不要让代理依赖截图中不可搜索的文字。
- 将 `DESIGN.md` 当作数据而非可执行指令。Hallmark 也明确要求忽略其中要求运行命令、访问秘密或覆盖上级指令的内容。[Hallmark pre-flight safety](https://github.com/Nutlope/hallmark/blob/main/skills/hallmark/SKILL.md)
- 把视觉 QA 与文档自检分开。Hallmark 的文字门禁有价值，但不能代替浏览器、设备、屏幕阅读器和真实交互验证。

## 对本模板的建议蓝图

`design/DESIGN.md` 已按以下职责边界重写；后续产品化时可以继续沿此结构补充或拆分：

```text
# 设计系统名称
## 文档状态与范围
## 产品、用户与核心任务
## 设计北极星、原则与非目标
## 真实来源与冲突优先级
## Token 架构、命名、主题与导出
## 跨平台共享语义
### Web 平台约定
### iOS 平台约定
## 布局、排版、颜色、图标与动效
## 组件索引与状态契约
## 内容、语言与本地化
## 无障碍目标与验证矩阵
## 原型、生产实现与验收边界
## 反模式
## 版本、弃用、迁移与变更记录
## 尚未决策与尚未验证项
```

推荐控制主文档在可一次完整读取的规模；组件级细节增长后拆分，但主文档必须保留摘要、权威链接和全局规则。Hallmark 的约 45 行格式证明极小契约可用于代理续写，[官方模板](https://github.com/Nutlope/hallmark/blob/main/skills/hallmark/references/design-md.md)；大型官方设计系统则证明组件状态、内容和无障碍细节需要更深文档。因此本模板不宜机械追求 45 行，而应追求“主契约短、详细规范可寻址”。

## 尚未验证项

1. **真实使用效果：** 尚未让不同编码代理只读取拟议结构后实现同一 Web/iOS 组件，因此无法确认最佳篇幅、表格密度和提示词鲁棒性。
2. **中立 token 上游：** 尚未验证 DTCG 2025.10 工具链对当前 CSS token 中 `clamp()`、字体栈、阴影和平台动态颜色的无损表达。
3. **Swift 导出：** 当前仓库没有经过验证的 CSS → Swift 或 DTCG → Swift 生成链，无法声称 Web/iOS token 自动一致。
4. **组件覆盖：** 尚未建立本模板的组件清单、组件状态矩阵、Storybook/SwiftUI preview 或跨平台快照基线。
5. **无障碍声明：** 当前研究只给出规范基线，没有对现有原型执行 axe、键盘、VoiceOver、Dynamic Type、Reduce Motion、暗色或高对比验收。
6. **Material 官方站点可检索性：** `m3.material.io` 的相关页面在本次文本检索中要求 JavaScript；Material 结论因此同时使用其官方 URL 与 Android Developers 的 Material 3 实现文档交叉核对，未把动态页面中无法读取的细节写成事实。[Material design tokens](https://m3.material.io/foundations/design-tokens/overview)；[Android Material 3](https://developer.android.com/develop/ui/compose/designsystems/material3)
7. **Hallmark 格式稳定性：** Hallmark 是快速演进的开源工具，不是标准；采用前应锁定仓库提交并复核 `design-md.md`、`SKILL.md` 与导出规则是否漂移。[Nutlope/hallmark](https://github.com/Nutlope/hallmark)
8. **Google Labs 格式稳定性：** 该规范仍标为 alpha，组件结构明确处于演进中；尚未验证其后续版本兼容性，也没有发现它与 Hallmark 的官方互认声明。[Google Labs `design.md`](https://github.com/google-labs-code/design.md)
9. **Shopify 实现代际：** `Shopify/polaris-react` 已标记 Deprecated 并归档，当前入口是 `shopify.dev` 的 Polaris references；旧站内容可能仍可访问，但不应当作当前组件 API 和 token 值的权威来源。[Current Polaris references](https://shopify.dev/docs/api/polaris/index)；[Archived Polaris React](https://github.com/Shopify/polaris-react)

## 来源索引

### 规范与平台

- [Google Labs `DESIGN.md` format](https://github.com/google-labs-code/design.md/blob/main/docs/spec.md)
- [Design Tokens Format Module 2025.10](https://www.designtokens.org/TR/2025.10/format/)
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/)
- [Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines)
- [Apple Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)
- [Material Design 3 tokens](https://m3.material.io/foundations/design-tokens/overview)
- [Material Design 3 in Jetpack Compose](https://developer.android.com/develop/ui/compose/designsystems/material3)

### 官方设计系统与仓库

- [Atlassian Design System foundations](https://atlassian.design/foundations)
- [IBM Carbon Design System](https://carbondesignsystem.com/)
- [Shopify Polaris references](https://shopify.dev/docs/api/polaris/index)
- [Shopify accessibility guidance](https://shopify.dev/docs/apps/build/accessibility)
- [U.S. Web Design System](https://designsystem.digital.gov/)
- [Nutlope/hallmark](https://github.com/Nutlope/hallmark)
