import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { and, eq } from "drizzle-orm"
import { getDb } from "coze-coding-dev-sdk"
import { makeApiErr, makeApiOk } from "@/shared/api"
import { getSessionFromRequest } from "@/shared/session"
import { getTraceId } from "@/shared/trace"
import { logger } from "@/shared/logger"
import { generatedAudios, stories, storyOutlines, storyboards } from "@/shared/schema"
import { CozeTtsClient } from "@/server/services/tts/cozeTtsClient"
import { downloadBinary } from "@/server/services/tts/downloadBinary"
import { uploadPublicBuffer } from "@/shared/storage"
import { getSpeakerName } from "@/features/tts/speakers"

export const runtime = "nodejs"

const inputSchema = z.object({
  storyboardId: z.string().trim().min(1).max(200),
  roleName: z.string().trim().min(1).max(200),
  text: z.string().trim().min(1).max(5000),
  speakerId: z.string().trim().min(1).max(200)
})

export async function POST(req: NextRequest): Promise<Response> {
  const traceId = getTraceId(req.headers)
  const startedAt = Date.now()

  const session = await getSessionFromRequest(req)
  const userId = session?.userId
  if (!userId) return NextResponse.json(makeApiErr(traceId, "AUTH_REQUIRED", "未登录或登录已过期"), { status: 401 })

  const body = await req.json().catch(() => null)
  const parsed = inputSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json(makeApiErr(traceId, "VALIDATION_FAILED", "参数格式不正确"), { status: 400 })

  const speakerName = getSpeakerName(parsed.data.speakerId) ?? parsed.data.speakerId

  logger.info({
    event: "tts_generate_audio_start",
    module: "tts",
    traceId,
    message: "开始生成分镜台词音频",
    storyboardId: parsed.data.storyboardId,
    speakerId: parsed.data.speakerId
  })

  try {
    const db = await getDb({ generatedAudios, stories, storyOutlines, storyboards })

    const allowed = await db
      .select({ storyId: stories.id })
      .from(storyboards)
      .innerJoin(storyOutlines, eq(storyboards.outlineId, storyOutlines.id))
      .innerJoin(stories, eq(storyOutlines.storyId, stories.id))
      .where(and(eq(storyboards.id, parsed.data.storyboardId), eq(stories.userId, userId)))
      .limit(1)
    const storyId = allowed[0]?.storyId ?? null
    if (!storyId) return NextResponse.json(makeApiErr(traceId, "STORYBOARD_NOT_FOUND", "未找到可用的分镜"), { status: 404 })

    const tts = await CozeTtsClient.synthesize({ text: parsed.data.text, speaker: parsed.data.speakerId, traceId })
    const downloaded = await downloadBinary(tts.audioUrl, traceId, 120_000)
    const contentType = downloaded.contentType ?? "audio/mpeg"
    const fileExt = contentType.includes("wav") ? "wav" : contentType.includes("mpeg") || contentType.includes("mp3") ? "mp3" : "bin"
    const uploaded = await uploadPublicBuffer({ buffer: downloaded.buffer, prefix: "generated-audios", contentType, fileExt })

    const inserted = await db
      .insert(generatedAudios)
      .values({
        storyId,
        storyboardId: parsed.data.storyboardId,
        roleName: parsed.data.roleName,
        speakerId: parsed.data.speakerId,
        speakerName,
        content: parsed.data.text,
        url: uploaded.url,
        storageKey: uploaded.key,
        audioSize: tts.audioSize
      } as any)
      .returning({ id: generatedAudios.id })

    const id = inserted?.[0]?.id ? String(inserted[0].id) : ""
    const stableUrl = id ? `/api/video-creation/audios/file/${id}` : uploaded.url
    if (id) await db.update(generatedAudios).set({ url: stableUrl }).where(eq(generatedAudios.id, id))

    logger.info({
      event: "tts_generate_audio_success",
      module: "tts",
      traceId,
      message: "生成分镜台词音频成功",
      durationMs: Date.now() - startedAt,
      storyboardId: parsed.data.storyboardId,
      audioId: id
    })

    return NextResponse.json(makeApiOk(traceId, { audioId: id, audioUrl: stableUrl, audioSize: tts.audioSize }), { status: 200 })
  } catch (err) {
    const durationMs = Date.now() - startedAt
    const anyErr = err as { name?: string; message?: string; stack?: string }
    logger.error({
      event: "tts_generate_audio_failed",
      module: "tts",
      traceId,
      message: "生成分镜台词音频失败",
      durationMs,
      errorName: anyErr?.name,
      errorMessage: anyErr?.message
    })
    return NextResponse.json(makeApiErr(traceId, "TTS_GENERATE_FAILED", anyErr?.message || "生成音频失败"), { status: 500 })
  }
}

