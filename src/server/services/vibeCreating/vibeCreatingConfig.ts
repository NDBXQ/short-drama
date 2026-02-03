import { readEnv, readEnvInt } from "@/features/coze/env"
import { ServiceError } from "@/server/services/errors"

export type VibeLlmConfig = {
  apiKey: string
  baseUrl: string
  model: string
  temperature: number
  topP: number
  maxCompletionTokens: number
  thinking: "enabled" | "disabled"
}

export type VibeImageConfig = {
  size: string
  watermark: boolean
}

export type VibeVideoConfig = {
  watermark: boolean
  maxConcurrent: number
}

export function getVibeLlmConfig(): VibeLlmConfig {
  const apiKey = readEnv("VIBE_ARK_API_KEY")
  if (!apiKey) throw new ServiceError("ARK_NOT_CONFIGURED", "未配置火山方舟 API Key，请设置 VIBE_ARK_API_KEY")
  const baseUrl = readEnv("VIBE_ARK_API_BASE_URL") ?? "https://ark.cn-beijing.volces.com/api/v3"
  const model = readEnv("VIBE_ARK_LLM_MODEL") ?? "doubao-seed-1-8-251228"
  const temperature = Number(readEnv("VIBE_ARK_TEMPERATURE") ?? "0.7")
  const topP = Number(readEnv("VIBE_ARK_TOP_P") ?? "0.9")
  const maxCompletionTokens = readEnvInt("VIBE_ARK_MAX_COMPLETION_TOKENS") ?? 10000
  const thinking = (readEnv("VIBE_ARK_THINKING") ?? "disabled") as "enabled" | "disabled"
  return { apiKey, baseUrl, model, temperature, topP, maxCompletionTokens, thinking }
}

export function getVibeImageConfig(): VibeImageConfig {
  const watermark = (readEnv("VIBE_IMAGE_WATERMARK") ?? "0").trim() === "1"
  const size = readEnv("VIBE_IMAGE_SIZE") ?? "2K"
  return { size, watermark }
}

export function getVibeVideoConfig(): VibeVideoConfig {
  const watermark = (readEnv("VIBE_VIDEO_WATERMARK") ?? "0").trim() === "1"
  const maxConcurrent = readEnvInt("VIBE_VIDEO_MAX_CONCURRENT") ?? 2
  return { watermark, maxConcurrent }
}

export function isVibeMockMode(): boolean {
  return (readEnv("VIBE_MOCK_MODE") ?? "").trim() === "1"
}
