import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { and, eq } from "drizzle-orm"
import { getDb } from "coze-coding-dev-sdk"
import { makeApiErr, makeApiOk } from "@/shared/api"
import { getSessionFromRequest } from "@/shared/session"
import { getTraceId } from "@/shared/trace"
import { readEnv, readEnvInt } from "@/features/coze/env"
import { callCozeRunEndpoint } from "@/features/coze/runEndpointClient"
import { logger } from "@/shared/logger"
import { tvcStories } from "@/shared/schema"
import { ensureTvcSchema } from "@/server/db/ensureTvcSchema"

export const runtime = "nodejs"

const urlSchema = z.string().trim().max(5_000).refine((v) => v.startsWith("http"), {
  message: "url 必须是 http(s)"
})

const videoItemSchema = z
  .object({
    url: urlSchema,
    start_time: z.number().min(0),
    end_time: z.number().min(0)
  })
  .refine((v) => v.end_time > v.start_time, { message: "video_config_list.end_time 必须大于 start_time" })

const audioItemSchema = z
  .object({
    url: urlSchema,
    start_time: z.number().min(0),
    end_time: z.number().min(0),
    timeline_start: z.number().min(0)
  })
  .refine((v) => v.end_time > v.start_time, { message: "audio_config_list.end_time 必须大于 start_time" })

const inputSchema = z.object({
  storyId: z.string().trim().min(1).max(200),
  video_config_list: z.array(videoItemSchema).default([]),
  audio_config_list: z.array(audioItemSchema).default([])
})

const outputSchema = z
  .object({
    output_video_url: z.string().trim().url().max(5_000).optional(),
    final_video_url: z.string().trim().url().max(5_000).optional(),
    video_meta: z.unknown().optional()
  })
  .refine((v) => Boolean(v.output_video_url || v.final_video_url), { message: "缺少 output_video_url / final_video_url" })

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const traceId = getTraceId(req.headers)

  const session = await getSessionFromRequest(req)
  const userId = session?.userId
  if (!userId) return NextResponse.json(makeApiErr(traceId, "AUTH_REQUIRED", "未登录或登录已过期"), { status: 401 })

  await ensureTvcSchema()

  const rawParams = await ctx.params
  const storyId = (rawParams?.id ?? "").trim()
  if (!storyId) return NextResponse.json(makeApiErr(traceId, "VALIDATION_FAILED", "参数格式不正确"), { status: 400 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(makeApiErr(traceId, "INVALID_JSON", "请求体不是合法 JSON"), { status: 400 })
  }

  const parsed = inputSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json(makeApiErr(traceId, "VALIDATION_FAILED", "参数格式不正确"), { status: 400 })

  const token = readEnv("COZE_VIDEO_EDIT_API_TOKEN")
  const url = readEnv("VIDEO_EDIT_API_URL") ?? "https://h4y9qnk5qt.coze.site/run"
  if (!token) return NextResponse.json(makeApiErr(traceId, "COZE_NOT_CONFIGURED", "未配置 COZE_VIDEO_EDIT_API_TOKEN"), { status: 500 })
  const timeoutMs = readEnvInt("REQUEST_TIMEOUT_MS") ?? 120_000

  const db = await getDb({ tvcStories })
  const allowed = await db.select({ id: tvcStories.id, userId: tvcStories.userId }).from(tvcStories).where(eq(tvcStories.id, storyId)).limit(1)
  if (!allowed[0] || allowed[0].userId !== userId) return NextResponse.json(makeApiErr(traceId, "NOT_FOUND", "项目不存在"), { status: 404 })

  const startedAt = performance.now()
  logger.info({
    event: "tvc_video_edit_start",
    module: "tvc",
    traceId,
    message: "开始请求 TVC 视频剪辑合成",
    userId,
    videoClips: parsed.data.video_config_list.length,
    audioClips: parsed.data.audio_config_list.length
  })

  try {
    const coze = await callCozeRunEndpoint({
      traceId,
      url,
      token,
      timeoutMs,
      module: "video-edit",
      body: {
        video_config_list: parsed.data.video_config_list,
        audio_config_list: parsed.data.audio_config_list
      }
    })

    const normalized = outputSchema.safeParse(coze.data)
    if (!normalized.success) {
      logger.warn({
        event: "tvc_video_edit_invalid_response",
        module: "tvc",
        traceId,
        message: "剪辑接口返回格式不符合预期",
        durationMs: Math.round(performance.now() - startedAt)
      })
      return NextResponse.json(makeApiErr(traceId, "VIDEO_EDIT_INVALID_RESPONSE", "剪辑接口返回格式不符合预期"), { status: 502 })
    }

    const resultUrl = (normalized.data.output_video_url ?? normalized.data.final_video_url ?? "").trim()
    await db
      .update(tvcStories)
      .set({ finalVideoUrl: resultUrl, updatedAt: new Date(), progressStage: "done" })
      .where(and(eq(tvcStories.id, storyId), eq(tvcStories.userId, userId)))
      .returning({ id: tvcStories.id })

    logger.info({
      event: "tvc_video_edit_success",
      module: "tvc",
      traceId,
      message: "TVC 视频剪辑合成成功",
      durationMs: Math.round(performance.now() - startedAt)
    })

    return NextResponse.json(makeApiOk(traceId, { finalVideoUrl: resultUrl }), { status: 200 })
  } catch (e) {
    logger.error({
      event: "tvc_video_edit_error",
      module: "tvc",
      traceId,
      message: "TVC 视频剪辑合成异常"
    })
    return NextResponse.json(makeApiErr(traceId, "VIDEO_EDIT_FAILED", "剪辑失败，请稍后重试"), { status: 500 })
  }
}

