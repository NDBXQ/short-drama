import { NextResponse, type NextRequest } from "next/server"
import { getDb } from "coze-coding-dev-sdk"
import { generatedImages, publicResources, stories } from "@/shared/schema"
import { getSessionFromRequest } from "@/shared/session"
import { getTraceId } from "@/shared/trace"
import { makeApiErr, makeApiOk } from "@/shared/api"
import { logger } from "@/shared/logger"
import { sql } from "drizzle-orm"

export const runtime = "nodejs"

export async function POST(req: NextRequest): Promise<Response> {
  const traceId = getTraceId(req.headers)
  const start = Date.now()

  const session = await getSessionFromRequest(req)
  const userId = session?.userId
  if (!userId) return NextResponse.json(makeApiErr(traceId, "AUTH_REQUIRED", "未登录或登录已过期"), { status: 401 })

  logger.info({
    event: "library_public_resources_backfill_userid_start",
    module: "library",
    traceId,
    message: "开始回填资源库 userId",
    userId
  })

  const db = await getDb({ publicResources, generatedImages, stories })
  const result = await db.execute(sql`
    UPDATE ${publicResources} AS pr
    SET user_id = ${userId}
    FROM ${generatedImages} AS gi
    JOIN ${stories} AS s ON s.id = gi.story_id
    WHERE pr.user_id IS NULL
      AND pr.original_storage_key IS NOT NULL
      AND pr.original_storage_key = gi.storage_key
      AND s.user_id = ${userId}
  `)

  const rowCount = Number((result as any)?.rowCount ?? 0)
  logger.info({
    event: "library_public_resources_backfill_userid_success",
    module: "library",
    traceId,
    message: "回填资源库 userId 完成",
    userId,
    updatedCount: rowCount,
    durationMs: Date.now() - start
  })

  return NextResponse.json(makeApiOk(traceId, { updatedCount: rowCount }), { status: 200 })
}
