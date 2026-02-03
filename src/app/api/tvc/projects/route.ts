import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { and, desc, eq } from "drizzle-orm"
import { getDb } from "coze-coding-dev-sdk"
import { tvcStories } from "@/shared/schema"
import { getSessionFromRequest } from "@/shared/session"
import { getTraceId } from "@/shared/trace"
import { makeApiErr, makeApiOk } from "@/shared/api"
import { ensureTvcSchema } from "@/server/db/ensureTvcSchema"

export const runtime = "nodejs"

const createSchema = z.object({
  title: z.string().trim().max(100).optional(),
  brief: z.string().trim().max(50_000).optional(),
  styleId: z.string().trim().max(80).optional(),
  durationSec: z.number().int().min(5).max(120).optional(),
  aspectRatio: z.string().trim().max(20).optional(),
  resolution: z.string().trim().max(50).optional()
})

const listSchema = z.object({
  limit: z.string().trim().optional()
})

export async function POST(req: NextRequest): Promise<Response> {
  const traceId = getTraceId(req.headers)
  const session = await getSessionFromRequest(req)
  const userId = session?.userId
  if (!userId) return NextResponse.json(makeApiErr(traceId, "AUTH_REQUIRED", "未登录或登录已过期"), { status: 401 })

  await ensureTvcSchema()

  const body = await req.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json(makeApiErr(traceId, "VALIDATION_FAILED", "参数格式不正确"), { status: 400 })

  const title = parsed.data.title?.trim() || "TVC 项目"
  const aspectRatio = parsed.data.aspectRatio?.trim() || "16:9"
  const resolution = parsed.data.resolution?.trim() || "1080p"
  const styleId = parsed.data.styleId?.trim() || "cinema"
  const brief = parsed.data.brief?.trim() || ""
  const durationSec = parsed.data.durationSec ?? 30

  const db = await getDb({ tvcStories })
  const [row] = await db
    .insert(tvcStories)
    .values({
      userId,
      title,
      storyType: "tvc",
      aspectRatio,
      resolution,
      shotStyle: styleId,
      storyText: brief || "TVC brief",
      metadata: { tvc: { brief, styleId, durationSec } } as any
    })
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
      updatedAt: tvcStories.updatedAt
    })

  return NextResponse.json(makeApiOk(traceId, { project: row }), { status: 200 })
}

export async function GET(req: NextRequest): Promise<Response> {
  const traceId = getTraceId(req.headers)
  const session = await getSessionFromRequest(req)
  const userId = session?.userId
  if (!userId) return NextResponse.json(makeApiErr(traceId, "AUTH_REQUIRED", "未登录或登录已过期"), { status: 401 })

  await ensureTvcSchema()

  const url = new URL(req.url)
  const parsed = listSchema.safeParse(Object.fromEntries(url.searchParams.entries()))
  if (!parsed.success) return NextResponse.json(makeApiErr(traceId, "VALIDATION_FAILED", "参数格式不正确"), { status: 400 })
  const limitRaw = Number(parsed.data.limit ?? "20")
  const limit = Number.isFinite(limitRaw) ? Math.min(50, Math.max(1, Math.floor(limitRaw))) : 20

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
    .where(and(eq(tvcStories.userId, userId), eq(tvcStories.storyType, "tvc")))
    .orderBy(desc(tvcStories.updatedAt), desc(tvcStories.createdAt))
    .limit(limit)

  return NextResponse.json(makeApiOk(traceId, { projects: rows }), { status: 200 })
}
