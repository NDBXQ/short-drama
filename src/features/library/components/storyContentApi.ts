import type { GeneratedAudio, GeneratedImage, Outline, Shot, StoryDetail } from "./storyContentTypes"

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" })
  const json = (await res.json().catch(() => null)) as any
  if (!res.ok || !json?.ok) throw new Error(json?.error?.message ?? `请求失败（${res.status}）`)
  return json.data as T
}

export async function fetchStoryDetail(storyId: string): Promise<StoryDetail> {
  const data = await fetchJson<{ story: StoryDetail }>(`/api/library/stories/${encodeURIComponent(storyId)}/detail`)
  return data.story
}

export async function fetchAllStoryboards(storyId: string): Promise<{ outlines: Outline[]; shotsByOutlineId: Record<string, Shot[]> }> {
  const base = await fetchJson<{ outlines: Outline[]; shots: Shot[]; activeOutlineId: string | null }>(
    `/api/video/storyboards?storyId=${encodeURIComponent(storyId)}`
  )
  const outlines = Array.isArray((base as any).outlines) ? ((base as any).outlines as Outline[]) : []
  const firstOutlineId = typeof (base as any).activeOutlineId === "string" ? (base as any).activeOutlineId : ""

  const shotsByOutlineId: Record<string, Shot[]> = {}
  if (firstOutlineId) {
    shotsByOutlineId[firstOutlineId] = Array.isArray((base as any).shots) ? ((base as any).shots as Shot[]) : []
  }

  for (const o of outlines) {
    if (!o?.id) continue
    if (o.id === firstOutlineId) continue
    const data = await fetchJson<{ shots: Shot[] }>(
      `/api/video/storyboards?storyId=${encodeURIComponent(storyId)}&outlineId=${encodeURIComponent(o.id)}`
    )
    shotsByOutlineId[o.id] = Array.isArray((data as any).shots) ? ((data as any).shots as Shot[]) : []
  }

  return { outlines, shotsByOutlineId }
}

export async function fetchAllImages(storyId: string): Promise<GeneratedImage[]> {
  const items: GeneratedImage[] = []
  const limit = 200
  for (let offset = 0; offset <= 800; offset += limit) {
    const qs = new URLSearchParams({
      storyId,
      includeGlobal: "true",
      limit: String(limit),
      offset: String(offset)
    })
    const data = await fetchJson<{ items?: unknown[] }>(`/api/video-creation/images?${qs}`)
    const list = Array.isArray((data as any).items) ? ((data as any).items as any[]) : []
    for (const row of list) {
      if (!row) continue
      const id = String(row.id ?? "").trim()
      const url = typeof row.url === "string" ? row.url : ""
      if (!id || !url) continue
      items.push({
        id,
        storyboardId: typeof row.storyboardId === "string" ? row.storyboardId : null,
        name: typeof row.name === "string" ? row.name : "image",
        description: typeof row.description === "string" ? row.description : null,
        url,
        thumbnailUrl: typeof row.thumbnailUrl === "string" ? row.thumbnailUrl : null,
        category: typeof row.category === "string" ? row.category : null,
        prompt: typeof row.prompt === "string" ? row.prompt : null
      })
    }
    if (list.length < limit) break
  }
  return items
}

export async function fetchAudiosByStoryboardIds(storyboardIds: string[]): Promise<Record<string, GeneratedAudio[]>> {
  const out: Record<string, GeneratedAudio[]> = {}
  const ids = Array.from(new Set(storyboardIds.map((s) => s.trim()).filter(Boolean))).slice(0, 200)
  let i = 0
  const concurrency = 4

  async function worker() {
    while (i < ids.length) {
      const idx = i
      i += 1
      const storyboardId = ids[idx]
      if (!storyboardId) continue
      try {
        const qs = new URLSearchParams({ storyboardId, limit: "200", offset: "0" })
        const data = await fetchJson<{ items?: unknown[] }>(`/api/video-creation/audios?${qs}`)
        const list = Array.isArray((data as any).items) ? ((data as any).items as any[]) : []
        out[storyboardId] = list
          .map((row) => {
            const id = String(row?.id ?? "").trim()
            const url = typeof row?.url === "string" ? row.url : ""
            if (!id || !url) return null
            return {
              id,
              storyboardId,
              roleName: typeof row?.roleName === "string" ? row.roleName : "角色",
              speakerName: typeof row?.speakerName === "string" ? row.speakerName : "音色",
              content: typeof row?.content === "string" ? row.content : "",
              url
            } satisfies GeneratedAudio
          })
          .filter(Boolean) as GeneratedAudio[]
      } catch {
        out[storyboardId] = []
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, ids.length) }, () => worker()))
  return out
}

