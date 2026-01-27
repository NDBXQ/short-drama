import { useEffect, useMemo, useRef, useState } from "react"
import { applyResize, clamp, clamp01, computeContainMetrics, normalizeRect, rectToStyle } from "./selectionUtils"
import type { ContainMetrics, NormalizedRect, ResizeHandle } from "./selectionUtils"

export function useSelectionRect(params: {
  open: boolean
  imageSize: { width: number; height: number } | null
  frameRef: React.RefObject<HTMLDivElement | null>
  disabled?: boolean
}) {
  const { open, imageSize, frameRef, disabled } = params
  const [isEditing, setIsEditing] = useState(false)
  const [draftRect, setDraftRect] = useState<NormalizedRect | null>(null)
  const [confirmedRect, setConfirmedRect] = useState<NormalizedRect | null>(null)

  const dragRef = useRef<{ dragging: boolean; startX: number; startY: number } | null>(null)
  const selectionDragRef = useRef<{
    mode: "move" | "resize"
    handle?: ResizeHandle
    startClientX: number
    startClientY: number
    startRect: NormalizedRect
  } | null>(null)

  const [frameRect, setFrameRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null)

  useEffect(() => {
    if (!open) return
    const updateRect = () => {
      const el = frameRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      setFrameRect({ left: rect.left, top: rect.top, width: rect.width, height: rect.height })
    }

    updateRect()
    const ro = new ResizeObserver(updateRect)
    if (frameRef.current) ro.observe(frameRef.current)
    window.addEventListener("scroll", updateRect, { capture: true, passive: true })
    window.addEventListener("resize", updateRect)
    return () => {
      ro.disconnect()
      window.removeEventListener("scroll", updateRect, { capture: true } as any)
      window.removeEventListener("resize", updateRect)
    }
  }, [frameRef, open, imageSize])

  const containMetrics: ContainMetrics | null = useMemo(() => computeContainMetrics(imageSize, frameRect), [imageSize, frameRect])

  const getNormDelta = (dxPx: number, dyPx: number) => {
    if (!containMetrics) return { dx: 0, dy: 0 }
    const dx = containMetrics.dw > 0 ? dxPx / containMetrics.dw : 0
    const dy = containMetrics.dh > 0 ? dyPx / containMetrics.dh : 0
    return { dx, dy }
  }

  const overlayRect = (isEditing ? draftRect : confirmedRect) ?? null
  const overlayStyle = useMemo(() => rectToStyle(containMetrics, overlayRect), [containMetrics, overlayRect])

  const canEdit = Boolean(imageSize)

  const beginBoxSelect = (e: React.PointerEvent) => {
    if (!isEditing) return
    if (disabled) return
    const frame = frameRef.current
    if (!frame) return
    const rect = frame.getBoundingClientRect()
    if (!containMetrics) return

    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const sx = clamp(x, containMetrics.ox, containMetrics.ox + containMetrics.dw)
    const sy = clamp(y, containMetrics.oy, containMetrics.oy + containMetrics.dh)

    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    dragRef.current = { dragging: true, startX: sx, startY: sy }
    setDraftRect({ x: clamp01((sx - containMetrics.ox) / containMetrics.dw), y: clamp01((sy - containMetrics.oy) / containMetrics.dh), w: 0, h: 0 })
  }

  const onBoxSelectMove = (e: React.PointerEvent) => {
    const drag = dragRef.current
    if (!isEditing || !drag?.dragging) return
    if (disabled) return
    if (!containMetrics) return
    const frame = frameRef.current
    if (!frame) return
    const rect = frame.getBoundingClientRect()

    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const cx = clamp(x, containMetrics.ox, containMetrics.ox + containMetrics.dw)
    const cy = clamp(y, containMetrics.oy, containMetrics.oy + containMetrics.dh)
    const minX = Math.min(drag.startX, cx)
    const minY = Math.min(drag.startY, cy)
    const maxX = Math.max(drag.startX, cx)
    const maxY = Math.max(drag.startY, cy)
    const nx = clamp01((minX - containMetrics.ox) / containMetrics.dw)
    const ny = clamp01((minY - containMetrics.oy) / containMetrics.dh)
    const nw = clamp01((maxX - containMetrics.ox) / containMetrics.dw) - nx
    const nh = clamp01((maxY - containMetrics.oy) / containMetrics.dh) - ny
    setDraftRect({ x: nx, y: ny, w: Math.max(0, nw), h: Math.max(0, nh) })
  }

  const onBoxSelectEnd = (e: React.PointerEvent) => {
    const drag = dragRef.current
    if (!drag?.dragging) return
    dragRef.current = { ...drag, dragging: false }
    try {
      ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {}
    setDraftRect((cur) => {
      if (!cur) return null
      if (cur.w < 0.01 || cur.h < 0.01) return null
      setConfirmedRect(normalizeRect(cur))
      setIsEditing(false)
      return null
    })
  }

  const updateRect = (r: NormalizedRect) => {
    if (isEditing) setDraftRect(r)
    else setConfirmedRect(r)
  }

  const startMove = (e: React.PointerEvent) => {
    const rect = isEditing ? draftRect : confirmedRect
    if (!rect) return
    if (disabled) return
    if (!containMetrics) return
    e.stopPropagation()
    selectionDragRef.current = { mode: "move", startClientX: e.clientX, startClientY: e.clientY, startRect: rect }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  const startResize = (handle: ResizeHandle) => (e: React.PointerEvent) => {
    const rect = isEditing ? draftRect : confirmedRect
    if (!rect) return
    if (disabled) return
    if (!containMetrics) return
    selectionDragRef.current = { mode: "resize", handle, startClientX: e.clientX, startClientY: e.clientY, startRect: rect }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    e.preventDefault()
    e.stopPropagation()
  }

  const onSelectionPointerMove = (e: React.PointerEvent) => {
    const drag = selectionDragRef.current
    if (!drag) return
    if (disabled) return
    if (!containMetrics) return
    const { dx, dy } = getNormDelta(e.clientX - drag.startClientX, e.clientY - drag.startClientY)
    if (drag.mode === "move") {
      const x = clamp01(drag.startRect.x + dx)
      const y = clamp01(drag.startRect.y + dy)
      updateRect(normalizeRect({ ...drag.startRect, x, y }))
      return
    }
    if (drag.mode === "resize" && drag.handle) {
      updateRect(normalizeRect(applyResize(drag.handle, drag.startRect, dx, dy)))
    }
  }

  const onSelectionPointerUp = (e: React.PointerEvent) => {
    selectionDragRef.current = null
    e.stopPropagation()
  }

  const clearSelection = () => {
    setDraftRect(null)
    setConfirmedRect(null)
  }

  return {
    canEdit,
    isEditing,
    setIsEditing,
    draftRect,
    setDraftRect,
    confirmedRect,
    setConfirmedRect,
    containMetrics,
    overlayStyle,
    overlayRect,
    beginBoxSelect,
    onBoxSelectMove,
    onBoxSelectEnd,
    startMove,
    startResize,
    onSelectionPointerMove,
    onSelectionPointerUp,
    clearSelection
  }
}

