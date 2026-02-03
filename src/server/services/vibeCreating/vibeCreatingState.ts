export type VibeSessionState = {
  currentStep: number
  productImages: string[]
  assets?: {
    referenceImages?: Record<string, { url: string; type: string; category: string; description: string }>
    firstFrames?: Record<string, { url: string; description: string; referenceImages: string }>
    videoClips?: Record<string, { url: string; description: string; durationSeconds: number; firstFrameIndex: number; lastFrameUrl?: string }>
    nextReferenceImageIndex?: number
    nextFirstFrameIndex?: number
    nextVideoIndex?: number
  }
  createdAt: number
  updatedAt: number
}

type VibeMetadata = {
  vibeCreating?: {
    sessions?: Record<string, VibeSessionState>
  }
}

function normalizeAssets(anyS: any): NonNullable<VibeSessionState["assets"]> {
  const assets = anyS?.assets && typeof anyS.assets === "object" ? anyS.assets : {}
  const referenceImages = assets.referenceImages && typeof assets.referenceImages === "object" ? assets.referenceImages : {}
  const firstFrames = assets.firstFrames && typeof assets.firstFrames === "object" ? assets.firstFrames : {}
  const videoClips = assets.videoClips && typeof assets.videoClips === "object" ? assets.videoClips : {}
  const nextReferenceImageIndex = Number(assets.nextReferenceImageIndex ?? 1)
  const nextFirstFrameIndex = Number(assets.nextFirstFrameIndex ?? 1)
  const nextVideoIndex = Number(assets.nextVideoIndex ?? 1)
  return {
    referenceImages: referenceImages as any,
    firstFrames: firstFrames as any,
    videoClips: videoClips as any,
    nextReferenceImageIndex: Number.isFinite(nextReferenceImageIndex) && nextReferenceImageIndex > 0 ? Math.trunc(nextReferenceImageIndex) : 1,
    nextFirstFrameIndex: Number.isFinite(nextFirstFrameIndex) && nextFirstFrameIndex > 0 ? Math.trunc(nextFirstFrameIndex) : 1,
    nextVideoIndex: Number.isFinite(nextVideoIndex) && nextVideoIndex > 0 ? Math.trunc(nextVideoIndex) : 1
  }
}

export function getVibeSessionState(metadata: Record<string, unknown>, sessionId: string): VibeSessionState | null {
  const root = metadata as unknown as VibeMetadata
  const sessions = root?.vibeCreating?.sessions
  if (!sessions || typeof sessions !== "object") return null
  const s = (sessions as any)[sessionId]
  if (!s || typeof s !== "object") return null
  const anyS = s as any
  const currentStep = Number(anyS.currentStep)
  const productImages = Array.isArray(anyS.productImages) ? anyS.productImages.map((u: any) => String(u ?? "").trim()).filter(Boolean) : []
  const createdAt = Number(anyS.createdAt ?? Date.now())
  const updatedAt = Number(anyS.updatedAt ?? Date.now())
  if (!Number.isFinite(currentStep)) return null
  const assets = normalizeAssets(anyS)
  return { currentStep: Math.trunc(currentStep), productImages, assets, createdAt, updatedAt }
}

export function setVibeSessionState(metadata: Record<string, unknown>, sessionId: string, state: VibeSessionState): Record<string, unknown> {
  const root = (metadata ?? {}) as any
  if (!root.vibeCreating || typeof root.vibeCreating !== "object") root.vibeCreating = {}
  if (!root.vibeCreating.sessions || typeof root.vibeCreating.sessions !== "object") root.vibeCreating.sessions = {}
  root.vibeCreating.sessions[sessionId] = state
  return root as Record<string, unknown>
}
