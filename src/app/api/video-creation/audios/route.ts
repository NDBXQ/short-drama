import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { and, desc, eq } from "drizzle-orm"
import { getDb } from "coze-coding-dev-sdk"
import { makeApiErr, makeApiOk } from "@/shared/api"
import { generatedAudios, stories, storyOutlines, storyboards } from "@/shared/schema"
import { getSessionFromRequest } from "@/shared/session"
import { getTraceId } from "@/shared/trace"

const querySchema = z.object({
  storyboardId: z.string().trim().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(10_000).default(0)
})

export async function GET(req: NextRequest): Promise<Response> {
  const traceId = getTraceId(req.headers)
  const session = await getSessionFromRequest(req)
  const userId = session?.userId
  if (!userId) return NextResponse.json(makeApiErr(traceId, "AUTH_REQUIRED", "未登录或登录已过期"), { status: 401 })

  const url = new URL(req.url)
  const parsed = querySchema.safeParse({
    storyboardId: url.searchParams.get("storyboardId") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
    offset: url.searchParams.get("offset") ?? undefined
  })
  if (!parsed.success) return NextResponse.json(makeApiErr(traceId, "VALIDATION_FAILED", "参数格式不正确"), { status: 400 })

  const { storyboardId, limit, offset } = parsed.data

  const db = await getDb({ generatedAudios, stories, storyOutlines, storyboards })

  const allowed = await db
    .select({ storyboardId: storyboards.id, storyId: stories.id })
    .from(storyboards)
    .innerJoin(storyOutlines, eq(storyboards.outlineId, storyOutlines.id))
    .innerJoin(stories, eq(storyOutlines.storyId, stories.id))
    .where(and(eq(storyboards.id, storyboardId), eq(stories.userId, userId)))
    .limit(1)
  if (allowed.length === 0) return NextResponse.json(makeApiErr(traceId, "STORYBOARD_NOT_FOUND", "未找到可用的分镜"), { status: 404 })

  const rows = await db
    .select({
      id: generatedAudios.id,
      storyboardId: generatedAudios.storyboardId,
      storyId: generatedAudios.storyId,
      roleName: generatedAudios.roleName,
      speakerId: generatedAudios.speakerId,
      speakerName: generatedAudios.speakerName,
      content: generatedAudios.content,
      url: generatedAudios.url,
      storageKey: generatedAudios.storageKey,
      audioSize: generatedAudios.audioSize,
      createdAt: generatedAudios.createdAt
    })
    .from(generatedAudios)
    .where(and(eq(generatedAudios.storyboardId, storyboardId), eq(generatedAudios.storyId, allowed[0]!.storyId)))
    .orderBy(desc(generatedAudios.createdAt))
    .limit(limit)
    .offset(offset)

  return NextResponse.json(makeApiOk(traceId, { storyboardId, items: rows, limit, offset }), { status: 200 })
}

