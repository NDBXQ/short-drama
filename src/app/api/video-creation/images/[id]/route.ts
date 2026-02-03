import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { and, eq } from "drizzle-orm"
import { getDb } from "coze-coding-dev-sdk"
import { makeApiErr, makeApiOk } from "@/shared/api"
import { getSessionFromRequest } from "@/shared/session"
import { getTraceId } from "@/shared/trace"
import { generatedImages, stories } from "@/shared/schema"

const paramsSchema = z.object({
  id: z.string().trim().min(1).max(200)
})

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const traceId = getTraceId(req.headers)
  const session = await getSessionFromRequest(req)
  const userId = session?.userId
  if (!userId) return NextResponse.json(makeApiErr(traceId, "AUTH_REQUIRED", "未登录或登录已过期"), { status: 401 })

  const raw = await params
  const parsed = paramsSchema.safeParse({ id: raw?.id })
  if (!parsed.success) return NextResponse.json(makeApiErr(traceId, "VALIDATION_FAILED", "参数格式不正确"), { status: 400 })

  const db = await getDb({ generatedImages, stories })

  const allowed = await db
    .select({ id: generatedImages.id })
    .from(generatedImages)
    .innerJoin(stories, eq(generatedImages.storyId, stories.id))
    .where(and(eq(generatedImages.id, parsed.data.id), eq(stories.userId, userId)))
    .limit(1)

  if (allowed.length === 0) {
    return NextResponse.json(makeApiErr(traceId, "NOT_FOUND", "素材不存在或无权限删除"), { status: 404 })
  }

  await db.delete(generatedImages).where(eq(generatedImages.id, parsed.data.id))

  return NextResponse.json(makeApiOk(traceId, { id: parsed.data.id }), { status: 200 })
}
