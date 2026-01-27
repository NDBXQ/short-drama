import { useCallback, useMemo } from "react"

export function usePrevVideoLastFrame(params: {
  items: any[]
  activeItem: any | null
  activeStoryboardId: string
  setItems: (updater: (prev: any[]) => any[]) => void
  setPreviewImageSrcById: (updater: (prev: Record<string, string>) => Record<string, string>) => void
}) {
  const { items, activeItem, activeStoryboardId, setItems, setPreviewImageSrcById } = params

  const prevVideoLastFrameUrl = useMemo(() => {
    if (!activeItem) return null
    const idx = items.findIndex((it) => it.id === activeItem.id)
    if (idx <= 0) return null
    const prev = items[idx - 1]
    const raw = (prev?.videoInfo as any)?.settings?.lastFrameUrl
    const v = typeof raw === "string" ? raw.trim() : ""
    return v || null
  }, [activeItem, items])

  const usePrevVideoLastFrameAsFirst = useCallback(
    async (url: string) => {
      const storyboardId = activeStoryboardId
      const normalized = url.trim()
      if (!storyboardId || !normalized) throw new Error("未找到可用的尾帧图")

      const res = await fetch("/api/video/storyboards", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storyboardId, frames: { first: { url: normalized } } })
      })
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: { message?: string } } | null
      if (!res.ok || !json || json.ok !== true) {
        throw new Error(json?.error?.message ?? `HTTP ${res.status}`)
      }

      setItems((prev) =>
        prev.map((it) => {
          if (it.id !== storyboardId) return it
          const nextFrames = { ...(it.frames ?? {}), first: { ...(it.frames?.first ?? {}), url: normalized } }
          return { ...it, frames: nextFrames }
        })
      )
      setPreviewImageSrcById((prev) => {
        const next = { ...prev }
        if (next[storyboardId]) next[storyboardId] = ""
        return next
      })
    },
    [activeStoryboardId, setItems, setPreviewImageSrcById]
  )

  return { prevVideoLastFrameUrl, usePrevVideoLastFrameAsFirst }
}

