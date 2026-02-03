import { useCallback, useEffect, useMemo, useState, type ReactElement } from "react"
import { createPortal } from "react-dom"
import type { StoryboardItem } from "../../types"
import type { ScriptGenerateState } from "../../hooks/useScriptGeneration"
import styles from "./StoryboardTableRow.module.css"
import { createPreviewSvgDataUrl } from "../../utils/svgUtils"
import { extractReferenceImagePrompts } from "../../utils/referenceImagePrompts"

type StoryboardTableRowProps = {
  item: StoryboardItem
  isSelected: boolean
  generationState?: ScriptGenerateState
  onSelect: (id: string) => void
  previews?: {
    role: Array<{ id: string; name: string; url: string; thumbnailUrl?: string | null; category?: string; storyboardId?: string | null; isGlobal?: boolean; description?: string | null; prompt?: string | null }>
    background: Array<{ id: string; name: string; url: string; thumbnailUrl?: string | null; category?: string; storyboardId?: string | null; isGlobal?: boolean; description?: string | null; prompt?: string | null }>
    item: Array<{ id: string; name: string; url: string; thumbnailUrl?: string | null; category?: string; storyboardId?: string | null; isGlobal?: boolean; description?: string | null; prompt?: string | null }>
  }
  onPreviewImage: (
    title: string,
    imageSrc: string,
    generatedImageId?: string,
    storyboardId?: string | null,
    category?: string | null,
    description?: string | null,
    prompt?: string | null
  ) => void
  onPickAsset?: (params: { storyboardId: string; category: "role" | "background" | "item"; title: string; entityName: string }) => void
  onDeleteAsset?: (params: { storyboardId: string; category: "role" | "item"; name: string; imageId: string; isGlobal?: boolean }) => Promise<void> | void
  onGenerateReferenceImages?: (storyboardId: string) => void
  refImageGenerating?: boolean
  onOpenEdit: (itemId: string, initialValue: string) => void
  onDelete: (id: string) => void
}

