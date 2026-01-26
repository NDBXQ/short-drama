import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { getDb } from "coze-coding-dev-sdk"
import { publicResources } from "@/shared/schema"
import { getSessionFromRequest } from "@/shared/session"
import { getTraceId } from "@/shared/trace"
import { makeApiErr } from "@/shared/api"
import { getS3Storage } from "@/shared/storage"
import { and, eq } from "drizzle-orm"

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

  const kind = req.nextUrl.searchParams.get("kind") === "preview" ? "preview" : "original"

  const db = await getDb({ publicResources })
  const rows = await db
    .select({
      id: publicResources.id,
      previewUrl: publicResources.previewUrl,
      originalUrl: publicResources.originalUrl,
      previewStorageKey: publicResources.previewStorageKey,
      originalStorageKey: publicResources.originalStorageKey
    })
    .from(publicResources)
    .where(and(eq(publicResources.id, parsed.data.id)))
    .limit(1)

  const row = rows[0]
  if (!row) return NextResponse.json(makeApiErr(traceId, "NOT_FOUND", "资源不存在"), { status: 404 })

  const storageKey = kind === "preview" ? row.previewStorageKey : row.originalStorageKey
  const fallbackUrl = kind === "preview" ? row.previewUrl : (row.originalUrl || row.previewUrl)
  if (!storageKey) {
    if (!fallbackUrl) return NextResponse.json(makeApiErr(traceId, "NOT_FOUND", "资源链接不存在"), { status: 404 })
    return NextResponse.redirect(fallbackUrl)
  }

  const storage = getS3Storage()
  try {
    const signed = await storage.generatePresignedUrl({ key: storageKey, expireTime: 60 * 10 })
    return NextResponse.redirect(signed)
  } catch {
    if (!fallbackUrl) return NextResponse.json(makeApiErr(traceId, "NOT_FOUND", "资源链接不存在"), { status: 404 })
    return NextResponse.redirect(fallbackUrl)
  }
}

