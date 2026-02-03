import { renderAgentResponseXml, renderAgentStepXml } from "../vibeCreatingXml"
import { tryExtractJsonObject, safeJsonParse } from "../vibeCreatingJson"
import { loadSkillInstructions } from "../vibeCreatingSkills"
import { streamArkChat } from "../vibeCreatingArkChat"
import { generateVideosFromFirstFramesBatch } from "../vibeCreatingTools"
import { VIBE_CREATING_SYSTEM_PROMPT } from "../vibeCreatingSystemPrompt"
import type { VibeLlmConfig } from "../vibeCreatingConfig"
import type { StepExecutionContext, StepExecutionResult } from "./types"

function findFirstFrameIndexBySequence(state: { assets?: any }, sequence: number): number | null {
  const frames = state?.assets?.firstFrames
  if (!frames || typeof frames !== "object") return null
  for (const [k, v] of Object.entries(frames as Record<string, any>)) {
    const idx = Number(k)
    if (!Number.isFinite(idx)) continue
    const desc = String((v as any)?.description ?? "").trim()
    if (!desc) continue
    if (desc.includes(`镜头${sequence}`) || desc.includes(`shot${sequence}`)) return Math.trunc(idx)
    const m = desc.match(/(?:镜头|shot)\s*0*(\d+)/i)
    if (m?.[1] && Number(m[1]) === sequence) return Math.trunc(idx)
  }
  return null
}

export async function runStep5(
  ctx: StepExecutionContext,
  deps: {
    llm: VibeLlmConfig
    video: { watermark: boolean; maxConcurrent: number }
  }
): Promise<StepExecutionResult> {
  const title = "分镜视频生成"
  const skill = await loadSkillInstructions("tvc-video-generation")
  const system = VIBE_CREATING_SYSTEM_PROMPT
  const prev4 = ctx.story?.stepsById["step-4"]?.rawXml ?? ctx.story?.stepsById["4"]?.rawXml ?? ""
  const prev3 = ctx.story?.stepsById["step-3"]?.rawXml ?? ctx.story?.stepsById["3"]?.rawXml ?? ""
  const user =
    `调用 load_skill_instructions，参数：{"skill":"tvc-video-generation"}\n` +
    `返回内容：\n${skill}\n\n` +
    `用户输入：\n${ctx.userText}\n\n已有分镜：\n${prev3}\n\n已有首帧图：\n${prev4}\n\n请输出videos数组，每项包含sequence、prompt、durationSeconds。`

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
  const videosRaw = Array.isArray(parsed?.videos) ? parsed.videos : []

  const plans = videosRaw
    .map((it: any, idx: number) => {
      const sequence = Number(it?.sequence ?? idx + 1)
      const prompt = String(it?.prompt ?? "").trim()
      const duration = Number(it?.durationSeconds ?? it?.duration ?? 5)
      const seq = Number.isFinite(sequence) ? Math.trunc(sequence) : idx + 1
      const firstFrameIndex = findFirstFrameIndexBySequence(ctx.sessionState, seq)
      if (!prompt || !firstFrameIndex) return null
      return { sequence: seq, prompt, durationSeconds: Math.trunc(duration), firstFrameIndex }
    })
    .filter(Boolean) as Array<{ sequence: number; prompt: string; durationSeconds: number; firstFrameIndex: number }>

  ctx.sendDelta(`正在生成分镜视频（共${plans.length}段，可能较慢）...\n`)
  const generated = await generateVideosFromFirstFramesBatch({
    state: ctx.sessionState,
    requests: plans.map((p) => ({
      firstFrameIndex: p.firstFrameIndex,
      description: `镜头${p.sequence}视频`,
      prompt: p.prompt,
      durationSeconds: p.durationSeconds
    })),
    watermark: deps.video.watermark,
    maxConcurrent: deps.video.maxConcurrent
  })

  const nextState = { ...generated.nextState, currentStep: 5, updatedAt: Date.now() }
  const videoClips = generated.results.map((r, idx) => {
    const plan = plans[idx]
    return {
      index: String(r.index),
      first_frame_index: String(plan.firstFrameIndex),
      duration: String(r.durationSeconds),
      description: `镜头${plan.sequence}视频`
    }
  })

  const stepXml = renderAgentStepXml({ id: "5", title, content: { videoClips } })
  const responseXml = renderAgentResponseXml({
    text: `💡 当前步骤：${title}\n✅ 已完成：生成${videoClips.length}个分镜视频片段\n❓ 您对以上内容满意吗？`,
    actions: [
      { command: "继续", text: "👉 输入\"继续\"推荐背景音乐" },
      { command: "修改", text: "👉 输入\"修改\"重新生成视频" }
    ]
  })
  const raw = `${stepXml}\n\n${responseXml}`
  return { raw, stepXml, responseXml, nextState }
}
