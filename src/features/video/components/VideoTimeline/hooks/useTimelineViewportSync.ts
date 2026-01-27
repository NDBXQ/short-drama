import { useCallback, useEffect, useMemo, useRef, type RefObject } from "react"
import { PX_PER_SECOND, TRACK_OFFSET_PX, clamp, type VideoClip } from "../../../utils/timelineUtils"

export function useTimelineViewportSync(params: {
  wrapRef: RefObject<HTMLDivElement>
  isInteractingRef: RefObject<boolean>
  latestVideoClipsRef: RefObject<VideoClip[]>
  activeId: string
  playheadActive?: boolean
  playheadSeconds?: number | null
  totalSeconds: number
  keyboardScopeRef: RefObject<HTMLDivElement>
  onSeekPlayheadSeconds?: (seconds: number) => void
}): {
  playheadPx: number | null
  beginSeek: (e: React.PointerEvent) => void
} {
  const { wrapRef, isInteractingRef, latestVideoClipsRef, activeId, playheadActive, playheadSeconds, totalSeconds, keyboardScopeRef, onSeekPlayheadSeconds } =
    params

  const lastAutoScrollActiveIdRef = useRef<string>("")
  useEffect(() => {
    if (isInteractingRef.current) return
    const nextActiveId = (activeId ?? "").trim()
    if (!nextActiveId) return
    if (lastAutoScrollActiveIdRef.current === nextActiveId) return
    const el = wrapRef.current
    if (!el) return
    const clip = latestVideoClipsRef.current.find((c) => c.segmentId === nextActiveId)
    if (!clip) return
    lastAutoScrollActiveIdRef.current = nextActiveId
    const target = Math.max(0, TRACK_OFFSET_PX + Math.round(clip.start * PX_PER_SECOND) - 120)
    el.scrollTo({ left: target, behavior: "smooth" })
  }, [activeId, isInteractingRef, latestVideoClipsRef, wrapRef])

  const playheadPx = useMemo(() => {
    if (!playheadActive) return null
    const s = Number(playheadSeconds ?? 0)
    if (!Number.isFinite(s) || s < 0) return null
    return TRACK_OFFSET_PX + s * PX_PER_SECOND
  }, [playheadActive, playheadSeconds])

  const playheadScrollRef = useRef<{ t: number; x: number }>({ t: 0, x: -1 })
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    if (!playheadActive) return
    if (playheadPx === null) return
    const now = performance.now()
    if (now - playheadScrollRef.current.t < 90 && Math.abs(playheadPx - playheadScrollRef.current.x) < 12) return
    playheadScrollRef.current = { t: now, x: playheadPx }
    const left = el.scrollLeft
    const right = left + el.clientWidth
    const padding = 120
    if (playheadPx < left + padding || playheadPx > right - padding) {
      const target = Math.max(0, Math.round(playheadPx - el.clientWidth / 2))
      el.scrollTo({ left: target, behavior: "auto" })
    }
  }, [playheadActive, playheadPx, wrapRef])

  const seekByClientX = useCallback(
    (clientX: number) => {
      if (!playheadActive) return
      if (!onSeekPlayheadSeconds) return
      const wrap = wrapRef.current
      if (!wrap) return
      const rect = wrap.getBoundingClientRect()
      const x = clientX - rect.left + wrap.scrollLeft - TRACK_OFFSET_PX
      const seconds = clamp(x / PX_PER_SECOND, 0, totalSeconds)
      onSeekPlayheadSeconds(seconds)
    },
    [onSeekPlayheadSeconds, playheadActive, totalSeconds, wrapRef]
  )

  const beginSeek = useCallback(
    (e: React.PointerEvent) => {
      if (!playheadActive) return
      if (!onSeekPlayheadSeconds) return
      e.preventDefault()
      e.stopPropagation()
      keyboardScopeRef.current?.focus()
      seekByClientX(e.clientX)

      const onMove = (ev: PointerEvent) => {
        seekByClientX(ev.clientX)
      }
      const onUp = () => {
        window.removeEventListener("pointermove", onMove)
        window.removeEventListener("pointerup", onUp)
      }
      window.addEventListener("pointermove", onMove)
      window.addEventListener("pointerup", onUp)
    },
    [keyboardScopeRef, onSeekPlayheadSeconds, playheadActive, seekByClientX]
  )

  return { playheadPx, beginSeek }
}

