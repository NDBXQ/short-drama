import { renderAgentResponseXml, renderAgentStepXml } from "../vibeCreatingXml"
import { tryExtractJsonObject, safeJsonParse } from "../vibeCreatingJson"
import { loadSkillInstructions } from "../vibeCreatingSkills"
import { streamArkChat } from "../vibeCreatingArkChat"
import { upsertUserProductImages } from "../vibeCreatingAssets"
import { generateReferenceImagesBatch } from "../vibeCreatingTools"
import { VIBE_CREATING_SYSTEM_PROMPT } from "../vibeCreatingSystemPrompt"
import type { VibeLlmConfig } from "../vibeCreatingConfig"
import type { StepExecutionContext, StepExecutionResult } from "./types"

function normalizeTypeFromCategory(category: string): string {
  const c = (category ?? "").toLowerCase()
  if (c.includes("角色") || c.includes("character")) return "角色图"
  if (c.includes("背景") || c.includes("场景") || c.includes("scene") || c.includes("background")) return "场景图"
  if (c.includes("道具") || c.includes("props")) return "道具图"
  if (c.includes("氛围") || c.includes("mood")) return "氛围图"
  if (c.includes("产品") || c.includes("product")) return "产品图"
  return "参考图"
}

export async function runStep2(
  ctx: StepExecutionContext,
  deps: {
    llm: VibeLlmConfig
    image: { watermark: boolean; size: string }
  }
): Promise<StepExecutionResult> {
  const title = "参考图生成"
  const skill = await loadSkillInstructions("tvc-reference-images")
  const system = VIBE_CREATING_SYSTEM_PROMPT
  const prev1 = ctx.story?.stepsById["step-1"]?.rawXml ?? ctx.story?.stepsById["1"]?.rawXml ?? ""
  const user =
    `调用 load_skill_instructions，参数：{"skill":"tvc-reference-images"}\n` +
    `返回内容：\n${skill}\n\n` +
    `用户输入：\n${ctx.userText}\n\n已有剧本：\n${prev1}\n\n请输出需要生成的参考图列表images，每项包含index、category、description、prompt。`

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
  const imagesReq = Array.isArray(parsed?.images) ? parsed.images : []
  const prompts = imagesReq
    .map((it: any, idx: number) => {
      const prompt = String(it?.prompt ?? "").trim()
      const category = String(it?.category ?? "").trim()
      const description = String(it?.description ?? "").trim()
      if (!prompt) return null
      return { prompt, category, description }
    })
    .filter(Boolean) as Array<{ prompt: string; category: string; description: string }>

  let nextState = ctx.sessionState
  const upserted = upsertUserProductImages(nextState, ctx.sessionState.productImages)
  nextState = upserted.nextState

  ctx.sendDelta(`正在生成参考图（共${prompts.length}张）...\n`)
  const generated = await generateReferenceImagesBatch({
    state: nextState,
    requests: prompts.map((p) => ({
      prompt: p.prompt,
      category: p.category || "背景",
      type: normalizeTypeFromCategory(p.category),
      description: p.description || "参考图"
    })),
    size: deps.image.size,
    watermark: deps.image.watermark
  })
  nextState = generated.nextState

  const productItems = upserted.indices.map((idx) => ({
    type: "用户图片",
    category: "产品",
    index: String(idx),
    description: "产品图"
  }))

  const generatedItems = generated.results.map((r) => {
    const meta = prompts[r.requestIndex]
    return {
      type: normalizeTypeFromCategory(meta?.category ?? ""),
      category: meta?.category || "背景",
      index: String(r.index),
      description: meta?.description || "参考图"
    }
  })

  const images = [...productItems, ...generatedItems]

  const stepXml = renderAgentStepXml({ id: "2", title, content: { images } })
  const responseXml = renderAgentResponseXml({
    text: `💡 当前步骤：${title}\n✅ 已完成：生成${images.length}张参考图\n❓ 您对以上内容满意吗？`,
    actions: [
      { command: "继续", text: "👉 输入\"继续\"进入分镜头脚本创作" },
      { command: "修改", text: "👉 输入\"修改\"重新生成参考图" }
    ]
  })
  const raw = `${stepXml}\n\n${responseXml}`
  return { raw, stepXml, responseXml, nextState: { ...nextState, currentStep: 2, updatedAt: Date.now() } }
}
