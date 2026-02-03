import { renderAgentResponseXml, renderAgentStepXml } from "../vibeCreatingXml"
import { tryExtractJsonObject, safeJsonParse } from "../vibeCreatingJson"
import { loadSkillInstructions } from "../vibeCreatingSkills"
import { streamArkChat } from "../vibeCreatingArkChat"
import { VIBE_CREATING_SYSTEM_PROMPT } from "../vibeCreatingSystemPrompt"
import type { VibeLlmConfig } from "../vibeCreatingConfig"
import type { StepExecutionContext, StepExecutionResult } from "./types"

export async function runStep1(
  ctx: StepExecutionContext,
  deps: { llm: VibeLlmConfig }
): Promise<StepExecutionResult> {
  const title = "剧本创作"
  const skill = await loadSkillInstructions("tvc-script")
  const system = VIBE_CREATING_SYSTEM_PROMPT
  const prev0 = ctx.story?.stepsById["step-0"]?.rawXml ?? ctx.story?.stepsById["0"]?.rawXml ?? ""
  const user =
    `调用 load_skill_instructions，参数：{"skill":"tvc-script"}\n` +
    `返回内容：\n${skill}\n\n` +
    `用户输入：\n${ctx.userText}\n\n已有步骤0内容：\n${prev0}\n\n` +
    `请输出剧本大纲sections数组，每个section包含section_name和fields对象。`

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
  const sectionsRaw = Array.isArray(parsed?.sections) ? parsed.sections : []
  const sections = sectionsRaw
    .map((s: any) => {
      const sectionName = String(s?.section_name ?? s?.sectionName ?? "").trim()
      const fieldsObj = s?.fields && typeof s.fields === "object" ? (s.fields as Record<string, unknown>) : {}
      const fields = Object.entries(fieldsObj)
        .map(([name, value]) => ({ name: String(name), value: String(value ?? "").trim() }))
        .filter((f) => f.name && f.value)
      if (!sectionName || fields.length === 0) return null
      return { sectionName, fields }
    })
    .filter(Boolean) as Array<{ sectionName: string; fields: Array<{ name: string; value: string }> }>

  const stepXml = renderAgentStepXml({ id: "1", title, content: { sections } })
  const responseXml = renderAgentResponseXml({
    text: `💡 当前步骤：${title}\n✅ 已完成：基于产品信息输出剧本大纲\n❓ 您对以上内容满意吗？`,
    actions: [
      { command: "继续", text: "👉 输入\"继续\"进入参考图生成" },
      { command: "修改", text: "👉 输入\"修改\"重新创作剧本" }
    ]
  })
  const raw = `${stepXml}\n\n${responseXml}`
  return { raw, stepXml, responseXml, nextState: { ...ctx.sessionState, currentStep: 1, updatedAt: Date.now() } }
}
