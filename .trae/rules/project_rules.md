# TRAE Project Rules

This file provides guidance to TRAE AI when working with code in this repository.

## 常用命令

```bash
# 安装依赖
npm i

# 本地开发（默认 3000；可用 -p 指定端口）
npm run dev
npm run dev -- -p 3001

# 生产构建 / 启动
npm run build
npm run start

# 代码检查
npm run lint

# 数据库（Drizzle）
npm run db:push
npm run db:studio
```

备注：
- 仓库目前未提供 `test` 脚本；调试以 `lint/build` + 页面手动验证为主。

## 代码架构（大图）

### Next.js App Router（页面/布局）
- 路由均在 `src/app/**`（App Router）。
- 有两套路由分组：
  - `src/app/(app)`：应用内页面（带全局布局），布局见 [(app)/layout.tsx](file:///Users/bytedance/dev/ai-video/src/app/(app)/layout.tsx)
  - `src/app/(auth)`：登录等页面（无主导航），布局见 [(auth)/layout.tsx](file:///Users/bytedance/dev/ai-video/src/app/(auth)/layout.tsx)
- API 路由集中在 `src/app/api/**/route.ts`（鉴权、脚本生成、分镜/生图/生视频、内容库资源等）。

### 业务模块（src/features）
项目按“业务域”分层，页面只做编排，核心逻辑在 `src/features/**`：
- 剧本工作台：`src/features/script/workspace/*`
  - 入口态： [ScriptWorkspaceLanding.tsx](file:///Users/bytedance/dev/ai-video/src/features/script/workspace/ScriptWorkspaceLanding.tsx)
  - 详情态： [ScriptWorkspacePage.tsx](file:///Users/bytedance/dev/ai-video/src/features/script/workspace/ScriptWorkspacePage.tsx)
- 视频创作：`src/features/video/*`
  - `/video` 分镜列表/故事板：`StoryboardList/*`、`StoryboardBoard.tsx`（从 [VideoPageClient.tsx](file:///Users/bytedance/dev/ai-video/src/app/(app)/video/VideoPageClient.tsx) 进入）
  - `/video/image`、`/video/video` 生图/生视频工作台：统一容器 [CreateWorkspacePage.tsx](file:///Users/bytedance/dev/ai-video/src/features/video/components/CreateWorkspacePage.tsx)
- 内容库：`src/features/library/*`，主页面 [ContentLibraryPage.tsx](file:///Users/bytedance/dev/ai-video/src/features/library/ContentLibraryPage.tsx)
- 鉴权：`src/features/auth/*`，登录表单 [LoginForm.tsx](file:///Users/bytedance/dev/ai-video/src/features/auth/LoginForm.tsx)
- 外部能力对接：`src/features/coze/*`（Coze 端点调用），`src/features/tts/*`（配音/音色）

### 全局共享（src/shared + src/server）
- DB schema：集中在 [schema.ts](file:///Users/bytedance/dev/ai-video/src/shared/schema.ts)（Drizzle + zod schema + infer types）
- 服务端领域逻辑：集中在 `src/server/services/**`（例如 storyboard/image/video/auth 等）
- 后台 job/worker：集中在 `src/server/jobs/**`（DB 队列 claim + 同进程 worker loop）
- Session/trace/logger 等基础设施：集中在 `src/shared/**`

## 数据与持久化

### PostgreSQL + Drizzle
- Drizzle-Kit 配置见 [drizzle.config.ts](file:///Users/bytedance/dev/ai-video/drizzle.config.ts)
  - schema：`./src/shared/schema.ts`
  - DB URL 环境变量：`PGDATABASE_URL`（或 `DATABASE_URL` / `POSTGRES_URL`）
- 访问 DB 使用 `coze-coding-dev-sdk` 的 `getDb()`，常见模式：
  - `const db = await getDb({ storyboards, stories, ... })`（显式传入本次用到的表）

### S3 存储
有两套封装（用途不同）：
- `src/shared/storage.ts`：公共资源上传/预签名，依赖 `BUCKET_ENDPOINT_URL/BUCKET_NAME/BUCKET_ACCESS_KEY/BUCKET_SECRET_KEY/BUCKET_REGION`。
- `src/server/integrations/storage/s3.ts`：生成链路上传/预签名（服务端集成）。

### Jobs/进度事件
- `jobs` 表存在“按需创建”逻辑： [ensureJobsTable.ts](file:///Users/bytedance/dev/ai-video/src/server/db/ensureJobsTable.ts)
- worker 不是常驻队列：通常由 API 请求触发 “kick” 同进程 worker： [kickWorkers.ts](file:///Users/bytedance/dev/ai-video/src/server/jobs/kickWorkers.ts)
- 进度/事件常用 SSE：`src/app/api/jobs/[jobId]/events/route.ts` 等（本质是轮询 DB `progressVersion` 推送）。

## 日志与调试（重要）

### 结构化日志实现
- 统一 logger： [logger.ts](file:///Users/bytedance/dev/ai-video/src/shared/logger.ts)
- 统一 payload 字段（强约束）：
  - `event`：事件名（常见：`*_start` / `*_success` / `*_failed`）
  - `module`：模块名（如 `auth` / `video` / `coze` / `script`）
  - `traceId`：链路 ID（服务端从请求头提取；前端常用 `"client"`）
  - `message`：一句话摘要
- 日志输出形态：
  - `console.<level>("<module>:<event> <message>", { level, timestamp, ...payload })`
  - 因此排查时优先用 `traceId` 过滤关联日志。

### traceId 规则
- `traceId` 获取： [trace.ts](file:///Users/bytedance/dev/ai-video/src/shared/trace.ts)
  - 优先：`x-trace-id` → `x-request-id` → `crypto.randomUUID()`
- API Route 通常在入口 `const traceId = getTraceId(req.headers)`，随后所有 `logger.*` 与 `makeApiOk/Err` 都带同一 traceId。

### API 返回体约定
- `makeApiOk/makeApiErr`： [api.ts](file:///Users/bytedance/dev/ai-video/src/shared/api.ts)
  - 成功：`{ ok: true, data, traceId }`
  - 失败：`{ ok: false, error: { code, message }, traceId }`
- 调试建议：遇到前端报错先抓 `traceId`，再从服务端日志定位同 traceId 的 `*_failed` 记录。

### 常见错误：Server Actions 的 forwarded host 校验
- 现象：`x-forwarded-host` 与 `origin` 不一致导致 “Invalid Server Actions request” 并 500。
- 仓库已在 [next.config.js](file:///Users/bytedance/dev/ai-video/next.config.js) 配置 `experimental.serverActions.allowedOrigins` 放行开发/沙箱域名。
- 根因更推荐从网关/代理侧修正 `Host/X-Forwarded-Host/X-Forwarded-Proto` 使其与对外域名一致（避免放宽白名单）。

### 典型日志位置（便于快速定位）
- 鉴权（登录/会话）：`src/app/api/auth/*`、`src/server/services/authService.ts`、[session.ts](file:///Users/bytedance/dev/ai-video/src/shared/session.ts)
- Coze 外部调用（含 status/duration/bodySnippet）：[runEndpointClient.ts](file:///Users/bytedance/dev/ai-video/src/features/coze/runEndpointClient.ts)
- 视频/生图服务：`src/server/services/*`，以及 `src/app/api/video-creation/*`

