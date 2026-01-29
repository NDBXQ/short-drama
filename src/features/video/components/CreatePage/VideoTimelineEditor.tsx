import { useEffect, useRef, type ReactElement } from "react"
import { useTimelineState } from "../VideoTimeline/hooks/useTimelineState"
import { useTimelineInteractions } from "../VideoTimeline/hooks/useTimelineInteractions"
import { TimelineRenderer } from "../VideoTimeline/TimelineRenderer"
import {
  type TimelineSegment,
  type VideoClip,
  type AudioClip,
  PX_PER_SECOND,
  TRACK_OFFSET_PX
} from "../../utils/timelineUtils"

export function VideoTimelineEditor({
  segments,
  activeId,
  onSelectSegment,
  segmentFirstFrames,
  timelineKey,
  initialTimeline,
  onTimelineChange,
  playheadSeconds,
  playheadActive,
  onSeekPlayheadSeconds
}: {
  segments: TimelineSegment[]
  activeId: string
  onSelectSegment: (id: string) => void
  segmentFirstFrames?: Record<string, string>
  timelineKey?: string
  initialTimeline?: { videoClips: VideoClip[]; audioClips: AudioClip[] } | null
  onTimelineChange?: (timeline: { videoClips: VideoClip[]; audioClips: AudioClip[] }) => void
  playheadSeconds?: number | null
  playheadActive?: boolean
  onSeekPlayheadSeconds?: (seconds: number) => void
}): ReactElement {
  const wrapRef = useRef<HTMLDivElement>(null)
  const timelineRef = useRef<HTMLDivElement>(null)
  const keyboardScopeRef = useRef<HTMLDivElement>(null)

  const {
    setViewportSeconds,
    videoClips,
    setVideoClips,
    audioClips,
    setAudioClips,
    dragOver,
    setDragOver,
    selectedClip,
    setSelectedClip,
    totalSeconds,
    widthPx,
    updateVideoClip,
    updateAudioClip
  } = useTimelineState({
    segments,
    timelineKey,
    initialTimeline,
    onTimelineChange
  })

  const {
    onDrop,
    onDragOver,
    onDragLeave,
    onKeyDown,
    playheadPx,
    beginSeek,
    makeTrimHandler,
    makeDragHandler,
    makeAudioDragHandler,
    onClipClick
  } = useTimelineInteractions({
    segments,
    videoClips,
    setVideoClips,
    audioClips,
    setAudioClips,
    selectedClip,
    setSelectedClip,
    dragOver,
    setDragOver,
    totalSeconds,
    updateVideoClip,
    updateAudioClip,
    timelineRef: timelineRef as React.RefObject<HTMLDivElement>,
    wrapRef: wrapRef as React.RefObject<HTMLDivElement>,
    keyboardScopeRef: keyboardScopeRef as React.RefObject<HTMLDivElement>,
    playheadActive,
    playheadSeconds,
    onSeekPlayheadSeconds,
    activeId,
    onSelectSegment
  })

  // Handle resize to update viewport seconds
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const calc = () => {
      const w = el.clientWidth
      const next = w > 0 ? Math.max(4, Math.ceil(w / PX_PER_SECOND)) : 0
      setViewportSeconds(next)
    }
    calc()
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(() => calc())
      ro.observe(el)
      return () => ro.disconnect()
    }
    window.addEventListener("resize", calc)
    return () => window.removeEventListener("resize", calc)
  }, [setViewportSeconds])

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      const wantsHorizontal = Boolean(e.deltaX) || Boolean(e.shiftKey && e.deltaY)
      if (!wantsHorizontal) return
      const rect = el.getBoundingClientRect()
      const x = e.clientX - rect.left
      if (x < TRACK_OFFSET_PX) {
        e.preventDefault()
      }
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => {
      el.removeEventListener("wheel", onWheel as any)
    }
  }, [])

  return (
    <TimelineRenderer
      videoClips={videoClips}
      audioClips={audioClips}
      activeId={activeId}
      segmentFirstFrames={segmentFirstFrames}
      selectedClip={selectedClip}
      totalSeconds={totalSeconds}
      widthPx={widthPx}
      dragOver={dragOver}
      playheadActive={playheadActive}
      playheadPx={playheadPx}
      playheadSeconds={playheadSeconds}
      onSeekPlayheadSeconds={onSeekPlayheadSeconds}
      timelineRef={timelineRef as React.RefObject<HTMLDivElement>}
      wrapRef={wrapRef as React.RefObject<HTMLDivElement>}
      keyboardScopeRef={keyboardScopeRef as React.RefObject<HTMLDivElement>}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onKeyDown={onKeyDown}
      beginSeek={beginSeek}
      makeDragHandler={makeDragHandler}
      makeAudioDragHandler={makeAudioDragHandler}
      makeTrimHandler={makeTrimHandler}
      onClipClick={onClipClick}
    />
  )
}
