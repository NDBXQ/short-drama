import { useEffect, useState } from "react"

export function useImageNaturalSize(open: boolean, src: string) {
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null)

  useEffect(() => {
    if (!open) return
    const url = (src ?? "").trim()
    if (!url) {
      setImageSize(null)
      return
    }
    let cancelled = false
    const img = new window.Image()
    img.onload = () => {
      if (cancelled) return
      const width = Number(img.naturalWidth) || 0
      const height = Number(img.naturalHeight) || 0
      if (width > 0 && height > 0) setImageSize({ width, height })
    }
    img.onerror = () => {
      if (cancelled) return
      setImageSize(null)
    }
    img.src = url
    return () => {
      cancelled = true
    }
  }, [open, src])

  return imageSize
}

