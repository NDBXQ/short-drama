import { useCallback, useEffect, useState } from "react"
import type { ApiErr, ApiOk } from "@/shared/api"
import type { OutlineItem } from "../utils"

/**
 * Hook for handling outline actions (delete, save draft)
 * @param {React.Dispatch<React.SetStateAction<ReadonlyArray<OutlineItem>>>} setLocalOutlines - State setter for outlines
 * @returns {Object} Actions and state
 */
export function useOutlineActions(input: {
  outlines: ReadonlyArray<OutlineItem>
  setLocalOutlines: React.Dispatch<React.SetStateAction<ReadonlyArray<OutlineItem>>>
  setLocalStoryMetadata?: React.Dispatch<React.SetStateAction<Record<string, unknown>>>
}) {
  const { outlines, setLocalOutlines, setLocalStoryMetadata } = input

  const [deleting, setDeleting] = useState(false)
  const [confirmDeleteOutlineIds, setConfirmDeleteOutlineIds] = useState<ReadonlyArray<string> | null>(null)
  const [toast, setToast] = useState<{ type: "error" | "success"; message: string } | null>(null)
  const [selectedOutlineIds, setSelectedOutlineIds] = useState<ReadonlySet<string>>(() => new Set())

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 2500)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    if (!confirmDeleteOutlineIds) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setConfirmDeleteOutlineIds(null)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [confirmDeleteOutlineIds])

  useEffect(() => {
    const allowed = new Set(outlines.map((o) => o.outlineId))
    setSelectedOutlineIds((prev) => {
      if (prev.size === 0) return prev
      const next = new Set<string>()
      for (const id of prev) {
        if (allowed.has(id)) next.add(id)
      }
      return next.size === prev.size ? prev : next
    })
  }, [outlines])

  const toggleSelected = useCallback((outlineId: string) => {
    setSelectedOutlineIds((prev) => {
      const next = new Set(prev)
      if (next.has(outlineId)) next.delete(outlineId)
      else next.add(outlineId)
      return next
    })
  }, [])

  const clearSelection = useCallback(() => setSelectedOutlineIds(new Set()), [])

  const selectAll = useCallback((ids: ReadonlyArray<string>) => setSelectedOutlineIds(new Set(ids)), [])

  const handleDeleteOutline = useCallback(
    async (outlineId: string) => {
      if (!outlineId || deleting) return
      setDeleting(true)
      try {
        const res = await fetch(`/api/script/outlines/${encodeURIComponent(outlineId)}`, { method: "DELETE" })
        const json = (await res.json().catch(() => null)) as ApiOk<unknown> | ApiErr | null
        if (!res.ok || !json || (json as ApiErr).ok === false) {
          const errJson = json as ApiErr | null
          throw new Error(errJson?.error?.message ?? `HTTP ${res.status}`)
        }
        setToast({ type: "success", message: "已删除" })
        setSelectedOutlineIds((prev) => {
          if (!prev.has(outlineId)) return prev
          const next = new Set(prev)
          next.delete(outlineId)
          return next
        })
        window.location.reload()
      } catch (err) {
        const anyErr = err as { message?: string }
        setToast({ type: "error", message: anyErr?.message ?? "删除失败，请稍后重试" })
      } finally {
        setDeleting(false)
      }
    },
    [deleting]
  )

  const handleBatchDeleteOutlines = useCallback(
    async (outlineIds: ReadonlyArray<string>) => {
      const cleaned = Array.from(new Set(outlineIds.map((x) => String(x ?? "").trim()).filter(Boolean)))
      if (cleaned.length === 0 || deleting) return
      setDeleting(true)
      try {
        const res = await fetch("/api/script/outlines/batch-delete", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ outlineIds: cleaned })
        })
        const json = (await res.json().catch(() => null)) as ApiOk<unknown> | ApiErr | null
        if (!res.ok || !json || (json as ApiErr).ok === false) {
          const errJson = json as ApiErr | null
          throw new Error(errJson?.error?.message ?? `HTTP ${res.status}`)
        }
        setToast({ type: "success", message: "已删除" })
        setSelectedOutlineIds((prev) => {
          if (prev.size === 0) return prev
          const next = new Set(prev)
          for (const id of cleaned) next.delete(id)
          return next
        })
        window.location.reload()
      } catch (err) {
        const anyErr = err as { message?: string }
        setToast({ type: "error", message: anyErr?.message ?? "删除失败，请稍后重试" })
      } finally {
        setDeleting(false)
      }
    },
    [deleting]
  )

  const persistOutlineDraft = useCallback(
    async (input: { outlineId: string; title?: string | null; content: string; requirements: string }) => {
      const res = await fetch(`/api/script/outlines/${encodeURIComponent(input.outlineId)}/drafts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: input.title ?? undefined,
          content: input.content,
          requirements: input.requirements
        })
      })
      const json = (await res.json().catch(() => null)) as ApiOk<any> | ApiErr | null
      if (!res.ok || !json || (json as ApiErr).ok === false) {
        const errJson = json as ApiErr | null
        throw new Error(errJson?.error?.message ?? `HTTP ${res.status}`)
      }
      const okJson = json as ApiOk<{
        outlineId: string
        draft: any
        activeDraftId: string
        originalText?: string
        metadataPatch?: { shortDrama?: { outlineJson?: unknown; scriptBody?: unknown; scriptBodyGeneratedAt?: unknown } }
      }>
      const outlineId = okJson.data.outlineId
      const draft = okJson.data.draft
      const activeDraftId = okJson.data.activeDraftId
      const originalText = typeof okJson.data.originalText === "string" ? okJson.data.originalText : null
      const metadataPatch = okJson.data.metadataPatch ?? null
      setLocalOutlines((prev) =>
        prev.map((o) =>
          o.outlineId === outlineId
            ? {
                ...o,
                outlineDrafts: [...(Array.isArray(o.outlineDrafts) ? o.outlineDrafts : []), draft],
                activeOutlineDraftId: activeDraftId,
                originalText: originalText ?? o.originalText
              }
            : o
        )
      )

      if (setLocalStoryMetadata && metadataPatch?.shortDrama) {
        setLocalStoryMetadata((prev) => {
          const base = prev && typeof prev === "object" ? prev : {}
          const shortDramaPrev = (base as any).shortDrama
          const shortDramaObj = shortDramaPrev && typeof shortDramaPrev === "object" ? shortDramaPrev : {}
          return {
            ...base,
            shortDrama: {
              ...shortDramaObj,
              ...metadataPatch.shortDrama
            }
          }
        })
      }
    },
    [setLocalOutlines, setLocalStoryMetadata]
  )

  return {
    deleting,
    confirmDeleteOutlineIds,
    setConfirmDeleteOutlineIds,
    handleDeleteOutline,
    handleBatchDeleteOutlines,
    persistOutlineDraft,
    toast,
    setToast,
    selectedOutlineIds,
    toggleSelected,
    clearSelection,
    selectAll
  }
}
