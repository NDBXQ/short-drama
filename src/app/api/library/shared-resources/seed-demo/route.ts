import { NextResponse, type NextRequest } from "next/server"
import { getDb } from "coze-coding-dev-sdk"
import { publicResources, sharedResources } from "@/shared/schema"
import { getSessionFromRequest } from "@/shared/session"
import { getTraceId } from "@/shared/trace"
import { makeApiErr, makeApiOk } from "@/shared/api"
import { logger } from "@/shared/logger"
import { sql } from "drizzle-orm"
import { z } from "zod"

export const runtime = "nodejs"

const bodySchema = z.object({
  limit: z.number().int().min(1).max(50).optional()
})

export async function POST(req: NextRequest): Promise<Response> {
  const traceId = getTraceId(req.headers)
  const start = Date.now()

  const session = await getSessionFromRequest(req)
  const userId = session?.userId
  if (!userId) return NextResponse.json(makeApiErr(traceId, "AUTH_REQUIRED", "未登录或登录已过期"), { status: 401 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json(makeApiErr(traceId, "VALIDATION_FAILED", "参数不正确"), { status: 400 })

  const limit = parsed.data.limit ?? 12

  logger.info({
    event: "library_shared_resources_seed_demo_start",
    module: "library",
    traceId,
    message: "开始填充共享资源库演示数据",
    userId,
    limit
  })

  const db = await getDb({ publicResources, sharedResources })
  const inserted = await db.execute(sql`
    INSERT INTO ${sharedResources} (
      id,
      type,
      source,
      name,
      description,
      preview_url,
      preview_storage_key,
      original_url,
      original_storage_key,
      tags,
      applicable_scenes,
      created_at
    )
    SELECT
      gen_random_uuid(),
      pr.type,
      'seed',
      pr.name,
      pr.description,
      pr.preview_url,
      pr.preview_storage_key,
      pr.original_url,
      pr.original_storage_key,
      pr.tags,
      pr.applicable_scenes,
      pr.created_at
    FROM ${publicResources} pr
    WHERE pr.user_id = ${userId}
    ORDER BY pr.created_at DESC
    LIMIT ${limit}
  `)

  const insertedCount = Number((inserted as any)?.rowCount ?? 0)

  logger.info({
    event: "library_shared_resources_seed_demo_success",
    module: "library",
    traceId,
    message: "填充共享资源库演示数据完成",
    userId,
    insertedCount,
    durationMs: Date.now() - start
  })

  return NextResponse.json(makeApiOk(traceId, { insertedCount }), { status: 200 })
}

