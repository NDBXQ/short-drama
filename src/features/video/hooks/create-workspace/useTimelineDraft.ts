import { useCallback, useEffect, useRef, useState } from "react"

export function useTimelineDraft(storyId?: string) {
  const [timelineDraft, setTimelineDraft] = useState<{ videoClips: any[]; audioClips: any[] } | null>(null)
  const timelineSaveTimerRef = useRef<number | null>(null)
  const timelineLoadedRef = useRef(false)
  const timelineDraftRef = useRef<{ videoClips: any[]; audioClips: any[] } | null>(null)

  useEffect(() => {
    timelineDraftRef.current = timelineDraft
  }, [timelineDraft])

  useEffect(() => {
    if (!storyId) return
    let ignore = false
    timelineLoadedRef.current = false
    const load = async () => {
      try {
        const res = await fetch(`/api/video/timeline?storyId=${encodeURIComponent(storyId)}`, { cache: "no-store" })
        const json = (await res.json()) as { ok: boolean; data?: { timeline?: any } }
        if (!res.ok || !json?.ok) return
        const tl = json.data?.timeline
        if (ignore) return
        if (tl && typeof tl === "object") {
          setTimelineDraft({
            videoClips: Array.isArray((tl as any).videoClips) ? (tl as any).videoClips : [],
            audioClips: Array.isArray((tl as any).audioClips) ? (tl as any).audioClips : []
          })
        } else {
          setTimelineDraft(null)
        }
      } catch {
      } finally {
        if (!ignore) timelineLoadedRef.current = true
      }
    }
    void load()
    return () => {
      ignore = true
    }
  }, [storyId])

  useEffect(() => {
    return () => {
      if (timelineSaveTimerRef.current) {
        window.clearTimeout(timelineSaveTimerRef.current)
        timelineSaveTimerRef.current = null
      }
    }
  }, [])

  const queueSaveTimeline = useCallback(
    (next: { videoClips: any[]; audioClips: any[] }) => {
      if (!storyId) return
      if (!timelineLoadedRef.current) return
      const prev = timelineDraftRef.current
      try {
        if (prev && JSON.stringify(prev) === JSON.stringify(next)) return
      } catch {}
      setTimelineDraft(next)
      if (timelineSaveTimerRef.current) window.clearTimeout(timelineSaveTimerRef.current)
      timelineSaveTimerRef.current = window.setTimeout(() => {
        timelineSaveTimerRef.current = null
        void fetch("/api/video/timeline", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ storyId, timeline: { version: 1, ...next } })
        }).catch(() => {})
      }, 800)
    },
    [storyId]
  )

  return { timelineDraft, queueSaveTimeline }
}

