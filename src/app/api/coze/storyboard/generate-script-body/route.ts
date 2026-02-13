import { NextResponse } from "next/server"
import { z } from "zod"
import { readEnv } from "@/features/coze/env"
import { CozeRunEndpointError } from "@/features/coze/runEndpointClient"
import { makeApiErr, makeApiOk } from "@/shared/api"
import { logger } from "@/shared/logger"
import { getTraceId } from "@/shared/trace"
import { getSessionFromRequest } from "@/shared/session"
import type { NextRequest } from "next/server"

const inputSchema = z.object({
  storyId: z.string().trim().min(1).max(200),
  planning_result: z.any().optional(),
  world_setting: z.any().optional(),
  character_settings: z.any().optional(),
  outline_json: z.any().optional()
})

import { runGenerateScriptBody } from "@/server/domains/storyboard/integrations/cozeScriptBodyTasks"

export const runtime = "nodejs"

export async function POST(req: Request): Promise<Response> {
  const traceId = getTraceId(req.headers)
  const start = Date.now()

  logger.info({
    event: "storyboard_script_body_start",
    module: "coze",
    traceId,
    message: "开始生成剧本正文"
  })

  let json: unknown
  try {
    json = await req.json()
  } catch {
    return NextResponse.json(makeApiErr(traceId, "COZE_INVALID_JSON", "请求体不是合法 JSON"), {
      status: 400
    })
  }

  const parsed = inputSchema.safeParse(json)
  if (!parsed.success) {
    logger.warn({
      event: "storyboard_script_body_validation_failed",
      module: "coze",
      traceId,
      message: "剧本正文生成入参校验失败"
    })
    return NextResponse.json(makeApiErr(traceId, "COZE_VALIDATION_FAILED", "入参格式不正确"), {
      status: 400
    })
  }

  const url = readEnv("SHORT_DRAMA_SCRIPT_BODY_API_URL")
  const token = readEnv("SHORT_DRAMA_SCRIPT_BODY_API_TOKEN")
  if (!url || !token) {
    return NextResponse.json(
      makeApiErr(
        traceId,
        "COZE_NOT_CONFIGURED",
        "Coze 未配置，请设置 SHORT_DRAMA_SCRIPT_BODY_API_URL 与 SHORT_DRAMA_SCRIPT_BODY_API_TOKEN"
      ),
      { status: 500 }
    )
  }

  try {
    const session = await getSessionFromRequest(req as unknown as NextRequest)
    const userId = session?.userId
    if (!userId) {
      return NextResponse.json(makeApiErr(traceId, "AUTH_REQUIRED", "未登录或登录已过期"), {
        status: 401
      })
    }

    const result = await runGenerateScriptBody({
      traceId,
      userId,
      storyId: parsed.data.storyId,
      planning_result: parsed.data.planning_result,
      world_setting: parsed.data.world_setting,
      character_settings: parsed.data.character_settings,
      outline_json: parsed.data.outline_json
    })

    logger.info({
      event: "storyboard_script_body_success",
      module: "coze",
      traceId,
      message: "剧本正文生成成功",
      durationMs: result.durationMs,
      cozeStatus: result.cozeStatus,
      storyId: result.storyId
    })

    return NextResponse.json(makeApiOk(traceId, { storyId: result.storyId, script_body: result.scriptBody, coze: result.coze }), {
      status: 200
    })
  } catch (err) {
    const durationMs = Date.now() - start
    if (err instanceof CozeRunEndpointError) {
      logger.error({
        event: "storyboard_script_body_failed",
        module: "coze",
        traceId,
        message: "剧本正文生成失败（Coze 调用失败）",
        durationMs,
        status: err.status
      })
      return NextResponse.json(makeApiErr(traceId, "COZE_REQUEST_FAILED", "Coze 调用失败，请稍后重试"), {
        status: 502
      })
    }

    const anyErr = err as { name?: string; message?: string; stack?: string }
    const msg = String(anyErr?.message ?? "")
    if (msg === "STORY_NOT_FOUND") {
      return NextResponse.json(makeApiErr(traceId, "NOT_FOUND", "剧本不存在"), { status: 404 })
    }
    if (msg === "FORBIDDEN") {
      return NextResponse.json(makeApiErr(traceId, "FORBIDDEN", "无权限访问该剧本"), { status: 403 })
    }

    logger.error({
      event: "storyboard_script_body_error",
      module: "coze",
      traceId,
      message: "剧本正文生成异常",
      durationMs,
      errorName: anyErr?.name,
      errorMessage: anyErr?.message,
      stack: anyErr?.stack
    })

    return NextResponse.json(makeApiErr(traceId, "COZE_UNKNOWN", "生成失败，请稍后重试"), {
      status: 500
    })
  }
}

