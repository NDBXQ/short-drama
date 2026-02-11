
"use client"

import { useCallback, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import styles from "./PreviewPanel.module.css"
import type { RewriteState, OutlineItem } from "../utils"
import { deriveLiveRewrite } from "../utils"

type PreviewPanelProps = Readonly<{
  activeOutline: OutlineItem | null
  previewMode: "original" | "rewrite"
  setPreviewMode: (mode: "original" | "rewrite") => void
  canShowRewrite: boolean
  activeRewrite: RewriteState | undefined
  activeDraft: { content: string } | null
  generatingStoryboard: boolean
  handleGenerateStoryboardText: () => void
  handleManualGenerate: () => void
  storyId: string
}>

/**
 * 中间预览区组件
 * @param {PreviewPanelProps} props - 组件属性
 * @returns {JSX.Element} 组件内容
 */
export function PreviewPanel({
  activeOutline,
  previewMode,
  setPreviewMode,
  canShowRewrite,
  activeRewrite,
  activeDraft,
  generatingStoryboard,
  handleGenerateStoryboardText,
  handleManualGenerate,
  storyId
}: PreviewPanelProps) {
  const router = useRouter()
  const activeSequence = activeOutline?.sequence ?? null
  const [summaryOpenSequence, setSummaryOpenSequence] = useState<number | null>(null)
  const summaryOpen = summaryOpenSequence !== null && summaryOpenSequence === activeSequence
  const normalizeLine = useCallback((line: string) => line.replace(/[\u200B-\u200D\uFEFF]/g, "").trim(), [])

  const openShortDrama = useCallback(() => {
    const next = (() => {
      try {
        return `${window.location.pathname}${window.location.search}`
      } catch {
        return ""
      }
    })()
    const qs = next ? `?next=${encodeURIComponent(next)}` : ""
    router.push(`/script/short-drama/${encodeURIComponent(storyId)}${qs}`)
  }, [router, storyId])

  const parsedOriginal = useMemo(() => {
    const originalText = activeOutline?.originalText ?? ""
    if (!originalText.trim()) return { summary: null as null | Record<string, string>, episodeText: "" }
    const lines = originalText.replaceAll("\r\n", "\n").split("\n").map(normalizeLine)
    const isEpisodeLine = (l: string) => /^第\s*\d+\s*集/u.test(l)
    const headerKey = (l: string) => /^(剧名|主题|核心冲突|阶段|阶段目标)[:：]/u.test(l)
    const startIdx = lines.findIndex((l) => isEpisodeLine(l))
    const headerLines = startIdx >= 0 ? lines.slice(0, startIdx).filter(Boolean) : lines.filter(headerKey)
    const episodeLines =
      startIdx >= 0 ? lines.slice(startIdx + 1).filter(Boolean) : lines.filter((l) => !headerKey(l)).filter(Boolean)

    const pick = (key: string) => {
      const line = headerLines.find((l) => l.startsWith(`${key}：`) || l.startsWith(`${key}:`))
      if (!line) return ""
      return line.replace(/^.*[:：]\s*/u, "").trim()
    }

    const scriptName = pick("剧名")
    const theme = pick("主题")
    const conflict = pick("核心冲突")
    const stage = pick("阶段")
    const stageGoal = pick("阶段目标")

    const summary = (() => {
      const obj: Record<string, string> = {}
      if (scriptName) obj.scriptName = scriptName
      if (theme) obj.theme = theme
      if (conflict) obj.conflict = conflict
      if (stage) obj.stage = stage
      if (stageGoal) obj.stageGoal = stageGoal
      return Object.keys(obj).length ? obj : null
    })()

    const episodeText = episodeLines.join("\n").trim()
    return { summary, episodeText }
  }, [activeOutline?.originalText, normalizeLine])

  return (
    <section className={styles.preview}>
      <div className={styles.previewHeader}>
        <div className={styles.previewTitle}>{activeOutline ? `剧本大纲 ${activeOutline.sequence}` : "暂无大纲"}</div>
        <div className={styles.previewActions}>
          {activeOutline ? (
            <>
              <button
                type="button"
                className={previewMode === "original" ? `${styles.toggleButton} ${styles.toggleButtonActive}` : styles.toggleButton}
                onClick={() => setPreviewMode("original")}
              >
                原文
              </button>
              <button
                type="button"
                className={previewMode === "rewrite" ? `${styles.toggleButton} ${styles.toggleButtonActive}` : styles.toggleButton}
                disabled={!canShowRewrite}
                onClick={() => setPreviewMode("rewrite")}
              >
                改写
              </button>
            </>
          ) : null}
          <button
            type="button"
            className={styles.toggleButton}
            onClick={openShortDrama}
          >
            前置：短剧信息
          </button>
          <div className={styles.previewHint}>可在此查看生成内容</div>
        </div>
      </div>

      <article className={styles.markdown}>
        {parsedOriginal.summary ? (
          <section className={styles.storySummary} aria-label="故事摘要">
            <button
              type="button"
              className={styles.storySummaryHeader}
              onClick={() => setSummaryOpenSequence((prev) => (prev === activeSequence ? null : activeSequence))}
            >
              <div className={styles.storySummaryTitleRow}>
                <div className={styles.storySummaryTitle}>故事摘要</div>
                <div className={styles.storySummaryToggle}>{summaryOpen ? "收起" : "展开"}</div>
              </div>
              <div className={styles.storySummaryHint}>
                {parsedOriginal.summary.stage
                  ? parsedOriginal.summary.stage
                  : parsedOriginal.summary.scriptName
                  ? parsedOriginal.summary.scriptName
                  : "查看阶段 / 阶段目标"}
              </div>
              {!summaryOpen && parsedOriginal.summary.stageGoal ? (
                <div className={styles.storySummaryHintSecondary}>目标：{parsedOriginal.summary.stageGoal}</div>
              ) : null}
            </button>
            {summaryOpen ? (
              <div className={styles.storySummaryBody}>
                {parsedOriginal.summary.scriptName ? (
                  <div className={styles.summaryRow}>
                    <div className={styles.summaryKey}>剧名</div>
                    <div className={styles.summaryVal}>{parsedOriginal.summary.scriptName}</div>
                  </div>
                ) : null}
                {parsedOriginal.summary.theme ? (
                  <div className={styles.summaryRow}>
                    <div className={styles.summaryKey}>主题</div>
                    <div className={styles.summaryVal}>{parsedOriginal.summary.theme}</div>
                  </div>
                ) : null}
                {parsedOriginal.summary.conflict ? (
                  <div className={styles.summaryRow}>
                    <div className={styles.summaryKey}>核心冲突</div>
                    <div className={styles.summaryVal}>{parsedOriginal.summary.conflict}</div>
                  </div>
                ) : null}
                {parsedOriginal.summary.stage ? (
                  <div className={styles.summaryRow}>
                    <div className={styles.summaryKey}>阶段</div>
                    <div className={styles.summaryVal}>{parsedOriginal.summary.stage}</div>
                  </div>
                ) : null}
                {parsedOriginal.summary.stageGoal ? (
                  <div className={styles.summaryRow}>
                    <div className={styles.summaryKey}>阶段目标</div>
                    <div className={styles.summaryVal}>{parsedOriginal.summary.stageGoal}</div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>
        ) : null}
        {activeOutline ? (
          (() => {
            if (previewMode === "rewrite") {
              if (activeRewrite?.status === "streaming") {
                if (activeRewrite?.raw) {
                  const live = deriveLiveRewrite(activeRewrite.raw)
                  return <div className={styles.streamText}>{live.content ?? activeRewrite.raw}</div>
                }
                return <div className={styles.originalEmpty}>改写中…</div>
              }
              const content = activeDraft?.content?.trim() || activeRewrite?.result?.new_content?.trim() || ""
              return content ? <div className={styles.streamText}>{content}</div> : <div className={styles.originalEmpty}>暂无改写内容</div>
            }
            const baseText = (parsedOriginal.episodeText || activeOutline.originalText).replaceAll("\r\n", "\n")
            const text = baseText.replace(/^第\s*\d+\s*集\s*\n?/u, "")
            return <div className={styles.originalText}>{text}</div>
          })()
        ) : (
          <div className={styles.originalEmpty}>暂无可展示内容</div>
        )}
      </article>

      <div className={styles.nextStep}>
        <div className={styles.nextStepCard}>
          <div className={styles.nextStepText}>
            <div className={styles.nextStepTitle}>下一步：生成分镜文本</div>
            <div className={styles.nextStepDesc}>基于当前大纲生成更细的场景描述与镜头文本，准备进入视频创作。</div>
          </div>
          <div className={styles.nextStepAction}>
            <button
              type="button"
              className={styles.nextStepButton}
              onClick={handleGenerateStoryboardText}
              disabled={!activeOutline || generatingStoryboard}
            >
              {generatingStoryboard ? "生成中…" : "一键生成"}
            </button>
            <button
              type="button"
              className={styles.nextStepButtonSecondary}
              onClick={handleManualGenerate}
              disabled={!activeOutline || generatingStoryboard}
            >
              手动生成
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
