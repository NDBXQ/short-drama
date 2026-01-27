import { useEffect, useRef, type RefObject } from "react"
import {
  type VideoClip,
  type AudioClip,
  type TimelineSegment
} from "../../../utils/timelineUtils"
import { useTimelineDragAndDrop } from "./useTimelineDragAndDrop"
import { useTimelineViewportSync } from "./useTimelineViewportSync"
import { useTimelineKeyboardDelete } from "./useTimelineKeyboardDelete"
import { useTimelineClipInteractions } from "./useTimelineClipInteractions"

interface UseTimelineInteractionsProps {
  segments: TimelineSegment[]
  videoClips: VideoClip[]
  setVideoClips: React.Dispatch<React.SetStateAction<VideoClip[]>>
  audioClips: AudioClip[]
  setAudioClips: React.Dispatch<React.SetStateAction<AudioClip[]>>
  selectedClip: { type: "video" | "audio"; id: string } | null
  setSelectedClip: React.Dispatch<React.SetStateAction<{ type: "video" | "audio"; id: string } | null>>
  dragOver: boolean
  setDragOver: (over: boolean) => void
  totalSeconds: number
  updateVideoClip: (id: string, patch: Partial<VideoClip>) => void
  updateAudioClip: (id: string, patch: Partial<AudioClip>) => void
  timelineRef: RefObject<HTMLDivElement>
  wrapRef: RefObject<HTMLDivElement>
  keyboardScopeRef: RefObject<HTMLDivElement>
  playheadActive?: boolean
  playheadSeconds?: number | null
  onSeekPlayheadSeconds?: (seconds: number) => void
  activeId: string
  onSelectSegment: (id: string) => void
}

export function useTimelineInteractions({
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
  timelineRef,
  wrapRef,
  keyboardScopeRef,
  playheadActive,
  playheadSeconds,
  onSeekPlayheadSeconds,
  activeId,
  onSelectSegment
}: UseTimelineInteractionsProps) {
  const isInteractingRef = useRef(false)
  const latestVideoClipsRef = useRef(videoClips)
  useEffect(() => {
    latestVideoClipsRef.current = videoClips
  }, [videoClips])

  const { onDrop, onDragOver, onDragLeave } = useTimelineDragAndDrop({
    segments,
    totalSeconds,
    timelineRef,
    keyboardScopeRef,
    dragOver,
    setDragOver,
    setVideoClips,
    setAudioClips,
    setSelectedClip,
    onSelectSegment
  })

  const { playheadPx, beginSeek } = useTimelineViewportSync({
    wrapRef,
    isInteractingRef,
    latestVideoClipsRef,
    activeId,
    playheadActive,
    playheadSeconds,
    totalSeconds,
    keyboardScopeRef,
    onSeekPlayheadSeconds
  })

  const { onKeyDown } = useTimelineKeyboardDelete({ selectedClip, setSelectedClip, setVideoClips, setAudioClips })

  const { makeTrimHandler, makeDragHandler, makeAudioDragHandler, onClipClick } = useTimelineClipInteractions({
    latestVideoClipsRef,
    isInteractingRef,
    keyboardScopeRef,
    setSelectedClip,
    updateVideoClip,
    updateAudioClip,
    onSelectSegment
  })

  return {
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
  }
}
