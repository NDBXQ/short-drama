import { renderAgentResponseXml, renderAgentStepXml } from "../vibeCreatingXml"
import { buildDefaultTitles } from "../vibeCreatingUtils"
import type { StepExecutionContext, StepExecutionResult } from "./types"

export async function runMockStep(ctx: StepExecutionContext): Promise<StepExecutionResult> {
  const step = ctx.sessionState.currentStep
  const title = buildDefaultTitles(step)

  const stepXml = renderAgentStepXml({
    id: String(step),
    title,
    content:
      step === 0
        ? null
        : {
            images:
              step === 2 || step === 4
                ? [{ index: "1", sequence: "1", url: "https://example.com/mock.png", prompt: "mock image" }]
                : undefined,
            storyboards:
              step === 3
                ? [{ sequence: "1", 画面: "mock", 时长: "3", 台词: "mock" }]
                : undefined,
            videoClips:
              step === 5
                ? [{ sequence: "1", url: "https://example.com/mock.mp4", durationSeconds: "3", prompt: "mock video" }]
                : undefined,
            sections:
              step === 1
                ? [
                    {
                      sectionName: "大纲",
                      fields: [
                        { name: "主题", value: "mock" },
                        { name: "核心信息", value: "mock" }
                      ]
                    }
                  ]
                : undefined
          }
  })

  const responseXml = renderAgentResponseXml({
    text:
      step === 0
        ? `已记录产品图：${ctx.sessionState.productImages.length} 张（若无可忽略）\n\n❓ 您对以上内容满意吗？`
        : `💡 当前步骤：${title}\n✅ 已完成：mock 输出\n❓ 您对以上内容满意吗？`,
    actions:
      step === 5
        ? [
            { command: "继续", text: "👉 输入\"继续\"推荐背景音乐" },
            { command: "修改", text: "👉 输入\"修改\"重新生成视频" }
          ]
        : [
            { command: "继续", text: "👉 输入\"继续\"进入下一步骤" },
            { command: "修改", text: "👉 输入\"修改\"重新创作此步骤" }
          ]
  })

  const raw = `${stepXml}\n\n${responseXml}`
  return {
    raw,
    stepXml,
    responseXml,
    nextState: { ...ctx.sessionState, currentStep: step, updatedAt: Date.now() }
  }
}
