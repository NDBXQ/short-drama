import { useCallback, type RefObject } from "react"
import { type AudioClip, type VideoClip, PX_PER_SECOND, MIN_CLIP_SECONDS, clamp } from "../../../utils/timelineUtils"

export function useTimelineClipInteractions(params: {
  latestVideoClipsRef: RefObject<VideoClip[]>
  isInteractingRef: RefObject<boolean>
  keyboardScopeRef: RefObject<HTMLDivElement>
  setSelectedClip: React.Dispatch<React.SetStateAction<{ type: "video" | "audio"; id: string } | null>>
  updateVideoClip: (id: string, patch: Partial<VideoClip>) => void
  updateAudioClip: (id: string, patch: Partial<AudioClip>) => void
  onSelectSegment: (id: string) => void
}): {
  makeTrimHandler: (clip: VideoClip, edge: "start" | "end") => (e: React.PointerEvent) => void
  makeDragHandler: (clip: VideoClip) => (e: React.PointerEvent) => void
  makeAudioDragHandler: (clip: AudioClip) => (e: React.PointerEvent) => void
  onClipClick: (type: "video" | "audio", id: string, segmentId?: string) => void
} {
  const { latestVideoClipsRef, isInteractingRef, keyboardScopeRef, setSelectedClip, updateVideoClip, updateAudioClip, onSelectSegment } = params

  const makeTrimHandler = useCallback(
    (clip: VideoClip, edge: "start" | "end") => {
      return (e: React.PointerEvent) => {
        e.preventDefault()
        e.stopPropagation()
        isInteractingRef.current = true
        setSelectedClip({ type: "video", id: clip.id })
        keyboardScopeRef.current?.focus()
        onSelectSegment(clip.segmentId)
        const startX = e.clientX
        const initialTrimStart = clip.trimStart
        const initialTrimEnd = clip.trimEnd
        const onMove = (ev: PointerEvent) => {
          const EPS = 1e-3
          const others = latestVideoClipsRef.current
            .filter((c) => c.id !== clip.id)
            .map((c) => ({
              visibleStart: c.start + Math.max(0, c.trimStart),
              visibleEnd: c.start + c.duration - Math.max(0, c.trimEnd)
            }))
            .filter((c) => c.visibleEnd > c.visibleStart + EPS)
            .sort((a, b) => a.visibleStart - b.visibleStart)

          const curVisibleStart = clip.start + Math.max(0, clip.trimStart)
          const insertAt = (() => {
            const idx = others.findIndex((c) => c.visibleStart > curVisibleStart)
            return idx === -1 ? others.length : idx
          })()
          const prevEnd = insertAt > 0 ? others[insertAt - 1]?.visibleEnd ?? 0 : 0
          const nextStart = insertAt < others.length ? others[insertAt]?.visibleStart ?? Number.POSITIVE_INFINITY : Number.POSITIVE_INFINITY

          const dx = (ev.clientX - startX) / PX_PER_SECOND
          if (edge === "start") {
            const minTrimStartByOverlap = Math.max(0, prevEnd - clip.start, -clip.start)
            const maxTrimStart = clip.duration - initialTrimEnd - MIN_CLIP_SECONDS
            if (minTrimStartByOverlap > maxTrimStart) return
            const next = clamp(initialTrimStart + dx, minTrimStartByOverlap, maxTrimStart)
            updateVideoClip(clip.id, { trimStart: next })
          } else {
            const minTrimEndByOverlap = Number.isFinite(nextStart) ? Math.max(0, clip.start + clip.duration - nextStart) : 0
            const maxTrimEnd = clip.duration - initialTrimStart - MIN_CLIP_SECONDS
            if (minTrimEndByOverlap > maxTrimEnd) return
            const next = clamp(initialTrimEnd - dx, minTrimEndByOverlap, maxTrimEnd)
            updateVideoClip(clip.id, { trimEnd: next })
          }
        }
        const onUp = () => {
          window.removeEventListener("pointermove", onMove)
          window.removeEventListener("pointerup", onUp)
          isInteractingRef.current = false
        }
        window.addEventListener("pointermove", onMove)
        window.addEventListener("pointerup", onUp)
      }
    },
    [isInteractingRef, keyboardScopeRef, latestVideoClipsRef, onSelectSegment, setSelectedClip, updateVideoClip]
  )

  const makeDragHandler = useCallback(
    (clip: VideoClip) => {
      return (e: React.PointerEvent) => {
        if ((e.target as HTMLElement)?.dataset?.handle) return
        e.preventDefault()
        isInteractingRef.current = true
        setSelectedClip({ type: "video", id: clip.id })
        keyboardScopeRef.current?.focus()
        onSelectSegment(clip.segmentId)
        const startX = e.clientX
        const initialStart = clip.start
        const onMove = (ev: PointerEvent) => {
          const EPS = 1e-3
          const dx = (ev.clientX - startX) / PX_PER_SECOND
          const minStart = -clip.trimStart
          const maxStart = Number.POSITIVE_INFINITY
          const raw = clamp(initialStart + dx, minStart, maxStart)

          const visibleLen = clip.duration - Math.max(0, clip.trimEnd)

          const others = latestVideoClipsRef.current
            .filter((c) => c.id !== clip.id)
            .map((c) => ({
              visibleStart: c.start + Math.max(0, c.trimStart),
              visibleEnd: c.start + c.duration - Math.max(0, c.trimEnd)
            }))
            .filter((c) => c.visibleEnd > c.visibleStart + EPS)
            .sort((a, b) => a.visibleStart - b.visibleStart)

          const applyNoOverlap = (start: number, dir: -1 | 1) => {
            let candidate = start
            for (let i = 0; i < 6; i += 1) {
              const left = candidate + Math.max(0, clip.trimStart)
              const right = candidate + visibleLen
              const conflict = others.find((c) => right > c.visibleStart + EPS && left < c.visibleEnd - EPS) ?? null
              if (!conflict) return candidate
              candidate = dir > 0 ? conflict.visibleStart - visibleLen : conflict.visibleEnd - Math.max(0, clip.trimStart)
              candidate = clamp(candidate, minStart, maxStart)
            }
            return candidate
          }

          const base = applyNoOverlap(raw, dx >= 0 ? 1 : -1)

          const snapThresholdSeconds = 8 / PX_PER_SECOND
          const anchors: number[] = [0]
          for (const other of others) {
            anchors.push(other.visibleStart)
            anchors.push(other.visibleEnd)
          }

          const best = (() => {
            let bestStart: number | null = null
            let bestDelta = Number.POSITIVE_INFINITY
            for (const a of anchors) {
              const s1 = a - clip.trimStart
              const d1 = Math.abs((base + clip.trimStart) - a)
              if (d1 <= snapThresholdSeconds && d1 < bestDelta) {
                bestDelta = d1
                bestStart = s1
              }
              const s2 = a - visibleLen
              const d2 = Math.abs((base + visibleLen) - a)
              if (d2 <= snapThresholdSeconds && d2 < bestDelta) {
                bestDelta = d2
                bestStart = s2
              }
            }
            return bestStart
          })()

          const snapped = best ?? base
          const dir = snapped >= base ? 1 : -1
          const next = applyNoOverlap(clamp(snapped, minStart, maxStart), dir)
          updateVideoClip(clip.id, { start: next })
        }
        const onUp = () => {
          window.removeEventListener("pointermove", onMove)
          window.removeEventListener("pointerup", onUp)
          isInteractingRef.current = false
        }
        window.addEventListener("pointermove", onMove)
        window.addEventListener("pointerup", onUp)
      }
    },
    [isInteractingRef, keyboardScopeRef, latestVideoClipsRef, onSelectSegment, setSelectedClip, updateVideoClip]
  )

  const makeAudioDragHandler = useCallback(
    (clip: AudioClip) => {
      return (e: React.PointerEvent) => {
        e.preventDefault()
        isInteractingRef.current = true
        setSelectedClip({ type: "audio", id: clip.id })
        keyboardScopeRef.current?.focus()
        const startX = e.clientX
        const initialStart = clip.start
        const onMove = (ev: PointerEvent) => {
          const dx = (ev.clientX - startX) / PX_PER_SECOND
          const next = clamp(initialStart + dx, 0, Number.POSITIVE_INFINITY)
          updateAudioClip(clip.id, { start: next })
        }
        const onUp = () => {
          window.removeEventListener("pointermove", onMove)
          window.removeEventListener("pointerup", onUp)
          isInteractingRef.current = false
        }
        window.addEventListener("pointermove", onMove)
        window.addEventListener("pointerup", onUp)
      }
    },
    [isInteractingRef, keyboardScopeRef, setSelectedClip, updateAudioClip]
  )

  const onClipClick = useCallback(
    (type: "video" | "audio", id: string, segmentId?: string) => {
      setSelectedClip({ type, id })
      keyboardScopeRef.current?.focus()
      if (segmentId) onSelectSegment(segmentId)
    },
    [keyboardScopeRef, onSelectSegment, setSelectedClip]
  )

  return { makeTrimHandler, makeDragHandler, makeAudioDragHandler, onClipClick }
}

