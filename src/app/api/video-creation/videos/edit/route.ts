import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { getDb } from "coze-coding-dev-sdk"
import { makeApiErr, makeApiOk } from "@/shared/api"
import { getSessionFromRequest } from "@/shared/session"
import { getTraceId } from "@/shared/trace"
import { readEnv, readEnvInt } from "@/features/coze/env"
import { callCozeRunEndpoint, CozeRunEndpointError } from "@/features/coze/runEndpointClient"
import { logger } from "@/shared/logger"
import { generatedAudios, publicResources, stories } from "@/shared/schema"
import { getS3Storage } from "@/shared/storage"
import { and, eq, inArray } from "drizzle-orm"

export const runtime = "nodejs"

const STABLE_PUBLIC_RESOURCE_PREFIX = "/api/library/public-resources/file/"
const STABLE_GENERATED_AUDIO_PREFIX = "/api/video-creation/audios/file/"

const urlSchema = z
  .string()
  .trim()
  .max(5_000)
  .refine((v) => v.startsWith("http") || v.startsWith(STABLE_PUBLIC_RESOURCE_PREFIX) || v.startsWith(STABLE_GENERATED_AUDIO_PREFIX), {
    message: "url 必须是 http(s) 或稳定资源路径"
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

function extractStableResourceId(input: string, origin: string): { id: string; kind: "preview" | "original" } | null {
  const raw = input.trim()
  if (raw.startsWith(STABLE_PUBLIC_RESOURCE_PREFIX)) {
    const u = new URL(raw, origin)
    const id = u.pathname.slice(STABLE_PUBLIC_RESOURCE_PREFIX.length).split("/")[0] || ""
    const kind = u.searchParams.get("kind") === "preview" ? "preview" : "original"
    return id ? { id, kind } : null
  }
  if (raw.startsWith("http")) {
    try {
      const u = new URL(raw)
      if (u.origin !== origin) return null
      if (!u.pathname.startsWith(STABLE_PUBLIC_RESOURCE_PREFIX)) return null
      const id = u.pathname.slice(STABLE_PUBLIC_RESOURCE_PREFIX.length).split("/")[0] || ""
      const kind = u.searchParams.get("kind") === "preview" ? "preview" : "original"
      return id ? { id, kind } : null
    } catch {
      return null
    }
  }
  return null
}

function extractGeneratedAudioId(input: string, origin: string): string | null {
  const raw = input.trim()
  if (raw.startsWith(STABLE_GENERATED_AUDIO_PREFIX)) {
    const u = new URL(raw, origin)
    const id = u.pathname.slice(STABLE_GENERATED_AUDIO_PREFIX.length).split("/")[0] || ""
    return id || null
  }
  if (raw.startsWith("http")) {
    try {
      const u = new URL(raw)
      if (u.origin !== origin) return null
      if (!u.pathname.startsWith(STABLE_GENERATED_AUDIO_PREFIX)) return null
      const id = u.pathname.slice(STABLE_GENERATED_AUDIO_PREFIX.length).split("/")[0] || ""
      return id || null
    } catch {
      return null
    }
  }
  return null
}

export async function POST(req: NextRequest): Promise<Response> {
  const traceId = getTraceId(req.headers)

  const session = await getSessionFromRequest(req)
  const userId = session?.userId
  if (!userId) return NextResponse.json(makeApiErr(traceId, "AUTH_REQUIRED", "未登录或登录已过期"), { status: 401 })

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

  const startedAt = performance.now()
  logger.info({
    event: "video_edit_start",
    module: "video-edit",
    traceId,
    message: "开始请求视频剪辑合成",
    userId,
    videoClips: parsed.data.video_config_list.length,
    audioClips: parsed.data.audio_config_list.length
  })

  try {
    const origin = req.nextUrl.origin
    const db = await getDb({ publicResources, generatedAudios, stories })

    const publicTargets = [...parsed.data.video_config_list, ...parsed.data.audio_config_list]
      .map((it) => extractStableResourceId(it.url, origin))
      .filter(Boolean) as Array<{ id: string; kind: "preview" | "original" }>

    const uniquePublicIds = Array.from(new Set(publicTargets.map((t) => t.id)))
    const resourceRows =
      uniquePublicIds.length > 0
        ? await db
            .select({
              id: publicResources.id,
              previewUrl: publicResources.previewUrl,
              originalUrl: publicResources.originalUrl,
              previewStorageKey: publicResources.previewStorageKey,
              originalStorageKey: publicResources.originalStorageKey
            })
            .from(publicResources)
            .where(inArray(publicResources.id, uniquePublicIds as any))
        : []

    const resourceMap = new Map<string, (typeof resourceRows)[number]>()
    for (const r of resourceRows) resourceMap.set(String(r.id), r)

    const audioIds = Array.from(
      new Set(
        [...parsed.data.video_config_list, ...parsed.data.audio_config_list]
          .map((it) => extractGeneratedAudioId(it.url, origin))
          .filter(Boolean) as string[]
      )
    )

    const audioRows =
      audioIds.length > 0
        ? await db
            .select({
              id: generatedAudios.id,
              storageKey: generatedAudios.storageKey,
              url: generatedAudios.url
            })
            .from(generatedAudios)
            .innerJoin(stories, eq(generatedAudios.storyId, stories.id))
            .where(and(inArray(generatedAudios.id, audioIds as any), eq(stories.userId, userId)))
        : []

    const audioMap = new Map<string, (typeof audioRows)[number]>()
    for (const r of audioRows) audioMap.set(String(r.id), r)

    const storage = getS3Storage()
    const resolveUrl = async (raw: string): Promise<string> => {
      const extracted = extractStableResourceId(raw, origin)
      if (extracted) {
        const row = resourceMap.get(extracted.id) ?? null
        if (!row) throw new Error(`资源不存在: ${extracted.id}`)
        const storageKey = extracted.kind === "preview" ? row.previewStorageKey : row.originalStorageKey
        const fallbackUrl = extracted.kind === "preview" ? row.previewUrl : (row.originalUrl || row.previewUrl)
        if (storageKey) {
          const signed = await storage.generatePresignedUrl({ key: storageKey, expireTime: 60 * 10 })
          return signed
        }
        if (typeof fallbackUrl === "string" && fallbackUrl.startsWith("http")) return fallbackUrl
        throw new Error(`资源链接不存在: ${extracted.id}`)
      }

      const audioId = extractGeneratedAudioId(raw, origin)
      if (audioId) {
        const row = audioMap.get(audioId) ?? null
        if (!row) throw new Error(`音频不存在: ${audioId}`)
        if (row.storageKey) {
          const signed = await storage.generatePresignedUrl({ key: row.storageKey, expireTime: 60 * 10 })
          return signed
        }
        if (typeof row.url === "string" && row.url.startsWith("http")) return row.url
        throw new Error(`音频链接不存在: ${audioId}`)
      }

      return raw
    }

    const resolvedVideoList = await Promise.all(
      parsed.data.video_config_list.map(async (v) => ({ ...v, url: await resolveUrl(v.url) }))
    )
    const resolvedAudioList = await Promise.all(
      parsed.data.audio_config_list.map(async (v) => ({ ...v, url: await resolveUrl(v.url) }))
    )

    const coze = await callCozeRunEndpoint({
      traceId,
      url,
      token,
      timeoutMs,
      module: "video-edit",
      body: {
        video_config_list: resolvedVideoList,
        audio_config_list: resolvedAudioList
      }
    })

    const normalized = outputSchema.safeParse(coze.data)
    if (!normalized.success) {
      logger.warn({
        event: "video_edit_invalid_response",
        module: "video-edit",
        traceId,
        message: "剪辑接口返回格式不符合预期",
        durationMs: Math.round(performance.now() - startedAt)
      })
      return NextResponse.json(makeApiErr(traceId, "VIDEO_EDIT_INVALID_RESPONSE", "剪辑接口返回格式不符合预期"), { status: 502 })
    }

    logger.info({
      event: "video_edit_success",
      module: "video-edit",
      traceId,
      message: "视频剪辑合成成功",
      durationMs: Math.round(performance.now() - startedAt)
    })

    const resultUrl = (normalized.data.output_video_url ?? normalized.data.final_video_url ?? "").trim()
    const saved = await db
      .update(stories)
      .set({ finalVideoUrl: resultUrl, updatedAt: new Date() })
      .where(and(eq(stories.id, parsed.data.storyId), eq(stories.userId, userId)))
      .returning({ id: stories.id })

    if (saved.length === 0) {
      return NextResponse.json(makeApiErr(traceId, "STORY_NOT_FOUND", "未找到可写入的剧本"), { status: 404 })
    }

    return NextResponse.json(
      makeApiOk(traceId, {
        output_video_url: resultUrl,
        video_meta: normalized.data.video_meta ?? null
      }),
      { status: 200 }
    )
  } catch (err) {
    const durationMs = Math.round(performance.now() - startedAt)
    if (err instanceof CozeRunEndpointError) {
      logger.error({
        event: "video_edit_failed",
        module: "video-edit",
        traceId,
        message: "剪辑接口调用失败",
        durationMs,
        errorName: err.name,
        errorMessage: err.message
      })
      return NextResponse.json(makeApiErr(traceId, "VIDEO_EDIT_REQUEST_FAILED", "剪辑接口调用失败"), { status: 502 })
    }

    const anyErr = err as { name?: string; message?: string; stack?: string }
    logger.error({
      event: "video_edit_failed",
      module: "video-edit",
      traceId,
      message: "视频剪辑合成失败",
      durationMs,
      errorName: anyErr?.name,
      errorMessage: anyErr?.message
    })
    return NextResponse.json(makeApiErr(traceId, "VIDEO_EDIT_FAILED", anyErr?.message || "视频剪辑合成失败"), { status: 500 })
  }
}
