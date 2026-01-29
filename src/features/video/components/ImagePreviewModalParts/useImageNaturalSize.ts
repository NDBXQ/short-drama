import { useEffect, useState } from "react"

export function useImageNaturalSize(open: boolean, src: string) {
  const [loaded, setLoaded] = useState<{ url: string; size: { width: number; height: number } | null } | null>(null)
  const url = open ? (src ?? "").trim() : ""

  useEffect(() => {
    if (!open) return
    if (!url) return
    let cancelled = false
    const img = new window.Image()
    img.onload = () => {
      if (cancelled) return
      const width = Number(img.naturalWidth) || 0
      const height = Number(img.naturalHeight) || 0
      setLoaded({ url, size: width > 0 && height > 0 ? { width, height } : null })
    }
    img.onerror = () => {
      if (cancelled) return
      setLoaded({ url, size: null })
    }
    img.src = url
    return () => {
      cancelled = true
    }
  }, [open, url])

  return url && loaded?.url === url ? loaded.size : null
}
