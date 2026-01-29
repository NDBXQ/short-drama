import { useEffect, useState } from "react"
import type { VideoAssetGroup } from "../../components/VideoTimeline/VideoAssetSidebar"

export function useVideoAssetGroups(params: { storyId?: string; enabled: boolean }) {
  const { storyId, enabled } = params
  const [videoAssetGroups, setVideoAssetGroups] = useState<VideoAssetGroup[]>([])

  useEffect(() => {
    if (!enabled || !storyId) return
    let ignore = false

    const runTasksWithConcurrency = async (tasks: Array<() => Promise<void>>, limit: number) => {
      const normalizedLimit = Math.max(1, Math.floor(limit))
      let cursor = 0
      const workers = Array.from({ length: Math.min(normalizedLimit, tasks.length) }, async () => {
        while (cursor < tasks.length) {
          const current = cursor
          cursor += 1
          await tasks[current]?.()
        }
      })
      await Promise.all(workers)
    }

    const load = async () => {
      try {
        const baseRes = await fetch(`/api/video/storyboards?storyId=${encodeURIComponent(storyId)}`, { cache: "no-store" })
        const baseJson = (await baseRes.json().catch(() => null)) as { ok: boolean; data?: { outlines?: any[] } } | null
        if (!baseRes.ok || !baseJson?.ok) return
        const outlines = Array.isArray(baseJson.data?.outlines) ? (baseJson.data?.outlines ?? []) : []
        const sorted = outlines
          .map((o) => ({ id: String(o?.id ?? ""), sequence: Number(o?.sequence ?? 0), label: `第${Number(o?.sequence ?? 0)}集` }))
          .filter((o) => o.id)
          .sort((a, b) => a.sequence - b.sequence)

        const results: Array<VideoAssetGroup | null> = new Array(sorted.length).fill(null)

        await runTasksWithConcurrency(
          sorted.map((outline, idx) => async () => {
            const res = await fetch(`/api/video/storyboards?storyId=${encodeURIComponent(storyId)}&outlineId=${encodeURIComponent(outline.id)}`, {
              cache: "no-store"
            })
            const json = (await res.json().catch(() => null)) as { ok: boolean; data?: { shots?: any[] } } | null
            if (!res.ok || !json?.ok) return
            const shots = Array.isArray(json.data?.shots) ? (json.data?.shots ?? []) : []
            const segments = shots
              .map((s) => {
                const id = String(s?.id ?? "")
                const sequence = Number(s?.sequence ?? s?.scene_no ?? 0)
                const title = `镜 ${sequence || 0}`
                const url = typeof s?.videoInfo?.url === "string" ? s.videoInfo.url.trim() : ""
                const firstFrameRaw =
                  typeof s?.frames?.first?.thumbnailUrl === "string"
                    ? s.frames.first.thumbnailUrl
                    : typeof s?.frames?.first?.url === "string"
                      ? s.frames.first.url
                      : ""
                const firstFrameSrc = typeof firstFrameRaw === "string" ? firstFrameRaw.trim() : ""
                const durationSeconds =
                  typeof s?.videoInfo?.durationSeconds === "number" && Number.isFinite(s.videoInfo.durationSeconds) && s.videoInfo.durationSeconds > 0
                    ? s.videoInfo.durationSeconds
                    : null
                if (!id || !url) return null
                return { id, title, videoSrc: url, durationSeconds, firstFrameSrc: firstFrameSrc || null }
              })
              .filter(Boolean) as Array<{ id: string; title: string; videoSrc: string; durationSeconds: number | null; firstFrameSrc: string | null }>

            if (segments.length === 0) return
            results[idx] = { outlineId: outline.id, label: outline.label, segments }
          }),
          5
        )

        if (ignore) return
        setVideoAssetGroups(results.filter(Boolean) as VideoAssetGroup[])
      } catch {
        if (!ignore) setVideoAssetGroups([])
      }
    }

    void load()
    return () => {
      ignore = true
    }
  }, [enabled, storyId])

  return enabled && storyId ? videoAssetGroups : []
}
