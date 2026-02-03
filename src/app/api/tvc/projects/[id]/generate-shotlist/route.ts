import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { and, eq } from "drizzle-orm"
import { getDb } from "coze-coding-dev-sdk"
import { tvcStories } from "@/shared/schema"
import { getSessionFromRequest } from "@/shared/session"
import { getTraceId } from "@/shared/trace"
import { makeApiErr, makeApiOk } from "@/shared/api"
import { enqueueTvcGenerateShotlistJob, kickTvcShotlistWorker } from "@/server/jobs/tvcShotlistWorker"
import { ensureTvcSchema } from "@/server/db/ensureTvcSchema"

export const runtime = "nodejs"

const paramsSchema = z.object({
  id: z.string().trim().min(1).max(200)
})

const bodySchema = z.object({
  brief: z.string().trim().min(1).max(50_000),
  styleId: z.string().trim().min(1).max(80),
  durationSec: z.number().int().min(5).max(120).optional(),
  aspectRatio: z.string().trim().max(20).optional(),
  resolution: z.string().trim().max(50).optional()
})

function mergeMetadata(prev: unknown, patch: Record<string, unknown>): Record<string, unknown> {
  const base = prev && typeof prev === "object" ? (prev as Record<string, unknown>) : {}
  return { ...base, ...patch }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const traceId = getTraceId(req.headers)
  const session = await getSessionFromRequest(req)
  const userId = session?.userId
  if (!userId) return NextResponse.json(makeApiErr(traceId, "AUTH_REQUIRED", "未登录或登录已过期"), { status: 401 })

  await ensureTvcSchema()

  const rawParams = await ctx.params
  const parsedParams = paramsSchema.safeParse(rawParams)
  if (!parsedParams.success) return NextResponse.json(makeApiErr(traceId, "VALIDATION_FAILED", "参数格式不正确"), { status: 400 })

  const body = await req.json().catch(() => null)
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json(makeApiErr(traceId, "VALIDATION_FAILED", "参数格式不正确"), { status: 400 })

  const db = await getDb({ tvcStories })
  const [row] = await db
    .select({
      id: tvcStories.id,
      userId: tvcStories.userId,
      storyType: tvcStories.storyType,
      metadata: tvcStories.metadata
    })
    .from(tvcStories)
    .where(eq(tvcStories.id, parsedParams.data.id))
    .limit(1)

  if (!row || row.userId !== userId || row.storyType !== "tvc") {
    return NextResponse.json(makeApiErr(traceId, "NOT_FOUND", "项目不存在"), { status: 404 })
  }

  const brief = parsed.data.brief.trim()
  const styleId = parsed.data.styleId.trim()
  const durationSec = parsed.data.durationSec ?? 30
  const aspectRatio = parsed.data.aspectRatio?.trim()
  const resolution = parsed.data.resolution?.trim()

  const nextMetadata = mergeMetadata(row.metadata, {
    tvc: mergeMetadata((row.metadata as any)?.tvc, {
      brief,
      styleId,
      durationSec,
      ...(aspectRatio ? { aspectRatio } : {}),
      ...(resolution ? { resolution } : {})
    })
  })

  await db
    .update(tvcStories)
    .set({
      storyText: brief || "TVC brief",
      shotStyle: styleId,
      ...(aspectRatio ? { aspectRatio } : {}),
      ...(resolution ? { resolution } : {}),
      metadata: nextMetadata as any,
      updatedAt: new Date()
    })
    .where(and(eq(tvcStories.id, row.id), eq(tvcStories.userId, userId)))

  const { jobId, snapshot } = await enqueueTvcGenerateShotlistJob({
    userId,
    traceId,
    storyId: row.id,
    brief,
    styleId,
    durationSec,
    ratio: aspectRatio,
    resolution
  })

  kickTvcShotlistWorker()

  return NextResponse.json(makeApiOk(traceId, { jobId, status: snapshot.status }), { status: 202 })
}
