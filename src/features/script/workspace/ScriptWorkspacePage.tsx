
"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { ReactElement } from "react"
import { useRouter } from "next/navigation"
import styles from "./ScriptWorkspacePage.module.css"
import type { ScriptWorkspaceMode, OutlineItem } from "./utils"
import { OutlineNav } from "./components/OutlineNav"
import { PreviewPanel } from "./components/PreviewPanel"
import { ChatSidebar } from "./components/ChatSidebar"
import { WorkspaceResizeHandle } from "./components/WorkspaceResizeHandle"
import { useOutlineActions } from "./hooks/useOutlineActions"
import { useScriptRewrite } from "./hooks/useScriptRewrite"
import type { ApiErr, ApiOk } from "@/shared/api"

type ScriptWorkspacePageProps = Readonly<{
  mode: ScriptWorkspaceMode
  storyId: string
  outline?: string
  view?: string
  outlines: ReadonlyArray<OutlineItem>
  storyMetadata?: Record<string, unknown>
}>

/**
 * 剧本创作工作区页面（与参考图保持结构一致）
 * @param {ScriptWorkspacePageProps} props - 组件属性
 * @param {ScriptWorkspaceMode} props.mode - 进入模式（source/brief）
 * @param {string} props.storyId - 故事 ID
 * @returns {ReactElement} 页面内容
 */
