import { renderAgentResponseXml, renderAgentStepXml } from "../vibeCreatingXml"
import { tryExtractJsonObject, safeJsonParse } from "../vibeCreatingJson"
import { loadSkillInstructions } from "../vibeCreatingSkills"
import { streamArkChat } from "../vibeCreatingArkChat"
import { upsertUserProductImages } from "../vibeCreatingAssets"
import { generateFirstFramesFromReferencesBatch } from "../vibeCreatingTools"
import { VIBE_CREATING_SYSTEM_PROMPT } from "../vibeCreatingSystemPrompt"
import type { VibeLlmConfig } from "../vibeCreatingConfig"
import type { StepExecutionContext, StepExecutionResult } from "./types"

function extractIndices(text: string): number[] {
  const out: number[] = []
  const re = /\bindex\s*=\s*(\d+)\b/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const n = Number(m[1])
    if (Number.isFinite(n) && n > 0) out.push(Math.trunc(n))
  }
  if (out.length > 0) return Array.from(new Set(out))
  const re2 = /\b(\d+)\b/g
  while ((m = re2.exec(text))) {
    const n = Number(m[1])
    if (Number.isFinite(n) && n > 0) out.push(Math.trunc(n))
  }
  return Array.from(new Set(out))
}

export async function runStep4(
  ctx: StepExecutionContext,
  deps: {
    llm: VibeLlmConfig
    image: { watermark: boolean; size: string }
  }
): Promise<StepExecutionResult> {
  const title = "首帧图生成"
  const skill = await loadSkillInstructions("tvc-first-frame")
  const system = VIBE_CREATING_SYSTEM_PROMPT
  const prev3 = ctx.story?.stepsById["step-3"]?.rawXml ?? ctx.story?.stepsById["3"]?.rawXml ?? ""
  const prev2 = ctx.story?.stepsById["step-2"]?.rawXml ?? ctx.story?.stepsById["2"]?.rawXml ?? ""
  const user =
    `调用 load_skill_instructions，参数：{"skill":"tvc-first-frame"}\n` +
    `返回内容：\n${skill}\n\n` +
    `用户输入：\n${ctx.userText}\n\n已有分镜：\n${prev3}\n\n已有参考图：\n${prev2}\n\n请输出first_frames数组，每项包含sequence、prompt、reference_images(字符串)。`

  const full = await streamArkChat({
    apiKey: deps.llm.apiKey,
    baseUrl: deps.llm.baseUrl,
    model: deps.llm.model,
    temperature: deps.llm.temperature,
    topP: deps.llm.topP,
    maxCompletionTokens: deps.llm.maxCompletionTokens,
    thinking: deps.llm.thinking,
    system,
    user,
    abortSignal: ctx.abortSignal
  })
  const jsonText = tryExtractJsonObject(full) ?? full
  const parsed = safeJsonParse(jsonText) as any
  const framesRaw = Array.isArray(parsed?.first_frames) ? parsed.first_frames : []
  const prompts = framesRaw
    .map((it: any, idx: number) => {
      const seq = Number(it?.sequence ?? idx + 1)
      const prompt = String(it?.prompt ?? "").trim()
      const ref = String(it?.reference_images ?? "").trim()
      if (!prompt) return null
      return { index: Number.isFinite(seq) ? Math.trunc(seq) : idx + 1, prompt, referenceImages: ref }
    })
    .filter(Boolean) as Array<{ index: number; prompt: string; referenceImages: string }>

  let nextState = ctx.sessionState
  const upserted = upsertUserProductImages(nextState, ctx.sessionState.productImages)
  nextState = upserted.nextState

  const firstFrameReqs = prompts.map((p) => {
    const refIndices = extractIndices(p.referenceImages)
    const merged = Array.from(new Set([...upserted.indices, ...refIndices]))
    const referenceImages = merged.map((n) => `index=${n}`).join("; ")
    return { description: `镜头${p.index}首帧图`, prompt: p.prompt, referenceImageIndices: merged, referenceImagesText: referenceImages }
  })

  ctx.sendDelta(`正在生成首帧图（共${firstFrameReqs.length}张）...\n`)
  const generated = await generateFirstFramesFromReferencesBatch({
    state: nextState,
    requests: firstFrameReqs.map((r) => ({ description: r.description, prompt: r.prompt, referenceImageIndices: r.referenceImageIndices })),
    size: deps.image.size,
    watermark: deps.image.watermark
  })
  nextState = generated.nextState

  const images = generated.results.map((r) => {
    const meta = firstFrameReqs[r.requestIndex]
    return {
      index: String(r.index),
      description: meta?.description ?? "首帧图",
      reference_images: r.referenceImages
    }
  })

  const stepXml = renderAgentStepXml({ id: "4", title, content: { images } })
  const responseXml = renderAgentResponseXml({
    text: `💡 当前步骤：${title}\n✅ 已完成：生成${images.length}张首帧图\n❓ 您对以上内容满意吗？`,
    actions: [
      { command: "继续", text: "👉 输入\"继续\"进入分镜视频生成" },
      { command: "修改", text: "👉 输入\"修改\"重新生成首帧图" }
    ]
  })
  const raw = `${stepXml}\n\n${responseXml}`
  return { raw, stepXml, responseXml, nextState: { ...nextState, currentStep: 4, updatedAt: Date.now() } }
}
