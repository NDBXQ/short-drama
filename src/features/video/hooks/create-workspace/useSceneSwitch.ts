import { useMemo } from "react"
import type { StoryboardItem } from "@/features/video/types"

export function useSceneSwitch(items: StoryboardItem[], activeItemId: string | null | undefined): {
  canPrev: boolean
  canNext: boolean
  prevId: string
  nextId: string
} {
  return useMemo(() => {
    if (items.length === 0) return { canPrev: false, canNext: false, prevId: "", nextId: "" }
    const currentId = activeItemId ?? items[0]!.id
    const idx = items.findIndex((it) => it.id === currentId)
    const safeIdx = idx >= 0 ? idx : 0
    const prev = items[safeIdx - 1]?.id ?? ""
    const next = items[safeIdx + 1]?.id ?? ""
    return { canPrev: Boolean(prev), canNext: Boolean(next), prevId: prev, nextId: next }
  }, [activeItemId, items])
}

