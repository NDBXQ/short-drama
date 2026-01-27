import { useCallback, useEffect, useMemo, useRef, useState } from "react"

export function useResizableAssetSidebar(params: { timelineKey?: string; enabled: boolean }) {
  const { timelineKey, enabled } = params
  const sidebarKey = useMemo(() => `ai-video:asset-sidebar-w:${timelineKey ?? "default"}`, [timelineKey])
  const [assetSidebarWidth, setAssetSidebarWidth] = useState(280)
  const [splitterActive, setSplitterActive] = useState(false)
  const dragRef = useRef<{ startX: number; startW: number } | null>(null)

  useEffect(() => {
    if (!enabled) return
    if (typeof window === "undefined") return
    try {
      const raw = window.localStorage.getItem(sidebarKey)
      const n = Number(raw)
      if (Number.isFinite(n) && n > 0) queueMicrotask(() => setAssetSidebarWidth(n))
    } catch {}
  }, [enabled, sidebarKey])

  useEffect(() => {
    if (!enabled) return
    if (typeof window === "undefined") return
    try {
      window.localStorage.setItem(sidebarKey, String(assetSidebarWidth))
    } catch {}
  }, [assetSidebarWidth, enabled, sidebarKey])

  useEffect(() => {
    if (!enabled) return
    if (!splitterActive) return
    if (typeof window === "undefined") return

    const onMove = (e: PointerEvent) => {
      const snap = dragRef.current
      if (!snap) return
      const delta = snap.startX - e.clientX
      const next = Math.max(176, Math.min(480, snap.startW + delta))
      setAssetSidebarWidth(next)
    }

    const onUp = () => {
      dragRef.current = null
      setSplitterActive(false)
    }

    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
    window.addEventListener("pointercancel", onUp)

    const prevCursor = document.body.style.cursor
    document.body.style.cursor = "col-resize"

    return () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
      window.removeEventListener("pointercancel", onUp)
      document.body.style.cursor = prevCursor
    }
  }, [enabled, splitterActive])

  const startResize = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!enabled) return
      setSplitterActive(true)
      e.preventDefault()
      dragRef.current = { startX: e.clientX, startW: assetSidebarWidth }
    },
    [assetSidebarWidth, enabled]
  )

  return { assetSidebarWidth, setAssetSidebarWidth, splitterActive, startResize }
}

