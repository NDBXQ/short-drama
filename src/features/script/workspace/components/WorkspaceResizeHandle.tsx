"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { ReactElement, RefObject } from "react"
import styles from "../ScriptWorkspacePage.module.css"

type WorkspaceResizeHandleProps = {
  containerRef: RefObject<HTMLElement | null>
}

const STORAGE_KEY = "script_workspace_sidebar_width_px"
const MIN_WIDTH = 320
const MAX_WIDTH = 720
const DEFAULT_WIDTH = 420

function clampWidth(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_WIDTH
  if (value < MIN_WIDTH) return MIN_WIDTH
  if (value > MAX_WIDTH) return MAX_WIDTH
  return Math.round(value)
}

export function WorkspaceResizeHandle({ containerRef }: WorkspaceResizeHandleProps): ReactElement {
  const [active, setActive] = useState(false)
  const lastClientXRef = useRef(0)
  const rafRef = useRef<number | null>(null)
  const prevUserSelectRef = useRef<string | null>(null)

  const applyWidth = useCallback(
    (widthPx: number) => {
      const el = containerRef.current
      if (!el) return
      const clamped = clampWidth(widthPx)
      el.style.setProperty("--workspace-sidebar-width", `${clamped}px`)
      try {
        localStorage.setItem(STORAGE_KEY, String(clamped))
      } catch {}
    },
    [containerRef]
  )

  useEffect(() => {
    let stored: number | null = null
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) stored = Number(raw)
    } catch {}
    if (stored != null && Number.isFinite(stored)) applyWidth(stored)
  }, [applyWidth])

  const scheduleFromClientX = useCallback(() => {
    if (rafRef.current != null) return
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null
      const container = containerRef.current
      if (!container) return
      const rect = container.getBoundingClientRect()
      const widthPx = rect.right - lastClientXRef.current
      applyWidth(widthPx)
    })
  }, [applyWidth, containerRef])

  useEffect(() => {
    if (!active) return

    const onMove = (e: PointerEvent) => {
      lastClientXRef.current = e.clientX
      scheduleFromClientX()
    }

    const onUp = () => {
      setActive(false)
    }

    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
    window.addEventListener("pointercancel", onUp)
    return () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
      window.removeEventListener("pointercancel", onUp)
    }
  }, [active, scheduleFromClientX])

  useEffect(() => {
    if (active) {
      prevUserSelectRef.current = document.body.style.userSelect
      document.body.style.userSelect = "none"
      return
    }
    if (prevUserSelectRef.current != null) {
      document.body.style.userSelect = prevUserSelectRef.current
      prevUserSelectRef.current = null
    }
  }, [active])

  return (
    <div
      className={active ? `${styles.resizeHandle} ${styles.resizeHandleActive}` : styles.resizeHandle}
      role="separator"
      aria-orientation="vertical"
      tabIndex={0}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        lastClientXRef.current = e.clientX
        setActive(true)
        ;(e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId)
        scheduleFromClientX()
      }}
      onDoubleClick={() => applyWidth(DEFAULT_WIDTH)}
    />
  )
}

