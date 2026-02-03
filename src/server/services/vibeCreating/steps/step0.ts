import { renderAgentResponseXml, renderAgentStepXml } from "../vibeCreatingXml"
import { tryExtractJsonObject, safeJsonParse } from "../vibeCreatingJson"
import { loadSkillInstructions } from "../vibeCreatingSkills"
import { streamArkChat } from "../vibeCreatingArkChat"
import { VIBE_CREATING_SYSTEM_PROMPT } from "../vibeCreatingSystemPrompt"
import type { VibeLlmConfig } from "../vibeCreatingConfig"
import type { StepExecutionContext, StepExecutionResult } from "./types"

export async function runStep0(ctx: StepExecutionContext, deps: { llm: VibeLlmConfig }): Promise<StepExecutionResult> {
  const title = "收集产品图 + 需求澄清"

  const skill = await loadSkillInstructions("tvc-orchestrator")
  const system = VIBE_CREATING_SYSTEM_PROMPT
  const user =
    `调用 load_skill_instructions，参数：{"skill":"tvc-orchestrator"}\n` +
    `返回内容：\n${skill}\n\n` +
    `用户输入：\n${ctx.userText}\n\n请抽取：品牌定位、目标客户、美学理念、品牌使命、核心信息、广告目的、产品图URL列表（如有），并给出需要用户补充的关键信息问题列表。`

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
  const questions = Array.isArray(parsed?.questions) ? parsed.questions.map((q: any) => String(q ?? "").trim()).filter(Boolean) : []
  const summaryLines = [
    parsed?.brandPositioning ? `品牌定位：${String(parsed.brandPositioning)}` : "",
    parsed?.targetAudience ? `目标客户：${String(parsed.targetAudience)}` : "",
    parsed?.aesthetic ? `美学理念：${String(parsed.aesthetic)}` : "",
    parsed?.mission ? `品牌使命：${String(parsed.mission)}` : "",
    parsed?.coreMessage ? `核心信息：${String(parsed.coreMessage)}` : "",
    parsed?.adGoal ? `广告目的：${String(parsed.adGoal)}` : ""
  ].filter(Boolean)

  const productImages = ctx.sessionState.productImages ?? []
  const productLines = productImages.length
    ? `产品图：\n${productImages.map((u, i) => `${i + 1}. ${u}`).join("\n")}`
    : "产品图：未提供"

  const responseText =
    `${productLines}\n\n${summaryLines.join("\n")}\n\n` +
    (questions.length ? `需要补充：\n${questions.map((q: string, i: number) => `${i + 1}. ${q}`).join("\n")}\n\n` : "") +
    `❓ 您对以上内容满意吗？`

  const stepXml = renderAgentStepXml({ id: "0", title, content: null })
  const responseXml = renderAgentResponseXml({
    text: responseText,
    actions: [
      { command: "继续", text: "👉 输入\"继续\"进入剧本创作" },
      { command: "修改", text: "👉 输入\"修改\"重新提供信息" }
    ]
  })

  const raw = `${stepXml}\n\n${responseXml}`
  return {
    raw,
    stepXml,
    responseXml,
    nextState: { ...ctx.sessionState, currentStep: 0, updatedAt: Date.now() }
  }
}
