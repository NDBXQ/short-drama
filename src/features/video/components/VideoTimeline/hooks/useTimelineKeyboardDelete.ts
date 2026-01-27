import { useCallback } from "react"
import type { AudioClip, VideoClip } from "../../../utils/timelineUtils"

export function useTimelineKeyboardDelete(params: {
  selectedClip: { type: "video" | "audio"; id: string } | null
  setSelectedClip: React.Dispatch<React.SetStateAction<{ type: "video" | "audio"; id: string } | null>>
  setVideoClips: React.Dispatch<React.SetStateAction<VideoClip[]>>
  setAudioClips: React.Dispatch<React.SetStateAction<AudioClip[]>>
}): { onKeyDown: (e: React.KeyboardEvent) => void } {
  const { selectedClip, setSelectedClip, setVideoClips, setAudioClips } = params

  const deleteSelectedClip = useCallback(() => {
    if (!selectedClip) return
    if (selectedClip.type === "video") {
      setVideoClips((prev) => prev.filter((c) => c.id !== selectedClip.id))
    } else {
      setAudioClips((prev) => prev.filter((c) => c.id !== selectedClip.id))
    }
    setSelectedClip(null)
  }, [selectedClip, setAudioClips, setSelectedClip, setVideoClips])

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return
      if (!selectedClip) return
      const target = e.target as HTMLElement | null
      const tag = (target?.tagName ?? "").toLowerCase()
      if (tag === "input" || tag === "textarea" || target?.isContentEditable) return
      e.preventDefault()
      deleteSelectedClip()
    },
    [deleteSelectedClip, selectedClip]
  )

  return { onKeyDown }
}

