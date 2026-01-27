import { useCallback, type RefObject } from "react"
import {
  type AudioClip,
  type TimelineSegment,
  type VideoClip,
  PX_PER_SECOND,
  MIN_CLIP_SECONDS,
  TRACK_OFFSET_PX,
  clamp,
  parseAsset,
  safeDuration
} from "../../../utils/timelineUtils"

export function useTimelineDragAndDrop(params: {
  segments: TimelineSegment[]
  totalSeconds: number
  timelineRef: RefObject<HTMLDivElement>
  keyboardScopeRef: RefObject<HTMLDivElement>
  dragOver: boolean
  setDragOver: (over: boolean) => void
  setVideoClips: React.Dispatch<React.SetStateAction<VideoClip[]>>
  setAudioClips: React.Dispatch<React.SetStateAction<AudioClip[]>>
  setSelectedClip: React.Dispatch<React.SetStateAction<{ type: "video" | "audio"; id: string } | null>>
  onSelectSegment: (id: string) => void
}): {
  onDrop: (e: React.DragEvent) => void
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: () => void
} {
  const { segments, totalSeconds, timelineRef, keyboardScopeRef, dragOver, setDragOver, setVideoClips, setAudioClips, setSelectedClip, onSelectSegment } =
    params

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const asset = parseAsset(e.dataTransfer)
      setDragOver(false)
      if (!asset) return
      if (!timelineRef.current) return
      const rect = timelineRef.current.getBoundingClientRect()
      const t = clamp((e.clientX - rect.left - TRACK_OFFSET_PX) / PX_PER_SECOND, 0, totalSeconds)
      if (asset.kind === "audio") {
        const id = `a-${asset.id}-${Date.now()}`
        setAudioClips((prev) => [...prev, { id, assetId: asset.id, name: asset.name, start: t, duration: 3, src: asset.src }])
      }
      if (asset.kind === "video") {
        const seg = segments.find((s) => s.id === asset.id)
        const duration = seg ? safeDuration(seg) : typeof asset.durationSeconds === "number" && asset.durationSeconds > 0 ? asset.durationSeconds : 2
        const id = `v-${asset.id}-${Date.now()}`
        const insertAt = Math.max(0, t)
        const insertedDuration = duration
        const splitId = `v-${asset.id}-${Date.now()}-split-${Math.random().toString(16).slice(2)}`
        setVideoClips((prev) => {
          const EPS = 1e-3
          const visibleStart = (c: VideoClip) => c.start + Math.max(0, c.trimStart)
          const visibleEnd = (c: VideoClip) => c.start + c.duration - Math.max(0, c.trimEnd)

          const sorted = [...prev].sort((a, b) => visibleStart(a) - visibleStart(b))
          const overlapped =
            sorted.find((c) => {
              const s = visibleStart(c)
              const e = visibleEnd(c)
              return insertAt > s + EPS && insertAt < e - EPS
            }) ?? null

          let actualInsertAt = insertAt
          let splitLeft: VideoClip | null = null
          let splitRight: VideoClip | null = null

          if (overlapped) {
            const s = visibleStart(overlapped)
            const e = visibleEnd(overlapped)
            const leftDur = actualInsertAt - s
            const rightDur = e - actualInsertAt
            if (leftDur >= MIN_CLIP_SECONDS && rightDur >= MIN_CLIP_SECONDS) {
              splitLeft = {
                ...overlapped,
                trimEnd: Math.max(0, overlapped.start + overlapped.duration - actualInsertAt)
              }
              splitRight = {
                ...overlapped,
                id: splitId,
                start: overlapped.start + insertedDuration,
                trimStart: Math.max(0, actualInsertAt - overlapped.start)
              }
            } else {
              actualInsertAt = e
            }
          }

          const insertThreshold = actualInsertAt - EPS
          const shifted = prev.map((c) => {
            if (splitLeft && c.id === splitLeft.id) return splitLeft
            const s = visibleStart(c)
            if (s >= insertThreshold) return { ...c, start: c.start + insertedDuration }
            return c
          })

          const withSplitRight = splitRight ? [...shifted, splitRight] : shifted

          return [
            ...withSplitRight,
            { id, segmentId: asset.id, title: asset.name, src: asset.src, start: actualInsertAt, duration: insertedDuration, trimStart: 0, trimEnd: 0 }
          ]
        })
        setSelectedClip({ type: "video", id })
        keyboardScopeRef.current?.focus()
        onSelectSegment(asset.id)
      }
    },
    [keyboardScopeRef, onSelectSegment, segments, setAudioClips, setDragOver, setSelectedClip, setVideoClips, timelineRef, totalSeconds]
  )

  const onDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      if (!dragOver) setDragOver(true)
    },
    [dragOver, setDragOver]
  )

  const onDragLeave = useCallback(() => setDragOver(false), [setDragOver])

  return { onDrop, onDragOver, onDragLeave }
}

