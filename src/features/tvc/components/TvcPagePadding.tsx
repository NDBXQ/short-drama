"use client"

import { useEffect } from "react"

export function TvcPagePadding(): null {
  useEffect(() => {
    const root = document.documentElement
    const prev = root.style.getPropertyValue("--app-page-padding")
    root.style.setProperty("--app-page-padding", "0px")
    return () => {
      if (prev) root.style.setProperty("--app-page-padding", prev)
      else root.style.removeProperty("--app-page-padding")
    }
  }, [])

  return null
}