export function StoryboardTableRow({
  item,
  isSelected,
  generationState,
  onSelect,
  previews,
  onPreviewImage,
  onPickAsset,
  onDeleteAsset,
  onGenerateReferenceImages,
  refImageGenerating,
  onOpenEdit,
  onDelete
}: StoryboardTableRowProps): ReactElement {
  const [moreOpen, setMoreOpen] = useState(false)
  const [moreKind, setMoreKind] = useState<"role" | "background" | "item">("background")
  const [moreLabel, setMoreLabel] = useState("")
  const [moreList, setMoreList] = useState<
    Array<{ id: string; name: string; url: string; thumbnailUrl?: string | null; category?: string; storyboardId?: string | null; isGlobal?: boolean; description?: string | null; prompt?: string | null }>
  >([])
  const [deletingImageId, setDeletingImageId] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmTarget, setConfirmTarget] = useState<{ category: "role" | "item"; name: string; imageId: string; isGlobal?: boolean } | null>(null)
  const canPortal = typeof document !== "undefined"
  const isPlaceholderId = useCallback((id: string) => id.startsWith("placeholder:"), [])
  const requestDelete = useCallback(
    (p: { category: "role" | "item"; name: string; imageId: string; isGlobal?: boolean }) => {
      if (!onDeleteAsset) return
      if (deletingImageId) return
      setConfirmTarget(p)
      setConfirmOpen(true)
    },
    [deletingImageId, onDeleteAsset]
  )

  const confirmDelete = useCallback(async () => {
    if (!onDeleteAsset) return
    if (!confirmTarget) return
    if (deletingImageId) return
    setDeletingImageId(confirmTarget.imageId)
    try {
      await onDeleteAsset({
        storyboardId: item.id,
        category: confirmTarget.category,
        name: confirmTarget.name,
        imageId: confirmTarget.imageId,
        isGlobal: confirmTarget.isGlobal
      })
      setConfirmOpen(false)
      setConfirmTarget(null)
    } catch (e) {
      const anyErr = e as { message?: string }
      alert(anyErr?.message ?? "删除失败")
    } finally {
      setDeletingImageId(null)
    }
  }, [confirmTarget, deletingImageId, item.id, onDeleteAsset])

  useEffect(() => {
    if (!moreOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      setMoreOpen(false)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [moreOpen])

  useEffect(() => {
    if (!confirmOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      setConfirmOpen(false)
      setConfirmTarget(null)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [confirmOpen])

  const openMore = useCallback(
    (
      params: {
        kind: "role" | "background" | "item"
        label: string
        list: Array<{ id: string; name: string; url: string; thumbnailUrl?: string | null; category?: string; storyboardId?: string | null; isGlobal?: boolean; description?: string | null; prompt?: string | null }>
      }
    ) => {
      setMoreKind(params.kind)
      setMoreLabel(params.label)
      setMoreList(params.list)
      setMoreOpen(true)
    },
    []
  )

  const hintText =
    generationState && generationState.status !== "idle"
      ? generationState.message ?? (generationState.status === "generating" ? "脚本生成中…" : generationState.status === "success" ? "已生成" : "生成失败")
      : ""
  const hintToneClass =
    generationState?.tone === "error" ? styles.scriptHintError : generationState?.tone === "warn" ? styles.scriptHintWarn : styles.scriptHintInfo

  const confirmTitle = useMemo(() => {
    if (!confirmTarget) return "确认删除"
    return `删除素材：${confirmTarget.name}`
  }, [confirmTarget])

  const renderPreviewStack = (
    list: Array<{ id: string; name: string; url: string; thumbnailUrl?: string | null; category?: string; storyboardId?: string | null; isGlobal?: boolean; description?: string | null; prompt?: string | null }>,
    kind: "role" | "background" | "item",
    label: string
  ) => {
    const extracted = extractReferenceImagePrompts(item.scriptContent)

    const isNarrator = (name: string) => {
      const n = name.trim()
      if (!n) return false
      return n === "旁白" || n.toLowerCase() === "narrator"
    }

    const expectedEntities = (() => {
      const promptEntities = extracted
        .filter((p) => p.category === kind)
        .map((p) => ({
          name: (p.name ?? "").trim(),
          prompt: (p.prompt ?? "").trim(),
          description: ((p.description ?? "").trim() || (p.prompt ?? "").trim() || "").trim()
        }))
        .filter((p) => p.name)

      if (promptEntities.length > 0) return promptEntities

      if (kind === "background") {
        const name = (item.shot_content?.background?.background_name ?? "").trim()
        return name ? [{ name, prompt: "", description: "" }] : []
      }

      if (kind === "role") {
        const roles = Array.isArray(item.shot_content?.roles) ? item.shot_content.roles : []
        const names = roles
          .map((r) => (r && typeof r.role_name === "string" ? r.role_name.trim() : ""))
          .filter((n) => n && !isNarrator(n))
        const seen = new Set<string>()
        return names
          .filter((n) => {
            if (seen.has(n)) return false
            seen.add(n)
            return true
          })
          .map((name) => ({ name, prompt: "", description: "" }))
      }

      const roleItems = Array.isArray(item.shot_content?.role_items) ? item.shot_content.role_items : []
      const otherItems = Array.isArray(item.shot_content?.other_items) ? item.shot_content.other_items : []
      const names = [...roleItems, ...otherItems].map((v) => (typeof v === "string" ? v.trim() : "")).filter(Boolean)
      const seen = new Set<string>()
      return names
        .filter((n) => {
          if (seen.has(n)) return false
          seen.add(n)
          return true
        })
        .map((name) => ({ name, prompt: "", description: "" }))
    })()

    const existingNames = new Set(list.map((img) => (img.name ?? "").trim()).filter(Boolean))
    const placeholders = expectedEntities
      .filter((e) => e.name && !existingNames.has(e.name))
      .map((e) => {
        const placeholderSrc = createPreviewSvgDataUrl(e.name, `镜头 ${item.scene_no} · ${label} · 未生成`)
        return {
          id: `placeholder:${kind}:${item.id}:${e.name}`,
          name: e.name,
          url: placeholderSrc,
          thumbnailUrl: placeholderSrc,
          category: kind,
          storyboardId: item.id,
          isGlobal: false,
          description: e.description || null,
          prompt: e.prompt || null
        }
      })

    const displayList = [...list, ...placeholders]
    const visible = displayList.slice(0, 3)
    const rest = Math.max(0, displayList.length - visible.length)
    return (
      <div className={styles.previewStack}>
        {visible.map((img) => {
          const canDelete = !isPlaceholderId(img.id) && kind !== "background"
          return (
            <div key={img.id} className={styles.previewThumbWrap}>
              <button
                type="button"
                className={styles.previewThumb}
                onClick={() =>
                  onPreviewImage(
                    img.name,
                    img.url,
                    isPlaceholderId(img.id) ? undefined : img.id,
                    img.storyboardId ?? item.id,
                    img.category ?? null,
                    img.description,
                    img.prompt
                  )
                }
                aria-label={`预览 ${img.name}`}
              >
                <img className={styles.previewThumbImg} src={img.thumbnailUrl ?? img.url} alt={img.name} />
              </button>
              {canDelete ? (
                <button
                  type="button"
                  className={styles.previewThumbDelete}
                  aria-label={`删除 ${img.name}`}
                  title="删除"
                  disabled={Boolean(deletingImageId)}
                  onClick={(e) => {
                    e.stopPropagation()
                    requestDelete({ category: kind === "role" ? "role" : "item", name: img.name, imageId: img.id, isGlobal: img.isGlobal })
                  }}
                >
                  ×
                </button>
              ) : null}
            </div>
          )
        })}
        {rest > 0 ? (
          <button
            type="button"
            className={`${styles.previewThumb} ${styles.previewThumbMore}`}
            onClick={() => openMore({ kind, label, list: displayList })}
            aria-label={`查看全部${label}素材`}
          >
            +{rest}
          </button>
        ) : null}
        {kind !== "background" && onPickAsset ? (
          <button
            type="button"
            className={`${styles.previewThumb} ${styles.previewThumbEmpty}`}
            aria-label={`为镜头 ${item.scene_no} 添加${label}素材`}
            onClick={() => {
              const firstName = ((expectedEntities[0]?.name ?? "").trim() || label).trim()
              onPickAsset?.({ storyboardId: item.id, category: kind, title: `镜头${item.scene_no}-${label}`, entityName: firstName })
            }}
          >
            +
          </button>
        ) : null}
      </div>
    )
  }

  const moreTitle = useMemo(() => `镜头 ${item.scene_no} · ${moreLabel}素材`, [item.scene_no, moreLabel])

  return (
    <>
      <tr>
        <td className={styles.colCheckbox}>
          <input type="checkbox" checked={isSelected} onChange={() => onSelect(item.id)} />
        </td>
        <td className={styles.colNo}>
          <span className={styles.sceneNo}>{item.scene_no}</span>
        </td>
        <td className={styles.colVisual}>
          <div className={styles.visualContent}>
            {item.storyboard_text ? <div className={styles.storyboardText}>{item.storyboard_text}</div> : null}
            {hintText ? <div className={`${styles.scriptHint} ${hintToneClass}`}>{hintText}</div> : null}
          </div>
        </td>
        <td className={styles.colRole}>
          {renderPreviewStack(previews?.role ?? [], "role", "角色")}
        </td>
        <td className={styles.colBackground}>
          {renderPreviewStack(previews?.background ?? [], "background", "背景")}
        </td>
        <td className={styles.colItems}>
          {renderPreviewStack(previews?.item ?? [], "item", "物品")}
        </td>
        <td className={styles.colActions}>
          <div className={styles.actionGroup}>
            <button
              type="button"
              className={styles.actionBtn}
              title="预览"
              onClick={() => onOpenEdit(item.id, item.storyboard_text ?? "")}
            >
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                />
              </svg>
            </button>
            <button
              type="button"
              className={styles.actionBtn}
              title={refImageGenerating ? "参考图生成中…" : "生成参考图"}
              aria-label="生成参考图"
              disabled={Boolean(refImageGenerating) || !onGenerateReferenceImages}
              onClick={() => onGenerateReferenceImages?.(item.id)}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M4.5 6.5A2.5 2.5 0 0 1 7 4h10a2.5 2.5 0 0 1 2.5 2.5v10A2.5 2.5 0 0 1 17 19H7a2.5 2.5 0 0 1-2.5-2.5v-10Z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinejoin="round"
                />
                <path d="M8 14l2-2 2 2 3-3 3 3" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                <path d="M8.5 9.5h.01" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
            </button>
            <button className={`${styles.actionBtn} ${styles.deleteBtn}`} onClick={() => onDelete(item.id)} title="删除">
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </button>
          </div>
        </td>
      </tr>
      {canPortal && moreOpen
        ? createPortal(
            <div
              className={styles.moreOverlay}
              role="presentation"
              onClick={() => setMoreOpen(false)}
            >
              <div
                className={styles.moreModal}
                role="dialog"
                aria-modal="true"
                aria-label={moreTitle}
                onClick={(e) => e.stopPropagation()}
              >
                <div className={styles.moreHeader}>
                  <div className={styles.moreTitle}>{moreTitle}</div>
                  <button type="button" className={styles.moreCloseBtn} onClick={() => setMoreOpen(false)} aria-label="关闭">
                    ×
                  </button>
                </div>
                <div className={styles.moreGrid} aria-label="素材列表">
                  {moreList.map((img) => {
                    const canDelete = !isPlaceholderId(img.id) && moreKind !== "background"
                    return (
                      <div key={img.id} className={styles.moreItemWrap}>
                        <button
                          type="button"
                          className={styles.moreItem}
                          onClick={() => {
                            setMoreOpen(false)
                            onPreviewImage(
                              img.name,
                              img.url,
                              isPlaceholderId(img.id) ? undefined : img.id,
                              img.storyboardId ?? item.id,
                              img.category ?? null,
                              img.description,
                              img.prompt
                            )
                          }}
                          aria-label={`预览 ${img.name}`}
                          title={img.name}
                        >
                          <img className={styles.moreItemImg} src={img.thumbnailUrl ?? img.url} alt={img.name} />
                          <div className={styles.moreItemName}>{img.name}</div>
                        </button>
                        {canDelete ? (
                          <button
                            type="button"
                            className={styles.moreItemDelete}
                            aria-label={`删除 ${img.name}`}
                            title="删除"
                            disabled={Boolean(deletingImageId)}
                            onClick={(e) => {
                              e.stopPropagation()
                              requestDelete({ category: moreKind === "role" ? "role" : "item", name: img.name, imageId: img.id, isGlobal: img.isGlobal })
                            }}
                          >
                            ×
                          </button>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
                {moreKind !== "background" && onPickAsset ? (
                  <div className={styles.moreFooter}>
                    <button
                      type="button"
                      className={styles.moreAddBtn}
                      onClick={() => {
                        setMoreOpen(false)
                        const firstName = (moreList[0]?.name ?? "").trim() || moreLabel
                        onPickAsset?.({ storyboardId: item.id, category: moreKind, title: `镜头${item.scene_no}-${moreLabel}`, entityName: firstName })
                      }}
                    >
                      添加素材
                    </button>
                  </div>
                ) : null}
              </div>
            </div>,
            document.body
          )
        : null}
      {canPortal && confirmOpen
        ? createPortal(
            <div
              className={styles.confirmOverlay}
              role="presentation"
              onClick={() => {
                if (deletingImageId) return
                setConfirmOpen(false)
                setConfirmTarget(null)
              }}
            >
              <div
                className={styles.confirmModal}
                role="dialog"
                aria-modal="true"
                aria-label={confirmTitle}
                onClick={(e) => e.stopPropagation()}
              >
                <div className={styles.confirmHeader}>
                  <div className={styles.confirmTitle}>{confirmTitle}</div>
                  <button
                    type="button"
                    className={styles.confirmCloseBtn}
                    onClick={() => {
                      if (deletingImageId) return
                      setConfirmOpen(false)
                      setConfirmTarget(null)
                    }}
                    aria-label="关闭"
                  >
                    ×
                  </button>
                </div>
                <div className={styles.confirmBody}>
                  <div className={styles.confirmDesc}>
                    {confirmTarget?.isGlobal ? "删除后可能影响其他镜头复用。" : "删除后将从该镜头脚本中移除对应实体。"}
                  </div>
                </div>
                <div className={styles.confirmActions}>
                  <button
                    type="button"
                    className={styles.confirmBtn}
                    disabled={Boolean(deletingImageId)}
                    onClick={() => {
                      setConfirmOpen(false)
                      setConfirmTarget(null)
                    }}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    className={`${styles.confirmBtn} ${styles.confirmBtnDanger}`}
                    disabled={Boolean(deletingImageId) || !confirmTarget}
                    onClick={() => void confirmDelete()}
                  >
                    删除
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  )
}
