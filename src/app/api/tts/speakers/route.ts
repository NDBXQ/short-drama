import { NextResponse, type NextRequest } from "next/server"
import { inArray } from "drizzle-orm"
import { getDb } from "coze-coding-dev-sdk"
import { makeApiErr, makeApiOk } from "@/shared/api"
import { getSessionFromRequest } from "@/shared/session"
import { getTraceId } from "@/shared/trace"
import { ttsSpeakerSamples } from "@/shared/schema"
import { DEFAULT_TTS_TEST_TEXT, TTS_SPEAKERS } from "@/features/tts/speakers"

export const runtime = "nodejs"

export async function GET(req: NextRequest): Promise<Response> {
  const traceId = getTraceId(req.headers)
  const session = await getSessionFromRequest(req)
  const userId = session?.userId
  if (!userId) return NextResponse.json(makeApiErr(traceId, "AUTH_REQUIRED", "未登录或登录已过期"), { status: 401 })

  const speakerIds = TTS_SPEAKERS.map((s) => s.id)
  const db = await getDb({ ttsSpeakerSamples })
  const list =
    speakerIds.length > 0
      ? await db
          .select({
            speakerId: ttsSpeakerSamples.speakerId,
            speakerName: ttsSpeakerSamples.speakerName,
            sampleText: ttsSpeakerSamples.sampleText,
            url: ttsSpeakerSamples.url
          })
          .from(ttsSpeakerSamples)
          .where(inArray(ttsSpeakerSamples.speakerId, speakerIds as any))
          .limit(200)
      : []

  const sampleBySpeakerId = new Map<string, { url: string; sampleText: string }>()
  for (const r of list) {
    const id = String(r.speakerId ?? "").trim()
    const url = String(r.url ?? "").trim()
    const sampleText = String(r.sampleText ?? "").trim()
    if (!id || !url) continue
    if (!sampleBySpeakerId.has(id)) sampleBySpeakerId.set(id, { url, sampleText })
  }

  const speakers = TTS_SPEAKERS.map((s) => ({
    id: s.id,
    name: s.name,
    sampleText: sampleBySpeakerId.get(s.id)?.sampleText ?? DEFAULT_TTS_TEST_TEXT,
    sampleUrl: sampleBySpeakerId.get(s.id)?.url ?? null
  }))

  return NextResponse.json(makeApiOk(traceId, { speakers }), { status: 200 })
}
