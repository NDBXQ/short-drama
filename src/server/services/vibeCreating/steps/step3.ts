import { renderAgentResponseXml, renderAgentStepXml } from "../vibeCreatingXml"
import { tryExtractJsonObject, safeJsonParse } from "../vibeCreatingJson"
import { loadSkillInstructions } from "../vibeCreatingSkills"
import { streamArkChat } from "../vibeCreatingArkChat"
import { VIBE_CREATING_SYSTEM_PROMPT } from "../vibeCreatingSystemPrompt"
import type { VibeLlmConfig } from "../vibeCreatingConfig"
import type { StepExecutionContext, StepExecutionResult } from "./types"

export async function runStep3(
  ctx: StepExecutionContext,
  deps: { llm: VibeLlmConfig }
): Promise<StepExecutionResult> {
  const title = "分镜头脚本创作"
  const skill = await loadSkillInstructions("tvc-storyboard")
  const system = VIBE_CREATING_SYSTEM_PROMPT
  const prev1 = ctx.story?.stepsById["step-1"]?.rawXml ?? ctx.story?.stepsById["1"]?.rawXml ?? ""
  const prev2 = ctx.story?.stepsById["step-2"]?.rawXml ?? ctx.story?.stepsById["2"]?.rawXml ?? ""
  const user =
    `调用 load_skill_instructions，参数：{"skill":"tvc-storyboard"}\n` +
    `返回内容：\n${skill}\n\n` +
    `用户输入：\n${ctx.userText}\n\n已有剧本：\n${prev1}\n\n已有参考图：\n${prev2}\n\n请输出storyboards数组，每项至少包含sequence、画面、动作、台词、时长(秒)、参考图index。`

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
  const boardsRaw = Array.isArray(parsed?.storyboards) ? parsed.storyboards : []
  const storyboards: Array<Record<string, string>> = boardsRaw
    .map((b: any, idx: number): Record<string, string> => {
      const sequence = String(b?.sequence ?? idx + 1).trim()
      const duration = String(b?.duration ?? b?.时长 ?? "").trim()
      const record: Record<string, string> = {}
      record.sequence = sequence
      if (b?.画面) record.画面 = String(b.画面)
      if (b?.action || b?.动作) record.动作 = String(b?.action ?? b?.动作 ?? "")
      if (b?.dialogue || b?.台词) record.台词 = String(b?.dialogue ?? b?.台词 ?? "")
      if (duration) record.durationSeconds = duration
      const refIdx = String(b?.reference_index ?? b?.参考图index ?? b?.referenceImageIndex ?? "").trim()
      if (refIdx) record.referenceImageIndex = refIdx
      return record
    })
    .filter((r: Record<string, string>) => Object.keys(r).length > 1)

  const stepXml = renderAgentStepXml({ id: "3", title, content: { storyboards } })
  const responseXml = renderAgentResponseXml({
    text: `💡 当前步骤：${title}\n✅ 已完成：创作${storyboards.length}个分镜头脚本\n❓ 您对以上内容满意吗？`,
    actions: [
      { command: "继续", text: "👉 输入\"继续\"进入首帧图生成" },
      { command: "修改", text: "👉 输入\"修改\"重新创作分镜头脚本" }
    ]
  })
  const raw = `${stepXml}\n\n${responseXml}`
  return { raw, stepXml, responseXml, nextState: { ...ctx.sessionState, currentStep: 3, updatedAt: Date.now() } }
}
