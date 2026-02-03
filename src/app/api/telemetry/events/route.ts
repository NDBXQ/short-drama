import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { getDb } from "coze-coding-dev-sdk"
import { telemetryEvents } from "@/shared/schema"
import { getSessionFromRequest } from "@/shared/session"
import { getTraceId } from "@/shared/trace"
import { makeApiErr, makeApiOk } from "@/shared/api"
import { logger } from "@/shared/logger"
import { ensureTelemetryTable } from "@/server/db/ensureTelemetryTable"

export const runtime = "nodejs"

const bodySchema = z.object({
  event: z.string().trim().min(1).max(120),
  page: z.string().trim().min(1).max(240),
  payload: z.record(z.string(), z.unknown()).optional()
})

export async function POST(req: NextRequest): Promise<Response> {
  const traceId = getTraceId(req.headers)
  const start = Date.now()

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(makeApiErr(traceId, "VALIDATION_FAILED", "请求参数不正确"), { status: 400 })
  }

  const session = await getSessionFromRequest(req)
  const userId = session?.userId ?? null

  const userAgent = req.headers.get("user-agent") ?? null
  const referrer = req.headers.get("referer") ?? null

  try {
    await ensureTelemetryTable()
    const db = await getDb({ telemetryEvents })
    await db.insert(telemetryEvents).values({
      traceId,
      userId,
      page: parsed.data.page,
      event: parsed.data.event,
      payload: parsed.data.payload ?? {},
      userAgent,
      referrer
    })

    logger.info({
      event: "telemetry_event_ingested",
      module: "telemetry",
      traceId,
      message: "Telemetry 事件写入成功",
      page: parsed.data.page,
      eventName: parsed.data.event,
      durationMs: Date.now() - start
    })

    return NextResponse.json(makeApiOk(traceId, { ok: true }), { status: 200 })
  } catch (err) {
    const anyErr = err as { name?: string; message?: string; stack?: string }
    logger.error({
      event: "telemetry_event_ingest_failed",
      module: "telemetry",
      traceId,
      message: "Telemetry 事件写入失败",
      page: parsed.data.page,
      eventName: parsed.data.event,
      errorName: anyErr?.name,
      errorMessage: anyErr?.message,
      stack: anyErr?.stack,
      durationMs: Date.now() - start
    })
    return NextResponse.json(makeApiErr(traceId, "TELEMETRY_WRITE_FAILED", "写入失败"), { status: 500 })
  }
}