export function ScriptWorkspacePage({ mode, storyId, outline, view, outlines, storyMetadata }: ScriptWorkspacePageProps): ReactElement {
  const router = useRouter()
  const gridRef = useRef<HTMLDivElement | null>(null)
  const [isCompact, setIsCompact] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const outlineIndex = (() => {
    const parsed = Number(outline)
    if (!Number.isFinite(parsed)) return 1
    if (parsed < 1) return 1
    return Math.trunc(parsed)
  })()

  const [localOutlines, setLocalOutlines] = useState<ReadonlyArray<OutlineItem>>(() => outlines.slice())
  const [localStoryMetadata, setLocalStoryMetadata] = useState<Record<string, unknown>>(() => (storyMetadata ?? {}) as Record<string, unknown>)

  useEffect(() => {
    setLocalOutlines(outlines.slice())
  }, [outlines])

  useEffect(() => {
    setLocalStoryMetadata(((storyMetadata ?? {}) as Record<string, unknown>) ?? {})
  }, [storyMetadata])

  useEffect(() => {
    const query = window.matchMedia("(max-width: 1023px)")
    const sync = () => setIsCompact(query.matches)
    sync()
    query.addEventListener("change", sync)
    return () => query.removeEventListener("change", sync)
  }, [])

  useEffect(() => {
    if (!isCompact) setChatOpen(false)
  }, [isCompact])

  const activeOutline = localOutlines.find((o) => o.sequence === outlineIndex) ?? localOutlines[0] ?? null

  const initialPreviewMode = useMemo(() => {
    const v = typeof view === "string" ? view.trim().toLowerCase() : ""
    const hasScriptBody = Boolean((storyMetadata as any)?.shortDrama?.scriptBody)
    if (v === "body" || v === "rewrite" || v === "outline") return v as "body" | "rewrite" | "outline"
    if (v === "original") return "outline"
    return hasScriptBody ? "body" : "outline"
  }, [storyMetadata, view])

  const activeDraft = useMemo(() => {
    if (!activeOutline) return null
    const drafts = Array.isArray(activeOutline.outlineDrafts) ? activeOutline.outlineDrafts : []
    const activeId = (activeOutline.activeOutlineDraftId ?? "").trim()
    if (activeId) return drafts.find((d) => d.id === activeId) ?? drafts[drafts.length - 1] ?? null
    return drafts[drafts.length - 1] ?? null
  }, [activeOutline])

  const {
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
  } = useOutlineActions({ outlines: localOutlines, setLocalOutlines, setLocalStoryMetadata })

  const {
    rewriteRequirements,
    setRewriteRequirements,
    rewriteBySeq,
    rewriteMessages,
    previewMode,
    setPreviewMode,
    handleRewrite,
    isRewriteStreaming,
    activeRewrite,
    threadRef,
    shouldAutoScrollRef
  } = useScriptRewrite({ storyId, activeOutline, persistOutlineDraft, setToast, initialPreviewMode })

  const hasPersistedRewrite = Boolean(activeDraft?.content?.trim())
  const canShowRewrite = Boolean(
    hasPersistedRewrite || (activeRewrite && (activeRewrite.status === "streaming" || activeRewrite.status === "done"))
  )

  const [generatingStoryboard, setGeneratingStoryboard] = useState(false)
  const [generatingScriptBody, setGeneratingScriptBody] = useState(false)

  const replaceViewInUrl = useCallback(
    (nextView: "outline" | "rewrite" | "body") => {
      try {
        const qs = new URLSearchParams(window.location.search)
        qs.set("view", nextView)
        router.replace(`${window.location.pathname}?${qs.toString()}`)
      } catch {
        return
      }
    },
    [router]
  )

  const setPreviewModeWithUrl = useCallback(
    (next: "outline" | "rewrite" | "body") => {
      setPreviewMode(next)
      replaceViewInUrl(next)
    },
    [replaceViewInUrl, setPreviewMode]
  )

  useEffect(() => {
    if (typeof view === "string" && view.trim()) return
    replaceViewInUrl(initialPreviewMode)
  }, [initialPreviewMode, replaceViewInUrl, view])

  const handleGenerateStoryboardText = useCallback(async () => {
    if (!activeOutline) return
    if (generatingStoryboard) return
    setGeneratingStoryboard(true)
    try {
      const outlineId = activeOutline.outlineId
      router.push(
        `/video?tab=list&storyId=${encodeURIComponent(storyId)}&outlineId=${encodeURIComponent(outlineId)}&autoGenerate=true`
      )
    } catch (e) {
      const anyErr = e as { message?: string }
      setToast({ type: "error", message: anyErr?.message ?? "生成失败，请稍后重试" })
    } finally {
      setGeneratingStoryboard(false)
    }
  }, [activeOutline, generatingStoryboard, router, storyId, setToast])

  const handleManualGenerate = useCallback(() => {
    if (!activeOutline) return
    router.push(`/video?tab=list&storyId=${encodeURIComponent(storyId)}&autoGenerate=script`)
  }, [activeOutline, router, storyId])

  const scriptBody = useMemo(() => {
    const shortDrama = (localStoryMetadata as any)?.shortDrama
    if (!shortDrama || typeof shortDrama !== "object") return null
    const v = (shortDrama as any).scriptBody
    return v ?? null
  }, [localStoryMetadata])

  const scriptBodyInput = useMemo(() => {
    const normalizeLine = (line: string) => line.replace(/[\u200B-\u200D\uFEFF]/g, "").trim()
    const isEpisodeLine = (l: string) => /^第\s*\d+\s*集/u.test(l)
    const pickObject = (v: unknown): Record<string, unknown> | null => {
      if (!v || typeof v !== "object" || Array.isArray(v)) return null
      return v as Record<string, unknown>
    }
    const normalizeOutlineJson = (v: unknown): Record<string, unknown> | null => {
      const obj = pickObject(v)
      if (!obj) return null
      const nested = pickObject((obj as any).outline_json)
      return nested ?? obj
    }
    const stageKeyFromName = (name: string) => {
      const n = name.trim()
      if (!n) return ""
      const map: Array<[string, string]> = [
        ["起", "qi"],
        ["困", "kun"],
        ["升", "sheng"],
        ["反", "fan"],
        ["合", "he"],
        ["结", "jie"]
      ]
      for (const [ch, key] of map) {
        if (n.includes(ch)) return key
      }
      return ""
    }

    const buildOutlineJsonFromOutlines = (): Record<string, unknown> | null => {
      if (!localOutlines.length) return null

      const parse = (text: string) => {
        const lines = text.replaceAll("\r\n", "\n").split("\n").map(normalizeLine).filter(Boolean)
        const pick = (key: string) => {
          const line = lines.find((l) => l.startsWith(`${key}：`) || l.startsWith(`${key}:`))
          if (!line) return ""
          return line.replace(/^.*[:：]\s*/u, "").trim()
        }
        const stageRaw = pick("阶段")
        const stageGoal = pick("阶段目标")
        const stageRangeMatch = stageRaw.match(/（([^）]+)）/u)
        const episodeRange = stageRangeMatch?.[1]?.trim() ?? ""
        const stageName = stageRaw.replace(/（[^）]+）/u, "").trim()

        const episodeIdx = lines.findIndex((l) => isEpisodeLine(l))
        const episodeNum = (() => {
          if (episodeIdx < 0) return null
          const m = lines[episodeIdx]?.match(/\d+/u)
          if (!m?.[0]) return null
          const n = Number(m[0])
          return Number.isFinite(n) ? Math.trunc(n) : null
        })()
        const corePlot = episodeIdx >= 0 ? lines.slice(episodeIdx + 1).join("\n").trim() : ""
        return {
          scriptName: pick("剧名"),
          theme: pick("主题"),
          coreConflict: pick("核心冲突"),
          stageName,
          episodeRange,
          stageGoal,
          episodeNum,
          corePlot
        }
      }

      const parsed = localOutlines.map((o) => {
        const base = parse(o.originalText || "")
        const fallbackPlot = (o.originalText || o.outlineText || "").trim()
        return {
          sequence: o.sequence,
          ...base,
          episodeNum: base.episodeNum ?? o.sequence,
          corePlot: base.corePlot || fallbackPlot
        }
      })

      const metaFrom = parsed.find((p) => p.scriptName || p.theme || p.coreConflict) ?? null
      const outline_meta = {
        script_name: metaFrom?.scriptName || storyId,
        total_episodes: Math.max(...parsed.map((p) => p.episodeNum ?? p.sequence), 0),
        theme: metaFrom?.theme || "",
        core_conflict: metaFrom?.coreConflict || ""
      }

      const six_stage_outline: Record<string, unknown> = {}
      const stageOrder: string[] = []
      for (const item of parsed) {
        const name = item.stageName || "阶段"
        const key = stageKeyFromName(name) || (() => `stage_${stageOrder.length + 1}`)()
        if (!six_stage_outline[key]) {
          stageOrder.push(key)
          six_stage_outline[key] = {
            stage_name: name,
            episode_range: item.episodeRange || "",
            core_goal: item.stageGoal || "",
            episodes: [] as Array<{ episode: number; core_plot: string }>
          }
        }
        const stageObj = six_stage_outline[key] as any
        const list = Array.isArray(stageObj.episodes) ? stageObj.episodes : []
        stageObj.episodes = list
        list.push({ episode: item.episodeNum ?? item.sequence, core_plot: item.corePlot })
      }

      return { outline_meta, six_stage_outline }
    }

    const shortDrama = (localStoryMetadata as any)?.shortDrama
    if (!shortDrama || typeof shortDrama !== "object") return null
    const candidate = normalizeOutlineJson((shortDrama as any).outlineJson)
    const hasSixStage = Boolean(candidate && pickObject(candidate) && pickObject((candidate as any).six_stage_outline))
    return {
      planning_result: (shortDrama as any).planningResult ?? null,
      world_setting: (shortDrama as any).worldSetting ?? null,
      character_settings: (shortDrama as any).characterSetting ?? null,
      outline_json: (hasSixStage ? candidate : buildOutlineJsonFromOutlines()) ?? null
    }
  }, [localOutlines, localStoryMetadata, storyId])

  const handleGenerateScriptBody = useCallback(async () => {
    if (!activeOutline) return
    if (generatingScriptBody) return
    setGeneratingScriptBody(true)
    try {
      const res = await fetch("/api/coze/storyboard/generate-script-body", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ storyId, ...scriptBodyInput })
      })
      const json = (await res.json().catch(() => null)) as ApiOk<any> | ApiErr | null
      if (!res.ok || !json || (json as ApiErr).ok === false) {
        const errJson = (json as ApiErr | null) ?? null
        const trace = errJson?.traceId ? `（traceId: ${errJson.traceId}）` : ""
        throw new Error(`${errJson?.error?.message ?? "生成正文失败，请稍后重试"}${trace}`)
      }
      const script_body = (json as ApiOk<any>).data?.script_body ?? null
      setLocalStoryMetadata((prev) => {
        const base = prev && typeof prev === "object" ? prev : {}
        const shortDramaPrev = (base as any).shortDrama
        const shortDramaObj = shortDramaPrev && typeof shortDramaPrev === "object" ? shortDramaPrev : {}
        return {
          ...base,
          shortDrama: {
            ...shortDramaObj,
            scriptBody: script_body,
            scriptBodyGeneratedAt: Date.now()
          }
        }
      })
      setPreviewModeWithUrl("body")
      router.refresh()
      setToast({ type: "success", message: "剧本正文已生成" })
    } catch (e) {
      const anyErr = e as { message?: string }
      setToast({ type: "error", message: anyErr?.message ?? "生成正文失败，请稍后重试" })
    } finally {
      setGeneratingScriptBody(false)
    }
  }, [activeOutline, generatingScriptBody, router, scriptBodyInput, setPreviewModeWithUrl, setToast, storyId])

  return (
    <main className={styles.main}>
      <section className={styles.gridFrame}>
        <div className={isCompact ? `${styles.grid} ${styles.gridCompact}` : styles.grid} ref={gridRef}>
          <OutlineNav
            outlines={localOutlines}
            activeOutline={activeOutline}
            rewriteBySeq={rewriteBySeq}
            storyId={storyId}
            mode={mode}
            deleting={deleting}
            selectedOutlineIds={selectedOutlineIds}
            toggleSelected={toggleSelected}
            clearSelection={clearSelection}
            selectAll={selectAll}
            setConfirmDeleteOutlineIds={(ids) => setConfirmDeleteOutlineIds(ids)}
          />

          <PreviewPanel
            activeOutline={activeOutline}
            previewMode={previewMode}
            setPreviewMode={setPreviewModeWithUrl}
            canShowRewrite={canShowRewrite}
            activeRewrite={activeRewrite}
            activeDraft={activeDraft}
            generatingStoryboard={generatingStoryboard}
            handleGenerateStoryboardText={handleGenerateStoryboardText}
            handleManualGenerate={handleManualGenerate}
            storyId={storyId}
            scriptBody={scriptBody}
            scriptBodyInput={scriptBodyInput}
            generatingScriptBody={generatingScriptBody}
            handleGenerateScriptBody={handleGenerateScriptBody}
          />

          {!isCompact ? <WorkspaceResizeHandle containerRef={gridRef} /> : null}

          {!isCompact ? (
            <ChatSidebar
              rewriteMessages={rewriteMessages}
              rewriteRequirements={rewriteRequirements}
              setRewriteRequirements={setRewriteRequirements}
              handleRewrite={handleRewrite}
              activeOutline={activeOutline}
              isRewriteStreaming={isRewriteStreaming}
              toast={toast}
              threadRef={threadRef}
              onScrollThread={() => {
                const el = threadRef.current
                if (!el) return
                const threshold = 24
                const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - threshold
                shouldAutoScrollRef.current = atBottom
              }}
            />
          ) : (
            <div className={styles.chatPlaceholder} aria-hidden="true" />
          )}
        </div>
      </section>

      {isCompact ? (
        <>
          <button type="button" className={styles.chatFab} onClick={() => setChatOpen(true)}>
            对话
          </button>
          {chatOpen ? (
            <div
              className={styles.drawerBackdrop}
              role="dialog"
              aria-modal="true"
              aria-label="对话助手"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) setChatOpen(false)
              }}
            >
              <div className={`${styles.drawer} ${styles.drawerRight}`}>
                <ChatSidebar
                  variant="drawer"
                  onClose={() => setChatOpen(false)}
                  rewriteMessages={rewriteMessages}
                  rewriteRequirements={rewriteRequirements}
                  setRewriteRequirements={setRewriteRequirements}
                  handleRewrite={handleRewrite}
                  activeOutline={activeOutline}
                  isRewriteStreaming={isRewriteStreaming}
                  toast={toast}
                  threadRef={threadRef}
                  onScrollThread={() => {
                    const el = threadRef.current
                    if (!el) return
                    const threshold = 24
                    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - threshold
                    shouldAutoScrollRef.current = atBottom
                  }}
                />
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {confirmDeleteOutlineIds && confirmDeleteOutlineIds.length > 0 ? (
        <div
          className={styles.modalOverlay}
          role="dialog"
          aria-modal="true"
          aria-label="确认删除"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setConfirmDeleteOutlineIds(null)
          }}
        >
          <div className={styles.modal}>
            <div className={styles.modalTitle}>
              {confirmDeleteOutlineIds.length === 1 ? "删除该章节？" : `删除这 ${confirmDeleteOutlineIds.length} 个章节？`}
            </div>
            <div className={styles.modalDesc}>将同时删除该章节的原文与分镜数据，且无法恢复。</div>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.modalButton}
                onClick={() => setConfirmDeleteOutlineIds(null)}
                disabled={deleting}
              >
                取消
              </button>
              <button
                type="button"
                className={`${styles.modalButton} ${styles.modalButtonDanger}`}
                onClick={() => {
                  const ids = confirmDeleteOutlineIds
                  setConfirmDeleteOutlineIds(null)
                  if (ids.length === 1) void handleDeleteOutline(ids[0]!)
                  else void handleBatchDeleteOutlines(ids)
                }}
                disabled={deleting}
              >
                删除
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}
