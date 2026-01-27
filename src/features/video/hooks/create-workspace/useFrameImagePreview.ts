import { useCallback } from "react"

export function useFrameImagePreview(params: {
  activeItem: any | null
  activePreviewTitle: string | null
  imagePrompt: string
  lastImagePrompt: string
  sceneText: string
  setPreview: (p: any | null) => void
}) {
  const { activeItem, activePreviewTitle, imagePrompt, lastImagePrompt, sceneText, setPreview } = params

  const openFrameImagePreview = useCallback(
    async ({ label, src }: { label: string; src: string }) => {
      if (!activeItem) return
      const storyboardId = activeItem.id
      const rawUrl = (src ?? "").trim()
      if (!rawUrl || rawUrl.startsWith("data:")) {
        alert("未生成可编辑的图片")
        return
      }

      const normalizeUrlKey = (u: string) => {
        try {
          const url = new URL(u)
          url.search = ""
          url.hash = ""
          return `${url.origin}${url.pathname}`
        } catch {
          return u
        }
      }

      let generatedImageId: string | undefined
      try {
        const qs = new URLSearchParams({ storyboardId, limit: "200", offset: "0" })
        const res = await fetch(`/api/video-creation/images?${qs.toString()}`, { cache: "no-store" })
        const json = (await res.json().catch(() => null)) as { ok: boolean; data?: { items?: any[] } } | null
        const rows = Array.isArray(json?.data?.items) ? (json?.data?.items ?? []) : []
        const targetKey = normalizeUrlKey(rawUrl)
        const hit = rows.find((r) => {
          const url = typeof r?.url === "string" ? r.url : ""
          const thumb = typeof r?.thumbnailUrl === "string" ? r.thumbnailUrl : ""
          return (url && normalizeUrlKey(url) === targetKey) || (thumb && normalizeUrlKey(thumb) === targetKey)
        })
        const id = typeof hit?.id === "string" ? hit.id : ""
        if (id) generatedImageId = id
      } catch {}

      const usedPrompt =
        label.includes("尾") ? ((activeItem.frames?.last?.prompt ?? lastImagePrompt) || "") : ((activeItem.frames?.first?.prompt ?? imagePrompt) || "")

      const finalTitle = `${activePreviewTitle ?? `镜 ${activeItem.scene_no}`} ${label}`.trim()

      setPreview({
        title: finalTitle,
        imageSrc: rawUrl,
        generatedImageId,
        storyboardId,
        category: "background",
        frameKind: label.includes("尾") ? "last" : "first",
        description: sceneText,
        prompt: usedPrompt
      })
    },
    [activeItem, activePreviewTitle, imagePrompt, lastImagePrompt, sceneText, setPreview]
  )

  return openFrameImagePreview
}

