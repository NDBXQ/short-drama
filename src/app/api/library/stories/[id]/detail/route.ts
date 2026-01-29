import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { getDb } from "coze-coding-dev-sdk"
import { eq, and } from "drizzle-orm"
import { stories } from "@/shared/schema"
import { getSessionFromRequest } from "@/shared/session"
import { getTraceId } from "@/shared/trace"
import { makeApiErr, makeApiOk } from "@/shared/api"
import { logger } from "@/shared/logger"

export const runtime = "nodejs"

const paramsSchema = z.object({
  id: z.string().trim().min(1).max(200)
})

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const traceId = getTraceId(req.headers)
  const start = Date.now()

  const session = await getSessionFromRequest(req)
  const userId = session?.userId
  if (!userId) return NextResponse.json(makeApiErr(traceId, "AUTH_REQUIRED", "未登录或登录已过期"), { status: 401 })

  const rawParams = await ctx.params
  const parsed = paramsSchema.safeParse(rawParams)
  if (!parsed.success) return NextResponse.json(makeApiErr(traceId, "VALIDATION_FAILED", "参数不正确"), { status: 400 })

  logger.info({
    event: "library_story_detail_get_start",
    module: "library",
    traceId,
    message: "开始获取剧本详情",
    storyId: parsed.data.id
  })

  const db = await getDb({ stories })
  const rows = await db
    .select({
      id: stories.id,
      userId: stories.userId,
      title: stories.title,
      storyText: stories.storyText,
      generatedText: stories.generatedText,
      status: stories.status,
      progressStage: stories.progressStage,
      aspectRatio: stories.aspectRatio,
      resolution: stories.resolution,
      shotStyle: stories.shotStyle,
      finalVideoUrl: stories.finalVideoUrl,
      metadata: stories.metadata,
      createdAt: stories.createdAt,
      updatedAt: stories.updatedAt
    })
    .from(stories)
    .where(and(eq(stories.id, parsed.data.id), eq(stories.userId, userId)))
    .limit(1)

  const row = rows[0]
  if (!row) return NextResponse.json(makeApiErr(traceId, "NOT_FOUND", "剧本不存在"), { status: 404 })

  logger.info({
    event: "library_story_detail_get_success",
    module: "library",
    traceId,
    message: "获取剧本详情成功",
    storyId: row.id,
    durationMs: Date.now() - start
  })

  return NextResponse.json(makeApiOk(traceId, { story: row }), { status: 200 })
}
