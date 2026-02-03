import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { and, eq } from "drizzle-orm"
import { getDb } from "coze-coding-dev-sdk"
import { tvcStories } from "@/shared/schema"
import { getSessionFromRequest } from "@/shared/session"
import { getTraceId } from "@/shared/trace"
import { makeApiErr, makeApiOk } from "@/shared/api"
import { ensureTvcSchema } from "@/server/db/ensureTvcSchema"
import { getVibeSessionState } from "@/server/services/vibeCreating/vibeCreatingState"
import { resolveAssetUrl } from "@/server/services/vibeCreating/vibeCreatingAssets"

export const runtime = "nodejs"

const paramsSchema = z.object({
  id: z.string().trim().min(1).max(200)
})

const querySchema = z.object({
  sessionId: z.string().trim().min(1).max(200),
  kind: z.enum(["reference_image", "first_frame", "video_clip"]),
  index: z.coerce.number().int().min(1).max(1000000)
})

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const traceId = getTraceId(req.headers)
  const session = await getSessionFromRequest(req)
  const userId = session?.userId
  if (!userId) return NextResponse.json(makeApiErr(traceId, "AUTH_REQUIRED", "未登录或登录已过期"), { status: 401 })

  await ensureTvcSchema()

  const rawParams = await ctx.params
  const parsedParams = paramsSchema.safeParse(rawParams)
  if (!parsedParams.success) return NextResponse.json(makeApiErr(traceId, "VALIDATION_FAILED", "参数格式不正确"), { status: 400 })

  const url = new URL(req.url)
  const rawQuery = Object.fromEntries(url.searchParams.entries())
  const parsedQuery = querySchema.safeParse(rawQuery)
  if (!parsedQuery.success) return NextResponse.json(makeApiErr(traceId, "VALIDATION_FAILED", "参数格式不正确"), { status: 400 })

  const db = await getDb({ tvcStories })
  const [row] = await db
    .select({ id: tvcStories.id, userId: tvcStories.userId, storyType: tvcStories.storyType, metadata: tvcStories.metadata })
    .from(tvcStories)
    .where(and(eq(tvcStories.id, parsedParams.data.id), eq(tvcStories.userId, userId)))
    .limit(1)

  if (!row || row.storyType !== "tvc") return NextResponse.json(makeApiErr(traceId, "NOT_FOUND", "项目不存在"), { status: 404 })

  const vibe = getVibeSessionState((row.metadata ?? {}) as any, parsedQuery.data.sessionId)
  if (!vibe) return NextResponse.json(makeApiErr(traceId, "NOT_FOUND", "会话不存在"), { status: 404 })

  const resolved = resolveAssetUrl(vibe, parsedQuery.data.kind, parsedQuery.data.index)
  if (!resolved) return NextResponse.json(makeApiErr(traceId, "NOT_FOUND", "资源不存在"), { status: 404 })

  return NextResponse.json(makeApiOk(traceId, { url: resolved }), { status: 200 })
}

