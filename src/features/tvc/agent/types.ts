export type TvcAgentField = { name: string; value: string }

export type TvcAgentImageItem = Record<string, string>

export type TvcAgentSectionItem = {
  sectionName: string
  fields: TvcAgentField[]
}

export type TvcAgentStepContent = {
  prompt?: string
  images?: TvcAgentImageItem[]
  sections?: TvcAgentSectionItem[]
  storyboards?: Array<Record<string, string>>
  videoClips?: Array<Record<string, string>>
}

export type TvcAgentStep = {
  id: string
  title: string
  content: TvcAgentStepContent
}

export type TvcAgentResponse = {
  text: string
  actions: Array<{ command: string; text: string }>
}

export type TvcAgentBlock =
  | { kind: "text"; text: string }
  | { kind: "step"; raw: string; step?: TvcAgentStep | null }
  | { kind: "response"; raw: string; response?: TvcAgentResponse | null }

