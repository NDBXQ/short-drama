export type StoryDetail = {
  id: string
  title: string | null
  storyText: string
  generatedText: string | null
  status: string
  progressStage: string
  aspectRatio: string
  resolution: string
  shotStyle: string
  metadata: unknown
  createdAt: string
  updatedAt: string | null
}

export type Outline = { id: string; sequence: number; outlineText: string; originalText: string }

export type Shot = {
  id: string
  sequence: number
  storyboardText: string
  shotCut: boolean
  scriptContent: unknown
  frames: {
    first?: { url?: string | null; thumbnailUrl?: string | null; prompt?: string | null }
    last?: { url?: string | null; thumbnailUrl?: string | null; prompt?: string | null }
  }
  videoInfo: { url?: string | null; prompt?: string | null; storageKey?: string | null; durationSeconds?: number | null }
}

export type GeneratedImage = {
  id: string
  storyboardId: string | null
  name: string
  description: string | null
  url: string
  thumbnailUrl: string | null
  category: string | null
  prompt: string | null
}

export type GeneratedAudio = {
  id: string
  storyboardId: string
  roleName: string
  speakerName: string
  content: string
  url: string
}

