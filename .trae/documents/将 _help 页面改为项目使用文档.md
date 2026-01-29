## 需求理解
- 目标：把 `src/app/(app)/help/page.tsx` 现在的占位页替换为“AI视频创作平台”的使用文档页，覆盖项目三条主流程（剧本创作 → 分镜/生图/生视频 → 内容库）与常见问题。
- 约束：项目当前没有 Markdown/MDX 渲染库（预览区是纯文本渲染），因此文档内容优先用 JSX + CSS Modules 实现，保证样式一致且不引入新依赖。

## 文档结构（页面信息架构）
- 顶部：页面标题 + 版本/环境提示（开发环境/部署环境文案），提供“快速开始”按钮跳转到 `/library`、`/script/workspace`、`/video`。
- 左侧：目录 TOC（锚点导航），包含：
  1) 快速开始
  2) 账号与登录
  3) 内容库（如何从内容库继续创作）
  4) 剧本创作（入口态/详情态/改写/生成分镜文本）
  5) 视频创作（分镜列表/故事板/进入生图与生视频工作台）
  6) 生图工作台（提示词/参考图/合成图）
  7) 生视频工作台（参数/时间线/生成）
  8) 常见报错与排障（含 Server Actions forwarded host 报错、AUTH_SESSION_SECRET 提示、S3/DB 未配置等）
  9) 开发者：本地开发命令与环境变量说明（只列“需要设置的 key 名称”，不展示任何敏感值）
- 主内容：每节包含“你能做什么/入口在哪里/关键按钮/数据会保存到哪里（概念级）/下一步去哪”。

## 视觉与交互方案（可落地）
- 采用两栏布局：TOC（固定宽度、sticky） + 内容（可滚动）。小屏（< 980px）TOC 收起为顶部下拉/折叠。
- 复用现有卡片视觉（圆角、半透明白底、阴影）以与其它页面一致：参考 `src/app/(app)/placeholder.module.css` 与工作台面板样式。
- TOC 点击滚动到对应锚点；滚动时高亮当前章节（IntersectionObserver 或简单滚动监听）。
- 文档中的“跳转链接”全部使用 Next `Link` 指向实际路由：`/library`、`/script/workspace?entry=nav`、`/video?tab=list`、`/video/image`、`/video/video`、`/login`。

## 代码改动点（文件级计划）
1) 替换 Help 页实现
- 修改：`src/app/(app)/help/page.tsx`
  - 从占位内容改为渲染新的 Help 文档组件。
2) 新增文档组件与样式
- 新增：`src/app/(app)/help/HelpDoc.tsx`（或 `components/HelpDoc.tsx`）
- 新增：`src/app/(app)/help/HelpDoc.module.css`
  - 实现 TOC + 内容布局、卡片风格、代码块/提示块样式。
3)（可选）抽离可复用的文档小组件
- 如 `DocSection` / `DocCallout` / `DocCodeBlock`，避免单文件过长。

## 内容来源与准确性保证
- 文档内容严格依据现有路由与组件行为编写：
  - 路由与页面：`src/app/(app)/**`（`/script/workspace`、`/video`、`/library`、`/help`）
  - 关键流程：`src/features/script/workspace/*`、`src/features/video/*`、`src/features/library/*`
  - 鉴权与会话：`src/app/api/auth/*`、`src/shared/session.ts`
  - 日志/traceId：`src/shared/logger.ts`、`src/shared/trace.ts`
- 不在文档中写入任何 `.env.local` 的真实值，只描述“需要配置哪些变量/常见缺失表现”。

## 验证方案
- 本地启动后访问：`/help`，检查：
  - TOC 跳转与锚点是否正确
  - 小屏响应式是否可用
  - 所有文档内链接是否可点击并正确跳转
- 运行：`npm run lint`、`npm run build`，确保无类型错误。

## 风险与回滚
- 风险：Help 页面内容较多导致单文件过大/维护困难；通过拆分 `HelpDoc.tsx` + 子组件缓解。
- 回滚：将 `help/page.tsx` 恢复为原占位实现即可。
