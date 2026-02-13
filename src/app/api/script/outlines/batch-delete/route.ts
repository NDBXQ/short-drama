import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { and, asc, eq, inArray } from "drizzle-orm"
import { getDb } from "coze-coding-dev-sdk"
import { makeApiErr, makeApiOk } from "@/shared/api"
import { logger } from "@/shared/logger"
import { getSessionFromRequest } from "@/shared/session"
import { getTraceId } from "@/shared/trace"
import { stories, storyOutlines, storyboards } from "@/shared/schema"

const bodySchema = z.object({
  outlineIds: z.array(z.string().trim().min(1).max(200)).min(1).max(100)
})

export async function POST(req: NextRequest): Promise<Response> {
  const traceId = getTraceId(req.headers)
  const session = await getSessionFromRequest(req)
  const userId = session?.userId
  if (!userId) return NextResponse.json(makeApiErr(traceId, "AUTH_REQUIRED", "未登录或登录已过期"), { status: 401 })

  const rawBody = await req.json().catch(() => null)
  const parsed = bodySchema.safeParse(rawBody)
  if (!parsed.success) return NextResponse.json(makeApiErr(traceId, "VALIDATION_FAILED", "参数格式不正确"), { status: 400 })

  const outlineIds = Array.from(new Set(parsed.data.outlineIds.map((x) => String(x ?? "").trim()).filter(Boolean)))
  if (outlineIds.length === 0) return NextResponse.json(makeApiErr(traceId, "VALIDATION_FAILED", "未选择要删除的章节"), { status: 400 })

  const db = await getDb({ stories, storyOutlines, storyboards })
  const rows = await db
    .select({ outlineId: storyOutlines.id, storyId: storyOutlines.storyId })
    .from(storyOutlines)
    .innerJoin(stories, eq(storyOutlines.storyId, stories.id))
    .where(and(inArray(storyOutlines.id, outlineIds), eq(stories.userId, userId)))

  if (rows.length !== outlineIds.length) {
    return NextResponse.json(makeApiErr(traceId, "OUTLINE_NOT_FOUND", "部分大纲章节不存在或无权限"), { status: 404 })
  }

  const storyIds = Array.from(new Set(rows.map((r) => r.storyId)))
  if (storyIds.length !== 1 || !storyIds[0]) {
    return NextResponse.json(makeApiErr(traceId, "VALIDATION_FAILED", "所选章节不属于同一个剧本"), { status: 400 })
  }

  const storyId = storyIds[0]

  logger.info({
    event: "script_outline_batch_delete_start",
    module: "script",
    traceId,
    message: "开始批量删除大纲章节",
    storyId,
    outlineIds,
    count: outlineIds.length
  })

  await db.delete(storyboards).where(inArray(storyboards.outlineId, outlineIds))
  await db.delete(storyOutlines).where(inArray(storyOutlines.id, outlineIds))

  const remaining = await db
    .select({ id: storyOutlines.id })
    .from(storyOutlines)
    .where(eq(storyOutlines.storyId, storyId))
    .orderBy(asc(storyOutlines.sequence), asc(storyOutlines.createdAt))

  for (let i = 0; i < remaining.length; i += 1) {
    const row = remaining[i]
    if (!row) continue
    await db.update(storyOutlines).set({ sequence: i + 1 }).where(eq(storyOutlines.id, row.id))
  }

  logger.info({
    event: "script_outline_batch_delete_success",
    module: "script",
    traceId,
    message: "批量删除大纲章节成功",
    storyId,
    outlineIds,
    deletedCount: outlineIds.length,
    remainingCount: remaining.length
  })

  return NextResponse.json(
    makeApiOk(traceId, { deleted: true, storyId, outlineIds, deletedCount: outlineIds.length, remainingCount: remaining.length }),
    { status: 200 }
  )
}

