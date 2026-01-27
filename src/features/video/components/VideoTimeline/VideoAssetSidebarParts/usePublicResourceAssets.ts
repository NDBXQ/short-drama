import { useCallback, useEffect, useState } from "react"
import type { AudioAsset, VideoAsset } from "../../../utils/timelineUtils"

export function usePublicResourceAssets(): {
  audioAssets: AudioAsset[]
  videoLibraryAssets: VideoAsset[]
  uploadAudio: (file: File) => void
  uploadVideo: (file: File) => void
} {
  const [audioAssets, setAudioAssets] = useState<AudioAsset[]>([])
  const [videoLibraryAssets, setVideoLibraryAssets] = useState<VideoAsset[]>([])

  const uploadPublicResource = useCallback(async (file: File, type: "audio" | "video") => {
    const form = new FormData()
    form.set("file", file)
    form.set("type", type)
    form.set("name", file.name.replace(/\\.[^/.]+$/, ""))
    const res = await fetch("/api/library/public-resources/upload", { method: "POST", body: form })
    const json = (await res.json()) as { ok: boolean; error?: { message?: string } }
    if (!res.ok || !json?.ok) throw new Error(json?.error?.message ?? `HTTP ${res.status}`)
  }, [])

  const loadAudio = useCallback(async () => {
    try {
      const res = await fetch("/api/library/public-resources/list?type=audio&limit=200&offset=0", { cache: "no-store" })
      const json = (await res.json()) as { ok: boolean; data?: { items?: any[] } }
      if (!res.ok || !json?.ok || !Array.isArray(json.data?.items)) {
        setAudioAssets([])
        return
      }
      const next = json.data.items
        .map((row) => ({
          id: String(row.id),
          name: typeof row.name === "string" ? row.name : "audio",
          kind: "audio" as const,
          src: typeof row.originalUrl === "string" ? row.originalUrl : typeof row.previewUrl === "string" ? row.previewUrl : undefined
        }))
        .filter((v) => v.id && v.name)
      setAudioAssets(next)
    } catch {
      setAudioAssets([])
    }
  }, [])

  const loadVideoLibrary = useCallback(async () => {
    try {
      const res = await fetch("/api/library/public-resources/list?type=video&limit=200&offset=0", { cache: "no-store" })
      const json = (await res.json()) as { ok: boolean; data?: { items?: any[] } }
      if (!res.ok || !json?.ok || !Array.isArray(json.data?.items)) {
        setVideoLibraryAssets([])
        return
      }
      const next = json.data.items
        .map((row) => {
          const src = typeof row.originalUrl === "string" ? row.originalUrl : typeof row.previewUrl === "string" ? row.previewUrl : undefined
          return {
            id: String(row.id),
            name: typeof row.name === "string" ? row.name : "video",
            kind: "video" as const,
            src,
            durationSeconds: null
          }
        })
        .filter((v) => v.id && v.name && v.src)
      setVideoLibraryAssets(next)
    } catch {
      setVideoLibraryAssets([])
    }
  }, [])

  useEffect(() => {
    if (typeof queueMicrotask === "function") {
      queueMicrotask(() => {
        void loadAudio()
        void loadVideoLibrary()
      })
      return
    }
    void Promise.resolve().then(() => Promise.all([loadAudio(), loadVideoLibrary()]))
  }, [loadAudio, loadVideoLibrary])

  const uploadAudio = useCallback(
    (file: File) => {
      void uploadPublicResource(file, "audio")
        .then(() => loadAudio())
        .catch(() => {})
    },
    [loadAudio, uploadPublicResource]
  )

  const uploadVideo = useCallback(
    (file: File) => {
      void uploadPublicResource(file, "video")
        .then(() => loadVideoLibrary())
        .catch(() => {})
    },
    [loadVideoLibrary, uploadPublicResource]
  )

  return { audioAssets, videoLibraryAssets, uploadAudio, uploadVideo }
}

