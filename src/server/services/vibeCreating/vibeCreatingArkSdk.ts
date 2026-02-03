import { readEnv, readEnvInt } from "@/features/coze/env"
import { ServiceError } from "@/server/services/errors"
import { ImageGenerationClient, VideoGenerationClient, Config as CozeSdkConfig } from "coze-coding-dev-sdk"

export function buildCozeSdkConfig(): CozeSdkConfig {
  const apiKey = readEnv("VIBE_ARK_API_KEY")
  const baseUrl = readEnv("VIBE_ARK_API_BASE_URL") ?? "https://ark.cn-beijing.volces.com/api/v3"
  if (!apiKey) throw new ServiceError("ARK_NOT_CONFIGURED", "未配置火山方舟 API Key，请设置 VIBE_ARK_API_KEY")
  const retryTimes = readEnvInt("VIBE_ARK_RETRY_TIMES") ?? 2
  const retryDelay = readEnvInt("VIBE_ARK_RETRY_DELAY_MS") ?? 500
  const timeout = readEnvInt("VIBE_ARK_TIMEOUT_MS") ?? 120_000
  return new CozeSdkConfig({ apiKey, baseUrl, retryTimes, retryDelay, timeout })
}

export async function generateImageBatch(params: {
  prompts: Array<{ index: number; prompt: string; size?: string }>
  watermark: boolean
}): Promise<Array<{ index: number; url: string }>> {
  const client = new ImageGenerationClient(buildCozeSdkConfig())
  const requests = params.prompts.map((p) => ({
    prompt: p.prompt,
    size: p.size,
    watermark: params.watermark,
    responseFormat: "url" as const
  }))
  const resps = await client.batchGenerate(requests)
  const out: Array<{ index: number; url: string }> = []
  for (let i = 0; i < resps.length; i++) {
    const helper = client.getResponseHelper(resps[i] as any)
    const url = helper.imageUrls[0]
    if (url) out.push({ index: params.prompts[i]?.index ?? i + 1, url })
  }
  return out
}

export async function generateVideoFromFirstFrame(params: {
  prompt: string
  firstFrameUrl: string
  durationSeconds: number
  resolution?: "720p" | "1080p"
  ratio?: "16:9" | "9:16" | "1:1"
  watermark: boolean
}): Promise<{ videoUrl: string; lastFrameUrl?: string }> {
  const model = readEnv("VIBE_SEEDANCE_MODEL") ?? "doubao-seedance-1-5-pro-251215"
  const client = new VideoGenerationClient(buildCozeSdkConfig())
  const resp = await client.videoGeneration(
    [
      { type: "text", text: params.prompt },
      { type: "image_url", image_url: { url: params.firstFrameUrl }, role: "first_frame" }
    ],
    {
      model,
      returnLastFrame: true,
      config: {
        resolution: params.resolution ?? "720p",
        ratio: params.ratio ?? "16:9",
        duration: params.durationSeconds,
        watermark: params.watermark
      }
    }
  )
  return { videoUrl: resp.videoUrl ?? "", lastFrameUrl: resp.lastFrameUrl || undefined }
}

