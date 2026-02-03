import type { TvcAgentBlock } from "@/features/tvc/agent/types"

export type VibeStyleCard = {
  id: string
  title: string
  subtitle: string
  tags: string[]
}

export type TvcStepId =
  | "step-0"
  | "step-1"
  | "step-2"
  | "step-3"
  | "step-4"
  | "step-5"

export type TvcPreviewTab = "shotlist" | "image" | "video"

export type ChatMessage = { id: string; role: "assistant" | "user"; text: string; blocks?: TvcAgentBlock[] }
