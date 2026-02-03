import { getVibeImageConfig, getVibeLlmConfig, getVibeVideoConfig, isVibeMockMode } from "./vibeCreatingConfig"
import type { VibeUserIntent } from "./vibeCreatingIntent"
import type { VibeSessionState } from "./vibeCreatingState"
import type { StoryContext } from "./vibeCreatingTypes"
import type { StepExecutionContext } from "./steps/types"
import { runMockStep } from "./steps/mock"
import { runStep0 } from "./steps/step0"
import { runStep1 } from "./steps/step1"
import { runStep2 } from "./steps/step2"
import { runStep3 } from "./steps/step3"
import { runStep4 } from "./steps/step4"
import { runStep5 } from "./steps/step5"
import { clampStep, extractUrls } from "./vibeCreatingUtils"

export async function executeStep(params: {
  traceId: string
  story: StoryContext | null
  sessionState: VibeSessionState
  intent: VibeUserIntent
  userText: string
  abortSignal: AbortSignal
  sendDelta: (t: string) => void
}): Promise<{ raw: string; stepXml: string; responseXml: string; nextState: VibeSessionState }> {
  const step = clampStep(params.sessionState.currentStep)
  const productImages =
    step === 0 ? Array.from(new Set([...(params.sessionState.productImages ?? []), ...extractUrls(params.userText)])) : params.sessionState.productImages ?? []

  const ctx: StepExecutionContext = {
    ...params,
    sessionState: { ...params.sessionState, currentStep: step, productImages }
  }

  if (isVibeMockMode()) return await runMockStep(ctx)

  const llm = getVibeLlmConfig()
  const image = getVibeImageConfig()
  const video = getVibeVideoConfig()

  if (step === 0) return await runStep0(ctx, { llm })
  if (step === 1) return await runStep1(ctx, { llm })
  if (step === 2) return await runStep2(ctx, { llm, image })
  if (step === 3) return await runStep3(ctx, { llm })
  if (step === 4) return await runStep4(ctx, { llm, image })
  return await runStep5(ctx, { llm, video })
}

