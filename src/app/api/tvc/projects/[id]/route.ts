import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { and, eq } from "drizzle-orm"
import { getDb } from "coze-coding-dev-sdk"
import { tvcStories } from "@/shared/schema"
import { getSessionFromRequest } from "@/shared/session"
import { getTraceId } from "@/shared/trace"
import { makeApiErr, makeApiOk } from "@/shared/api"
import { ensureTvcSchema } from "@/server/db/ensureTvcSchema"

export const runtime = "nodejs"

const paramsSchema = z.object({
  id: z.string().trim().min(1).max(200)
})

const patchSchema = z.object({
  title: z.string().trim().max(100).optional(),
  brief: z.string().trim().max(50_000).optional(),
  styleId: z.string().trim().max(80).optional(),
  durationSec: z.number().int().min(5).max(120).optional(),
  aspectRatio: z.string().trim().max(20).optional(),
  resolution: z.string().trim().max(50).optional()
})

function mergeMetadata(prev: unknown, patch: Record<string, unknown>): Record<string, unknown> {
  const base = prev && typeof prev === "object" ? (prev as Record<string, unknown>) : {}
  return { ...base, ...patch }
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const traceId = getTraceId(req.headers)
  const session = await getSessionFromRequest(req)
  const userId = session?.userId
  if (!userId) return NextResponse.json(makeApiErr(traceId, "AUTH_REQUIRED", "未登录或登录已过期"), { status: 401 })

  await ensureTvcSchema()

  const rawParams = await ctx.params
  const parsed = paramsSchema.safeParse(rawParams)
  if (!parsed.success) return NextResponse.json(makeApiErr(traceId, "VALIDATION_FAILED", "参数格式不正确"), { status: 400 })

  const db = await getDb({ tvcStories })
  const rows = await db
    .select({
      id: tvcStories.id,
      title: tvcStories.title,
      storyType: tvcStories.storyType,
      aspectRatio: tvcStories.aspectRatio,
      resolution: tvcStories.resolution,
      shotStyle: tvcStories.shotStyle,
      storyText: tvcStories.storyText,
      metadata: tvcStories.metadata,
      createdAt: tvcStories.createdAt,
      updatedAt: tvcStories.updatedAt,
      progressStage: tvcStories.progressStage,
      status: tvcStories.status
    })
    .from(tvcStories)
    .where(and(eq(tvcStories.id, parsed.data.id), eq(tvcStories.userId, userId)))
    .limit(1)

  const row = rows[0]
  if (!row || row.storyType !== "tvc") return NextResponse.json(makeApiErr(traceId, "NOT_FOUND", "项目不存在"), { status: 404 })

  return NextResponse.json(makeApiOk(traceId, { project: row }), { status: 200 })
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const traceId = getTraceId(req.headers)
  const session = await getSessionFromRequest(req)
  const userId = session?.userId
  if (!userId) return NextResponse.json(makeApiErr(traceId, "AUTH_REQUIRED", "未登录或登录已过期"), { status: 401 })

  await ensureTvcSchema()

  const rawParams = await ctx.params
  const parsedParams = paramsSchema.safeParse(rawParams)
  if (!parsedParams.success) return NextResponse.json(makeApiErr(traceId, "VALIDATION_FAILED", "参数格式不正确"), { status: 400 })

  const body = await req.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json(makeApiErr(traceId, "VALIDATION_FAILED", "参数格式不正确"), { status: 400 })

  const db = await getDb({ tvcStories })
  const [existing] = await db
    .select({
      id: tvcStories.id,
      userId: tvcStories.userId,
      storyType: tvcStories.storyType,
      metadata: tvcStories.metadata
    })
    .from(tvcStories)
    .where(eq(tvcStories.id, parsedParams.data.id))
    .limit(1)

  if (!existing || existing.userId !== userId || existing.storyType !== "tvc") {
    return NextResponse.json(makeApiErr(traceId, "NOT_FOUND", "项目不存在"), { status: 404 })
  }

  const title = parsed.data.title?.trim()
  const aspectRatio = parsed.data.aspectRatio?.trim()
  const resolution = parsed.data.resolution?.trim()
  const styleId = parsed.data.styleId?.trim()
  const brief = parsed.data.brief?.trim()
  const durationSec = parsed.data.durationSec

  const nextMetadata = mergeMetadata(existing.metadata, {
    tvc: mergeMetadata((existing.metadata as any)?.tvc, {
      ...(brief !== undefined ? { brief } : {}),
      ...(styleId !== undefined ? { styleId } : {}),
      ...(durationSec !== undefined ? { durationSec } : {}),
      ...(aspectRatio !== undefined ? { aspectRatio } : {}),
      ...(resolution !== undefined ? { resolution } : {})
    })
  })

  const [updated] = await db
    .update(tvcStories)
    .set({
      ...(title !== undefined ? { title } : {}),
      ...(aspectRatio !== undefined ? { aspectRatio } : {}),
      ...(resolution !== undefined ? { resolution } : {}),
      ...(styleId !== undefined ? { shotStyle: styleId } : {}),
      ...(brief !== undefined ? { storyText: brief || "TVC brief" } : {}),
      metadata: nextMetadata as any,
      updatedAt: new Date()
    })
    .where(and(eq(tvcStories.id, existing.id), eq(tvcStories.userId, userId)))
    .returning({
      id: tvcStories.id,
      title: tvcStories.title,
      storyType: tvcStories.storyType,
      aspectRatio: tvcStories.aspectRatio,
      resolution: tvcStories.resolution,
      shotStyle: tvcStories.shotStyle,
      storyText: tvcStories.storyText,
      metadata: tvcStories.metadata,
      createdAt: tvcStories.createdAt,
      updatedAt: tvcStories.updatedAt,
      progressStage: tvcStories.progressStage,
      status: tvcStories.status
    })

  return NextResponse.json(makeApiOk(traceId, { project: updated }), { status: 200 })
}
