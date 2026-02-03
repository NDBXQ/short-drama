import type { VibeUserIntent } from "../vibeCreatingIntent"
import type { VibeSessionState } from "../vibeCreatingState"
import type { StoryContext } from "../vibeCreatingTypes"

export type StepExecutionContext = {
  traceId: string
  story: StoryContext | null
  sessionState: VibeSessionState
  intent: VibeUserIntent
  userText: string
  abortSignal: AbortSignal
  sendDelta: (t: string) => void
}

export type StepExecutionResult = {
  raw: string
  stepXml: string
  responseXml: string
  nextState: VibeSessionState
}

