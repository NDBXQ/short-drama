import { readEnv } from "@/features/coze/env"
import { ServiceError } from "@/server/services/errors"
import { ImageGenerationClient, VideoGenerationClient } from "coze-coding-dev-sdk"
import { buildCozeSdkConfig } from "./vibeCreatingArkSdk"
import { addFirstFrame, addGeneratedReferenceImage, addVideoClip, resolveAssetUrl } from "./vibeCreatingAssets"
import type { VibeSessionState } from "./vibeCreatingState"
import { runWithConcurrencyLimit } from "./vibeCreatingConcurrency"

export async function generateReferenceImagesBatch(params: {
  state: VibeSessionState
  requests: Array<{ type: string; category: string; description: string; prompt: string }>
  size: string
  watermark: boolean
}): Promise<{ nextState: VibeSessionState; results: Array<{ requestIndex: number; index: number }> }> {
  const client = new ImageGenerationClient(buildCozeSdkConfig())
  const reqs = params.requests.map((r) => ({
    prompt: r.prompt,
    size: params.size,
    watermark: params.watermark,
    responseFormat: "url" as const
  }))
  const resps = await client.batchGenerate(reqs)

  let nextState = params.state
  const results: Array<{ requestIndex: number; index: number }> = []
  for (let i = 0; i < resps.length; i++) {
    const helper = client.getResponseHelper(resps[i] as any)
    const url = helper.imageUrls[0]
    if (!url) continue
    const meta = params.requests[i]!
    const added = addGeneratedReferenceImage(nextState, { url, type: meta.type, category: meta.category, description: meta.description })
    nextState = added.nextState
    results.push({ requestIndex: i, index: added.index })
  }
  return { nextState, results }
}

export async function generateFirstFramesFromReferencesBatch(params: {
  state: VibeSessionState
  requests: Array<{ description: string; prompt: string; referenceImageIndices: number[] }>
  size: string
  watermark: boolean
}): Promise<{ nextState: VibeSessionState; results: Array<{ requestIndex: number; index: number; referenceImages: string }> }> {
  const client = new ImageGenerationClient(buildCozeSdkConfig())

  const reqs = params.requests.map((r) => {
    const urls = r.referenceImageIndices
      .map((idx) => resolveAssetUrl(params.state, "reference_image", idx))
      .map((u) => u.trim())
      .filter(Boolean)
    return {
      prompt: r.prompt,
      image: urls.length === 1 ? urls[0] : urls,
      size: params.size,
      watermark: params.watermark,
      responseFormat: "url" as const
    }
  })

  const resps = await client.batchGenerate(reqs)

  let nextState = params.state
  const results: Array<{ requestIndex: number; index: number; referenceImages: string }> = []
  for (let i = 0; i < resps.length; i++) {
    const helper = client.getResponseHelper(resps[i] as any)
    const url = helper.imageUrls[0]
    if (!url) continue
    const meta = params.requests[i]!
    const referenceImages = meta.referenceImageIndices.map((n) => `index=${n}`).join("; ")
    const added = addFirstFrame(nextState, { url, description: meta.description, referenceImages })
    nextState = added.nextState
    results.push({ requestIndex: i, index: added.index, referenceImages })
  }
  return { nextState, results }
}

export async function generateVideosFromFirstFramesBatch(params: {
  state: VibeSessionState
  requests: Array<{ firstFrameIndex: number; description: string; prompt: string; durationSeconds: number }>
  watermark: boolean
  maxConcurrent: number
}): Promise<{ nextState: VibeSessionState; results: Array<{ index: number; firstFrameIndex: number; durationSeconds: number }> }> {
  const model = readEnv("VIBE_SEEDANCE_MODEL") ?? "doubao-seedance-1-5-pro-251215"
  const client = new VideoGenerationClient(buildCozeSdkConfig())

  const tasks = params.requests.map((r) => async () => {
    const firstFrameUrl = resolveAssetUrl(params.state, "first_frame", r.firstFrameIndex)
    if (!firstFrameUrl) throw new ServiceError("FIRST_FRAME_NOT_FOUND", `首帧不存在：${r.firstFrameIndex}`)
    const resp = await client.videoGeneration(
      [
        { type: "text", text: r.prompt },
        { type: "image_url", image_url: { url: firstFrameUrl }, role: "first_frame" }
      ],
      {
        model,
        returnLastFrame: true,
        config: {
          resolution: "720p",
          ratio: "16:9",
          duration: r.durationSeconds,
          watermark: params.watermark
        }
      }
    )
    const url = resp.videoUrl ?? ""
    if (!url) throw new ServiceError("VIDEO_GENERATION_FAILED", "视频生成失败：缺少 videoUrl")
    return { url, description: r.description, durationSeconds: r.durationSeconds, firstFrameIndex: r.firstFrameIndex, lastFrameUrl: resp.lastFrameUrl || undefined }
  })

  const generated = await runWithConcurrencyLimit(tasks, params.maxConcurrent)
  let nextState = params.state
  const results: Array<{ index: number; firstFrameIndex: number; durationSeconds: number }> = []
  for (let i = 0; i < generated.length; i++) {
    const g = generated[i]!
    const added = addVideoClip(nextState, g)
    nextState = added.nextState
    results.push({ index: added.index, firstFrameIndex: g.firstFrameIndex, durationSeconds: g.durationSeconds })
  }
  return { nextState, results }
}

export function recommendBackgroundMusic(params: { sceneType: string; mood: string; durationSeconds: number }): {
  sceneType: string
  mood: string
  style: string
  bpm: string
  instruments: string
} {
  const scene = (params.sceneType || "product").toLowerCase()
  const mood = (params.mood || "exciting").toLowerCase()
  const table: Record<string, Record<string, { style: string; bpm: string; instruments: string }>> = {
    product: {
      exciting: { style: "电子/流行，节奏明快", bpm: "120-140", instruments: "合成器、鼓点、贝斯" },
      calm: { style: "轻音乐/环境音，简约清新", bpm: "60-80", instruments: "钢琴、Pad、轻打击" },
      elegant: { style: "古典/轻爵士，精致高雅", bpm: "80-110", instruments: "钢琴、弦乐、刷鼓" },
      energetic: { style: "摇滚/电子，充满活力", bpm: "140+", instruments: "电吉他、鼓、合成器" },
      dramatic: { style: "管弦乐/史诗，震撼有力", bpm: "90-120", instruments: "弦乐、铜管、定音鼓" }
    },
    brand: {
      exciting: { style: "现代电子/广告流行，时尚前沿", bpm: "110-135", instruments: "合成器、鼓、贝斯" },
      calm: { style: "氛围音乐/自然音效，舒适氛围", bpm: "60-85", instruments: "Pad、环境音、轻打击" },
      elegant: { style: "古典/精品音乐，高端形象", bpm: "70-100", instruments: "钢琴、弦乐" },
      energetic: { style: "流行/舞曲，年轻化", bpm: "120-145", instruments: "鼓、贝斯、合成器" },
      dramatic: { style: "电影感配乐，故事感", bpm: "90-120", instruments: "弦乐、铜管" }
    }
  }
  const picked = table[scene]?.[mood] ?? table.product.exciting
  return { sceneType: scene, mood, style: picked.style, bpm: `${picked.bpm} BPM`, instruments: picked.instruments }
}
