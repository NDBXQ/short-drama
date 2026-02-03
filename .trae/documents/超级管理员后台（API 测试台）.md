## 需求理解
- 目标：在现有 Next.js 项目里新增一个“超级管理员后台”，用于对项目内所有接口进行测试（类似轻量版 Postman/Swagger UI）。
- 访问控制：仅允许账号为 admim、密码为 admin 的管理员访问。
- 约束：不引入明文泄漏/日志泄漏；后台仅用于站内同源接口测试。

## 现状基础（已确认）
- 项目已具备登录/会话：`/api/auth/login` 写入 HttpOnly cookie（`ai_video_session`），`middleware.ts` 用 `getSessionFromRequest` 做页面保护与跳转。
- 服务端与前端 API route 统一返回：`makeApiOk/makeApiErr`，`traceId` 贯穿。

## 方案设计
### 1) 管理员鉴权策略
- 复用现有登录体系（不另造一套会话）：
  - 第一次使用时，直接在登录页用 `admim/admin` 登录即可通过 `loginOrCreate` 创建用户并拿到会话 cookie。
  - 对 `/admin/**` 做“二次校验”：要求 session 中 `account === "admim"` 才允许访问。
- 安全策略（避免把硬编码账号暴露为通用后门）：
  - 仅在 `NODE_ENV !== "production"` 时允许该管理员账号通过（或提供一个 `ADMIN_PANEL_ENABLED` env 开关）；生产环境默认禁用/需要显式开启。
  - 不输出密码到日志，不在前端代码中展示密码，只在说明文档里提示固定账号。

### 2) 后台页面与路由
- 新增页面：
  - `/admin`：入口页（展示“API 测试台”+ 快捷入口）。
  - `/admin/api-tester`：接口测试主页面。
  - （可选）`/admin/login`：如果你希望和现有 `/login` 分开，我会做一个仅管理员可用的登录页；否则直接复用 `/login`。
- 在 `middleware.ts` 中加入 `/admin` 专属逻辑：
  - 未登录：跳转到 `/login?next=/admin/...`
  - 已登录但非 admim：跳转到 `/`（或显示 403 页面）。

### 3) “所有接口”发现与列表
- 提供一个仅管理员可访问的接口目录 API：`GET /api/admin/routes`
  - 服务端用 `fs` 扫描 `src/app/api/**/route.ts`，解析出路由路径与支持的 method（GET/POST/...）。
  - 返回一个结构化列表（path、methods、文件位置），供前端侧边栏展示。
  - 兼容：若运行环境无法读文件系统，则回退为手工维护的 routes 列表（同样由管理员维护）。

### 4) 接口测试能力（核心功能）
- 在 `/admin/api-tester` 提供：
  - 选择接口（左侧目录 + 搜索/过滤）。
  - 请求构造器：Method、URL（含 query 参数编辑器）、Headers（可增删）、Body（JSON/Text/FormData/File）。
  - 一键发起请求：默认同源 `fetch`，自动携带 cookie（可测试需要登录的接口）。
  - 响应查看：status、耗时、响应 headers、响应 body（JSON 自动格式化、文本原样、二进制/文件提示下载）。
  - 历史记录：最近 N 条请求保存在 localStorage（可一键复用/复制 curl）。

### 5) 对“特殊接口”的支持（提升可用性）
- SSE/流式接口（如 jobs events）：
  - 提供“流式模式”按钮：用 `EventSource` 或 `fetch + ReadableStream` 展示事件流。
- 文件上传接口：
  - 支持在 UI 中选择文件，构造 multipart/form-data。

## 实施步骤（分阶段）
1. 只读梳理：确认现有路由结构、CSS/组件风格、现有 layout 与导航位置（例如 AppHeader 是否需要入口）。
2. 新增 admin 路由与页面骨架：/admin、/admin/api-tester；把入口放到 Header（仅管理员可见）或在 / 里隐藏入口。
3. 增强 middleware：对 /admin 做 account 校验（admim）与可选的环境开关。
4. 实现 `/api/admin/routes`：扫描 app/api 目录生成接口目录（并做好失败回退）。
5. 实现 API 测试台 UI：目录 + 请求编辑器 + 响应面板 + 历史记录。
6. 增加“流式模式/文件上传/curl 导出”等增强能力。
7. 验证：
   - 使用 admim/admin 登录后访问 /admin。
   - 从测试台调用若干现有接口：/api/auth/me、/api/video/timeline、/api/library/public-resources/list 等。
   - 确认非 admim 账号无法访问 /admin。

## 交付物
- 新增 Admin 页面与组件（不超过 350 行/文件，按模块拆分）。
- 新增管理员专用 API routes（/api/admin/routes 及必要辅助）。
- middleware 更新：/admin 权限控制。
- 简短使用说明：如何登录、如何测试接口、如何导出 curl。

如果你确认按以上方案推进，我会开始落地代码实现。