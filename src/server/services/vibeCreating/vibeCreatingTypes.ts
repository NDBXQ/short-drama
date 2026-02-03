export type TvcAgentStreamData =
  | { type: "start" }
  | { type: "delta"; text: string }
  | { type: "result"; raw: string; stepXml?: string | null; responseText?: string | null }
  | { type: "error"; code: string; message: string }

export type StoryContext = {
  storyId: string
  userId: string
  recentMessages: Array<{ role: "user" | "assistant"; content: string }>
  stepsById: Record<string, { stepId: string; rawXml: string; updatedAt: Date }>
  metadata: Record<string, unknown>
}

