import { useCallback, useEffect, useState } from "react"

export function useScriptAudioAssets(params: {
  storyboardId?: string | null
  activeTab: "video" | "audio" | "image"
  ttsAudioVersion?: number
}): Array<{ id: string; name: string; kind: "audio"; src: string; roleName: string; speakerName: string; content: string }> {
  const { storyboardId, activeTab, ttsAudioVersion } = params
  const [scriptAudioAssets, setScriptAudioAssets] = useState<
    Array<{ id: string; name: string; kind: "audio"; src: string; roleName: string; speakerName: string; content: string }>
  >([])

  const loadScriptAudios = useCallback(async () => {
    const sbId = (storyboardId ?? "").trim()
    if (!sbId) {
      setScriptAudioAssets([])
      return
    }
    try {
      const res = await fetch(`/api/video-creation/audios?storyboardId=${encodeURIComponent(sbId)}&limit=200&offset=0`, { cache: "no-store" })
      const json = (await res.json().catch(() => null)) as { ok: boolean; data?: { items?: any[] } } | null
      if (!res.ok || !json?.ok || !Array.isArray(json.data?.items)) {
        setScriptAudioAssets([])
        return
      }
      const next = (json.data.items ?? [])
        .map((row) => {
          const id = String(row.id ?? "").trim()
          const roleName = typeof row.roleName === "string" ? row.roleName : "角色"
          const speakerName = typeof row.speakerName === "string" ? row.speakerName : "音色"
          const src = typeof row.url === "string" ? row.url : ""
          const content = typeof row.content === "string" ? row.content : ""
          const name = `${roleName}-${speakerName}`
          if (!id || !src) return null
          return { id, name, kind: "audio" as const, src, roleName, speakerName, content }
        })
        .filter(Boolean) as Array<{ id: string; name: string; kind: "audio"; src: string; roleName: string; speakerName: string; content: string }>
      setScriptAudioAssets(next)
    } catch {
      setScriptAudioAssets([])
    }
  }, [storyboardId])

  useEffect(() => {
    if (activeTab !== "audio") return
    if (typeof queueMicrotask === "function") {
      queueMicrotask(() => {
        void loadScriptAudios()
      })
      return
    }
    void Promise.resolve().then(() => loadScriptAudios())
  }, [activeTab, loadScriptAudios, ttsAudioVersion])

  return scriptAudioAssets
}

