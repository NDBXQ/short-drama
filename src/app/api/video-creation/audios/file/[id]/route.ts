import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { getDb } from "coze-coding-dev-sdk"
import { and, eq } from "drizzle-orm"
import { makeApiErr } from "@/shared/api"
import { getSessionFromRequest } from "@/shared/session"
import { getTraceId } from "@/shared/trace"
import { generatedAudios, stories, storyOutlines, storyboards } from "@/shared/schema"
import { getS3Storage } from "@/shared/storage"
import { resolveStorageUrl } from "@/shared/storageUrl"

export const runtime = "nodejs"

const paramsSchema = z.object({
  id: z.string().trim().min(1).max(200)
})

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const traceId = getTraceId(req.headers)
  const session = await getSessionFromRequest(req)
  const userId = session?.userId
  if (!userId) return NextResponse.json(makeApiErr(traceId, "AUTH_REQUIRED", "未登录或登录已过期"), { status: 401 })

  const rawParams = await ctx.params
  const parsed = paramsSchema.safeParse(rawParams)
  if (!parsed.success) return NextResponse.json(makeApiErr(traceId, "VALIDATION_FAILED", "参数不正确"), { status: 400 })

  const db = await getDb({ generatedAudios, stories, storyOutlines, storyboards })
  const rows = await db
    .select({
      storageKey: generatedAudios.storageKey,
      url: generatedAudios.url
    })
    .from(generatedAudios)
    .innerJoin(storyboards, eq(generatedAudios.storyboardId, storyboards.id))
    .innerJoin(storyOutlines, eq(storyboards.outlineId, storyOutlines.id))
    .innerJoin(stories, eq(storyOutlines.storyId, stories.id))
    .where(and(eq(generatedAudios.id, parsed.data.id), eq(stories.userId, userId)))
    .limit(1)

  const row = rows[0]
  if (!row) return NextResponse.json(makeApiErr(traceId, "NOT_FOUND", "音频不存在"), { status: 404 })

  const storageKey = row.storageKey
  const fallbackUrl = row.url
  if (!storageKey) {
    if (!fallbackUrl) return NextResponse.json(makeApiErr(traceId, "NOT_FOUND", "音频链接不存在"), { status: 404 })
    return NextResponse.redirect(fallbackUrl)
  }

  const storage = getS3Storage()
  try {
    const url = await resolveStorageUrl(storage, storageKey)
    return NextResponse.redirect(url)
  } catch {
    if (!fallbackUrl) return NextResponse.json(makeApiErr(traceId, "NOT_FOUND", "音频链接不存在"), { status: 404 })
    return NextResponse.redirect(fallbackUrl)
  }
}
