import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { asc, eq, inArray } from "drizzle-orm"
import { getDb } from "coze-coding-dev-sdk"
import { tvcStories, tvcStoryOutlines, tvcStoryboards } from "@/shared/schema"
import { getSessionFromRequest } from "@/shared/session"
import { getTraceId } from "@/shared/trace"
import { makeApiErr, makeApiOk } from "@/shared/api"
import { ensureTvcSchema } from "@/server/db/ensureTvcSchema"

export const runtime = "nodejs"

const paramsSchema = z.object({
  id: z.string().trim().min(1).max(200)
})

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const traceId = getTraceId(req.headers)
  const session = await getSessionFromRequest(req)
  const userId = session?.userId
  if (!userId) return NextResponse.json(makeApiErr(traceId, "AUTH_REQUIRED", "未登录或登录已过期"), { status: 401 })

  await ensureTvcSchema()

  const rawParams = await ctx.params
  const parsed = paramsSchema.safeParse(rawParams)
  if (!parsed.success) return NextResponse.json(makeApiErr(traceId, "VALIDATION_FAILED", "参数格式不正确"), { status: 400 })

  const db = await getDb({ tvcStories, tvcStoryOutlines, tvcStoryboards })
  const [story] = await db
    .select({ id: tvcStories.id, userId: tvcStories.userId, storyType: tvcStories.storyType })
    .from(tvcStories)
    .where(eq(tvcStories.id, parsed.data.id))
    .limit(1)
  if (!story || story.userId !== userId || story.storyType !== "tvc") {
    return NextResponse.json(makeApiErr(traceId, "NOT_FOUND", "项目不存在"), { status: 404 })
  }

  const outlines = await db
    .select({
      id: tvcStoryOutlines.id,
      sequence: tvcStoryOutlines.sequence,
      outlineText: tvcStoryOutlines.outlineText,
      originalText: tvcStoryOutlines.originalText
    })
    .from(tvcStoryOutlines)
    .where(eq(tvcStoryOutlines.storyId, story.id))
    .orderBy(asc(tvcStoryOutlines.sequence))

  const outlineIds = outlines.map((o) => o.id)
  const shots =
    outlineIds.length > 0
      ? await db
          .select({
            id: tvcStoryboards.id,
            outlineId: tvcStoryboards.outlineId,
            sequence: tvcStoryboards.sequence,
            storyboardText: tvcStoryboards.storyboardText,
            shotCut: tvcStoryboards.shotCut,
            scriptContent: tvcStoryboards.scriptContent,
            frames: tvcStoryboards.frames,
            videoInfo: tvcStoryboards.videoInfo
          })
          .from(tvcStoryboards)
          .where(inArray(tvcStoryboards.outlineId, outlineIds))
          .orderBy(asc(tvcStoryboards.outlineId), asc(tvcStoryboards.sequence))
      : []

  return NextResponse.json(makeApiOk(traceId, { storyId: story.id, outlines, shots }), { status: 200 })
}
