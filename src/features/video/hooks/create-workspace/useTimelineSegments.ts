import { useMemo } from "react"
import type { StoryboardItem } from "@/features/video/types"
import type { VideoAssetGroup } from "../../components/VideoTimeline/VideoAssetSidebar"
import type { TimelineSegment } from "../../utils/mediaPreviewUtils"

export function useTimelineSegments(params: {
  activeTab: "image" | "video"
  items: StoryboardItem[]
  previewVideoSrcById: Record<string, string>
  videoAssetGroups: VideoAssetGroup[]
}): TimelineSegment[] {
  const { activeTab, items, previewVideoSrcById, videoAssetGroups } = params

  return useMemo(() => {
    if (activeTab !== "video") return []

    if (videoAssetGroups.length > 0) {
      return videoAssetGroups.flatMap((g) =>
        (g.segments ?? []).map((s) => ({
          id: s.id,
          title: `${g.label} ${s.title}`.trim(),
          videoSrc: (s.videoSrc ?? "").trim() || null,
          durationSeconds: s.durationSeconds ?? null
        }))
      )
    }

    return items
      .map((it) => {
        const candidate = (previewVideoSrcById[it.id] ?? it.videoInfo?.url ?? "").trim()
        const durationSeconds =
          typeof it.videoInfo?.durationSeconds === "number" && Number.isFinite(it.videoInfo.durationSeconds) && it.videoInfo.durationSeconds > 0
            ? it.videoInfo.durationSeconds
            : null
        return { id: it.id, title: `镜 ${it.scene_no}`, videoSrc: candidate || null, durationSeconds }
      })
      .filter((s) => Boolean((s.videoSrc ?? "").trim()))
  }, [activeTab, items, previewVideoSrcById, videoAssetGroups])
}

