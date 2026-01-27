import type { ReactElement } from "react"
import { useEffect, useMemo, useState } from "react"
import styles from "../ImagePreviewModal.module.css"
import { startReferenceImageJob, waitReferenceImageJob } from "../../utils/referenceImageAsync"
import type { NormalizedRect } from "./selectionUtils"

function normalizeCategory(input: unknown): "background" | "role" | "item" {
  return input === "role" || input === "item" || input === "background" ? input : "background"
}

export function SidePanel({
  open,
  title,
  description,
  prompt,
  storyboardId,
  category,
  currentSrc,
  setCurrentSrc,
  currentGeneratedImageId,
  setCurrentGeneratedImageId,
  isEditing,
  confirmedRect,
  setConfirmedRect,
  setIsEditing,
  editPrompt,
  setEditPrompt,
  onClose
}: {
  open: boolean
  title: string
  description?: string | null
  prompt?: string | null
  storyboardId?: string | null
  category?: string | null
  currentSrc: string
  setCurrentSrc: (v: string) => void
  currentGeneratedImageId?: string
  setCurrentGeneratedImageId: (v: string | undefined) => void
  isEditing: boolean
  confirmedRect: NormalizedRect | null
  setConfirmedRect: (r: NormalizedRect | null) => void
  setIsEditing: (v: boolean) => void
  editPrompt: string
  setEditPrompt: (v: string) => void
  onClose: () => void
}): ReactElement {
  const [saving, setSaving] = useState(false)
  const [saveDone, setSaveDone] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [publicResourceId, setPublicResourceId] = useState<string | null>(null)

  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const [regenerating, setRegenerating] = useState(false)
  const [regenerateError, setRegenerateError] = useState<string | null>(null)

  const [inpaintLoading, setInpaintLoading] = useState(false)
  const [inpaintError, setInpaintError] = useState<string | null>(null)

  const displayDescription = useMemo(() => {
    return (description ?? "").trim() || (prompt ?? "").trim() || "暂无描述"
  }, [description, prompt])

  const normalizedCategory = useMemo(() => normalizeCategory(category), [category])

  useEffect(() => {
    if (!open) return
    setSaving(false)
    setSaveDone(false)
    setSaveError(null)
    setPublicResourceId(null)
    setDeleting(false)
    setDeleteError(null)
    setRegenerating(false)
    setRegenerateError(null)
    setInpaintLoading(false)
    setInpaintError(null)
  }, [open])

  useEffect(() => {
    if (!open) return
    if (!currentGeneratedImageId) return
    let cancelled = false
    const run = async () => {
      try {
        const qs = new URLSearchParams({ generatedImageId: currentGeneratedImageId })
        const res = await fetch(`/api/library/public-resources/lookup?${qs.toString()}`, { method: "GET", cache: "no-store" })
        const json = (await res.json().catch(() => null)) as
          | { ok: boolean; data?: { exists?: boolean; id?: string | null }; error?: { message?: string } }
          | null
        if (!res.ok || !json?.ok) return
        const id = json.data?.id ?? null
        if (cancelled) return
        setPublicResourceId(id)
        if (id) setSaveDone(true)
      } catch {}
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [currentGeneratedImageId, open])

  const canInpaint = Boolean(confirmedRect && editPrompt.trim() && currentSrc)

  return (
    <div className={styles.right}>
      <div className={styles.rightHeader}>
        <div className={styles.rightTitleWrap}>{isEditing || confirmedRect ? <div className={styles.rightTitle}>区域重绘</div> : null}</div>
        <button type="button" className={styles.closeButton} onClick={onClose} aria-label="关闭">
          ×
        </button>
      </div>

      <div className={styles.panel}>
        {isEditing || confirmedRect ? (
          <>
            <div className={styles.panelHint}>
              1. 在左侧图片上框选需要修改的区域
              <br />
              2. 在下方描述修改后的画面内容
            </div>
            <textarea
              className={styles.promptInput}
              placeholder="请输入修改提示词，例如：换成红色的衣服..."
              value={editPrompt}
              onChange={(e) => setEditPrompt(e.target.value)}
              disabled={inpaintLoading}
            />
            <button
              type="button"
              className={styles.primaryButton}
              disabled={inpaintLoading || !canInpaint}
              onClick={async () => {
                if (!confirmedRect) return
                setInpaintLoading(true)
                setInpaintError(null)
                try {
                  const res = await fetch("/api/video-creation/images/inpaint", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      imageUrl: currentSrc,
                      selection: confirmedRect,
                      storyboardId: storyboardId ?? null,
                      generatedImageId: currentGeneratedImageId ?? null,
                      prompt: editPrompt
                    })
                  })
                  const json = (await res.json().catch(() => null)) as
                    | { ok: boolean; data?: { url?: string; generatedImageId?: string }; error?: { message?: string } }
                    | null
                  if (!res.ok || !json?.ok) throw new Error(json?.error?.message ?? `HTTP ${res.status}`)
                  const nextUrl = typeof json.data?.url === "string" ? json.data.url : ""
                  if (!nextUrl) throw new Error("生成成功但缺少图片 URL")
                  const nextId = typeof json.data?.generatedImageId === "string" ? json.data.generatedImageId : ""
                  setCurrentSrc(nextUrl)
                  if (nextId) setCurrentGeneratedImageId(nextId)
                  setConfirmedRect(null)
                  setIsEditing(false)
                  setEditPrompt("")
                  if (storyboardId) window.dispatchEvent(new CustomEvent("video_reference_images_updated", { detail: { storyboardId } }))
                } catch (err) {
                  const anyErr = err as { message?: string }
                  setInpaintError(anyErr?.message ?? "生成失败")
                } finally {
                  setInpaintLoading(false)
                }
              }}
            >
              {inpaintLoading ? "生成中…" : "使用选区生成"}
            </button>
            <button
              type="button"
              className={styles.secondaryButton}
              disabled={inpaintLoading}
              onClick={() => {
                setIsEditing(false)
                setConfirmedRect(null)
                setEditPrompt("")
              }}
            >
              退出编辑
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className={styles.primaryButton}
              disabled={saving || saveDone || !currentGeneratedImageId}
              onClick={async () => {
                if (!currentGeneratedImageId) return
                setSaving(true)
                setSaveError(null)
                try {
                  const res = await fetch("/api/library/public-resources/import-generated-image", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ generatedImageId: currentGeneratedImageId })
                  })
                  const json = (await res.json()) as { ok: boolean; data?: any; error?: { message?: string } }
                  if (!res.ok || !json?.ok) throw new Error(json?.error?.message ?? `HTTP ${res.status}`)
                  const id = typeof json?.data?.id === "string" ? json.data.id : null
                  if (id) setPublicResourceId(id)
                  setSaveDone(true)
                } catch (e) {
                  const anyErr = e as { message?: string }
                  setSaveError(anyErr?.message ?? "入库失败")
                } finally {
                  setSaving(false)
                }
              }}
            >
              {saveDone ? "已存入公共素材库" : saving ? "入库中…" : "存入公共素材库"}
            </button>

            <button
              type="button"
              className={styles.dangerButton}
              disabled={deleting || !publicResourceId}
              onClick={async () => {
                if (!publicResourceId) return
                const ok = window.confirm("确定从公共素材库删除该图片吗？")
                if (!ok) return
                setDeleting(true)
                setDeleteError(null)
                try {
                  const res = await fetch(`/api/library/public-resources/${encodeURIComponent(publicResourceId)}`, { method: "DELETE" })
                  const json = (await res.json().catch(() => null)) as { ok: boolean; error?: { message?: string } } | null
                  if (!res.ok || !json?.ok) throw new Error(json?.error?.message ?? `HTTP ${res.status}`)
                  setPublicResourceId(null)
                  setSaveDone(false)
                } catch (e) {
                  const anyErr = e as { message?: string }
                  setDeleteError(anyErr?.message ?? "删除失败")
                } finally {
                  setDeleting(false)
                }
              }}
            >
              {deleting ? "删除中…" : "从公共素材库删除"}
            </button>

            <button
              type="button"
              className={styles.secondaryButton}
              disabled={regenerating || !prompt || !storyboardId}
              onClick={async () => {
                if (!prompt || !storyboardId) return
                setRegenerating(true)
                setRegenerateError(null)
                try {
                  const jobId = await startReferenceImageJob({
                    storyboardId,
                    forceRegenerate: true,
                    prompts: [
                      {
                        name: title,
                        category: normalizedCategory,
                        description: description ?? undefined,
                        prompt,
                        generatedImageId: currentGeneratedImageId
                      }
                    ]
                  })
                  const snap = await waitReferenceImageJob(jobId)
                  const result = snap.results[0]
                  const url = typeof result?.url === "string" ? result.url : ""
                  const id = typeof result?.id === "string" ? result.id : currentGeneratedImageId
                  if (!url) throw new Error("重新生成成功但缺少图片 URL")
                  setCurrentSrc(url)
                  if (id) setCurrentGeneratedImageId(id)
                  window.dispatchEvent(new CustomEvent("video_reference_images_updated", { detail: { storyboardId } }))
                } catch (e) {
                  const anyErr = e as { message?: string }
                  setRegenerateError(anyErr?.message ?? "重新生成失败")
                } finally {
                  setRegenerating(false)
                }
              }}
            >
              {regenerating ? "重新生成中…" : "重新生成"}
            </button>

            <div className={styles.panelHint}>后续会在这里增加更多功能，例如下载、复制链接、设置为封面等。</div>
          </>
        )}

        {saveError ? <div className={styles.panelError}>{saveError}</div> : null}
        {regenerateError ? <div className={styles.panelError}>{regenerateError}</div> : null}
        {deleteError ? <div className={styles.panelError}>{deleteError}</div> : null}
        {inpaintError ? <div className={styles.panelError}>{inpaintError}</div> : null}
        <div className={styles.metaTitle}>{title}</div>
        <div className={styles.metaDescription}>{displayDescription}</div>
      </div>
    </div>
  )
}
