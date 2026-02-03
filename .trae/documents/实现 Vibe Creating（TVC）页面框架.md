## 需求理解
- 目标：将 `/tvc` 从占位页升级为“Vibe Creating（TVC 类似体验）”的完整页面框架（先做 UI/交互骨架，后续再接入生成能力）。
- 参照：你提供的两张 VidMuse 工作界面图。
- 约束：不引入新依赖；复用现有视觉（圆角卡片、半透明白底/阴影、lucide-react 图标、CSS Modules）。

## 目标视觉与布局（可落地描述）
- **三栏布局（桌面端）**：
  - 左侧：Style & Vibe 选择区（卡片网格 + “Need More Styles?”卡片 + 左侧步骤导航）。
  - 中间：内容预览与编辑区（顶部 Tab：Shotlist / Image / Video；中部预览画布；底部 Timeline）。
  - 右侧：对话/助手区（聊天线程 + 输入框 + 右上角 Continue 状态按钮）。
- **顶部工具条（中间栏）**：
  - 左：Tab 切换（Shotlist/Image/Video）
  - 右：Share / Download（先做按钮骨架，禁用或提示“即将上线”）。
- **Timeline（底部）**：展示一个可滚动的时间线骨架（片段缩略图占位 + 音频波形占位 + 播放按钮），不实现真实剪辑逻辑。
- **响应式**：
  - 宽屏：三栏。
  - 中屏：右侧对话可折叠为抽屉（按钮展开）。
  - 小屏：左侧 Style 区收起为顶部“Style & Vibe”按钮弹出抽屉；中间保留预览与关键按钮。

## 信息架构（左侧步骤导航）
- 左侧提供一个“流程 Stepper/导航”骨架（全部先是 UI，不接功能）：
  1) Style & Vibe（当前页默认激活）
  2) Creative Brief
  3) Reference
  4) Voiceover
  5) Music
  6) Shot List
  7) Storyboard
  8) Video Storyboard
- 点击仅切换右侧/中间显示的占位内容（例如中间 Tab 仍可用；Step 切换主要改变左侧主卡片区标题与提示文案）。

## 组件拆分（避免单文件过大）
- 新增 `src/features/tvc/` 业务域，按模块化拆分：
  - `TvcWorkspacePage.tsx`：页面容器（3 栏 + 顶部工具条 + timeline 区域）
  - `StyleVibePanel.tsx`：左侧 Style & Vibe 卡片网格 + 搜索/筛选占位 + “Need More Styles?”
  - `TvcPreviewPanel.tsx`：中间预览画布（含 Shotlist/Image/Video Tab 视图占位）
  - `TvcTimelinePanel.tsx`：底部 timeline 骨架
  - `TvcChatPanel.tsx`：右侧对话区（复用现有 ChatSidebar 的视觉语言，但做成通用版本：标题/线程/输入框/Continue）
- 样式：每个组件对应 `.module.css`；整体容器再提供 `TvcWorkspacePage.module.css`。

## 复用现有代码与样式的策略
- 视觉：对齐现有卡片/面板风格（例如 `src/features/script/workspace/components/ChatSidebar.module.css`、`src/features/video/components/ImageCreate/Shell.module.css` 中的布局与面板边框/阴影习惯）。
- 图标：继续使用 `lucide-react`。
- 不引入 Markdown/编辑器/波形库：timeline、波形、缩略图都用占位块与渐变实现。

## 路由改动
- 修改 `src/app/(app)/tvc/page.tsx`：由占位改为渲染 `TvcWorkspacePage`。
- 保持首页入口 `/tvc` 不变。

## 交互骨架（不接后端）
- Style 卡片可选中（单选），选中态高亮。
- Stepper 点击可切换当前步骤（仅影响展示文案/提示块）。
- Tab（Shotlist/Image/Video）可切换，展示不同占位内容：
  - Shotlist：表格/列表骨架（镜头编号、时长、提示词/字幕占位）。
  - Image：图片预览占位 + “Edit”按钮骨架。
  - Video：视频预览占位 + 播放控件骨架。
- 右侧聊天：支持输入框本地回显（不调用接口），并展示 2-3 条预置 assistant 引导文案（例如如何描述 vibe、如何补充产品信息）。

## 验证方案
- 开发环境访问：`/tvc`、首页入口点击是否正确。
- 检查响应式：缩放到 980px/860px 以下布局是否合理。
- 执行：`npm run lint`、`npm run build` 确保无错误。

## 风险与回滚
- 风险：页面骨架较复杂导致样式维护成本高；通过组件拆分与局部 CSS Modules 控制。
- 回滚：将 `tvc/page.tsx` 恢复为占位实现即可。