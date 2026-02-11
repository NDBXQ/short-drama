
"use client"

import Link from "next/link"
import { useMemo } from "react"
import styles from "./OutlineNav.module.css"
import type { ScriptWorkspaceMode, RewriteState, OutlineItem } from "../utils"
import { deriveLiveRewrite } from "../utils"

type OutlineNavProps = Readonly<{
  outlines: ReadonlyArray<OutlineItem>
  activeOutline: OutlineItem | null
  rewriteBySeq: Record<number, RewriteState>
  storyId: string
  mode: ScriptWorkspaceMode
  deletingOutlineId: string | null
  setConfirmDeleteOutlineId: (id: string) => void
}>

/**
 * 左侧大纲导航栏组件
 * @param {OutlineNavProps} props - 组件属性
 * @returns {JSX.Element} 组件内容
 */
export function OutlineNav({
  outlines,
  activeOutline,
  rewriteBySeq,
  storyId,
  mode,
  deletingOutlineId,
  setConfirmDeleteOutlineId
}: OutlineNavProps) {
  const normalizeLine = (line: string) => line.replace(/[\u200B-\u200D\uFEFF]/g, "").trim()
  const normalizeOneLine = (text: string) => normalizeLine((text ?? "").replaceAll("\r\n", "\n").replaceAll("\n", " "))
  const isGenericTitle = (text: string) => {
    const t = normalizeOneLine(text)
    if (!t) return true
    if (/^剧本大纲\s*\d+$/u.test(t)) return true
    if (/^(剧名|主题|核心冲突|阶段|阶段目标)[:：]/u.test(t)) return true
    return false
  }

  const extractEpisodeSnippet = (text: string) => {
    const lines = (text ?? "").replaceAll("\r\n", "\n").split("\n").map(normalizeLine).filter(Boolean)
    const idx = lines.findIndex((l) => /^第\s*\d+\s*集/u.test(l))
    if (idx >= 0) {
      const next = lines[idx + 1] ?? ""
      return next
    }
    const first = lines[0] ?? ""
    return /^(剧名|主题|核心冲突|阶段|阶段目标)[:：]/u.test(first) ? "" : first
  }

  const grouped = useMemo(() => {
    const stageOrder = ["起", "困", "升", "反", "爽", "合", "承", "转", "终", "…"]
    const stageRank = new Map(stageOrder.map((s, i) => [s, i]))
    const parseStage = (text: string): string => {
      const normalized = (text ?? "").replaceAll("\n", " ").trim()
      const m = normalized.match(/([起承转合困升反爽终])·/)
      return m?.[1] ?? "…"
    }

    const groups = new Map<string, OutlineItem[]>()
    for (const item of outlines) {
      const stage = parseStage(item.originalText ?? item.outlineText ?? "")
      const arr = groups.get(stage) ?? []
      arr.push(item)
      groups.set(stage, arr)
    }

    return Array.from(groups.entries())
      .sort((a, b) => {
        const ra = stageRank.get(a[0]) ?? 9_999
        const rb = stageRank.get(b[0]) ?? 9_999
        if (ra !== rb) return ra - rb
        return a[0].localeCompare(b[0], "zh-Hans-CN")
      })
      .map(([stage, items]) => ({ stage, items: items.slice().sort((x, y) => x.sequence - y.sequence) }))
  }, [outlines])

  return (
    <nav className={styles.outlineNav} aria-label="选择剧本大纲章节">
      <div className={styles.outlineNavHeader}>
        <div className={styles.outlineNavTitle}>大纲章节</div>
        <div className={styles.outlineNavHint}>选择后在右侧查看</div>
      </div>
      <div className={styles.outlineNavList}>
        {outlines.length === 0 ? <div className={styles.outlineNavEmpty}>暂无大纲</div> : null}
        {grouped.map((g) => (
          <section key={g.stage} className={styles.group} aria-label={`${g.stage} 段`}>
            <div className={styles.groupLabel}>{g.stage}</div>
            <div className={styles.groupItems}>
              {g.items.map((item) => {
                const isActive = item.sequence === activeOutline?.sequence
                const href = `/script/workspace/${encodeURIComponent(storyId)}?mode=${mode}&outline=${item.sequence}`
                const rewriteState = rewriteBySeq[item.sequence]
                const live = rewriteState?.raw ? deriveLiveRewrite(rewriteState.raw) : undefined
                const badgeText =
                  rewriteState?.status === "streaming"
                    ? "改写中"
                    : rewriteState?.status === "done"
                    ? "已改写"
                    : rewriteState?.status === "error"
                    ? "改写失败"
                    : item.activeOutlineDraftId
                    ? "已改写"
                    : null
                const badgeClass =
                  rewriteState?.status === "streaming"
                    ? `${styles.itemBadge} ${styles.badgeProcessing}`
                    : rewriteState?.status === "done"
                    ? `${styles.itemBadge} ${styles.badgeDone}`
                    : rewriteState?.status === "error"
                    ? `${styles.itemBadge} ${styles.badgeError}`
                    : styles.itemBadge
                const persistedDraftTitle = item.activeOutlineDraftId
                  ? item.outlineDrafts.find((d) => d.id === item.activeOutlineDraftId)?.title ?? null
                  : null
                const preferredTitle =
                  (!isGenericTitle(rewriteState?.result?.new_title ?? "") ? rewriteState?.result?.new_title : null) ??
                  (!isGenericTitle(live?.title ?? "") ? live?.title : null) ??
                  (!isGenericTitle(persistedDraftTitle ?? "") ? persistedDraftTitle : null) ??
                  null

                const snippet = extractEpisodeSnippet(item.originalText ?? item.outlineText ?? "")
                const displayTitle = normalizeOneLine(preferredTitle ?? snippet).slice(0, 22) || `第 ${item.sequence} 集`
                const aria = snippet ? `${displayTitle}：${snippet.slice(0, 60)}` : displayTitle
                return (
                  <div key={item.sequence} className={styles.itemWrap}>
                    <Link
                      href={href}
                      className={isActive ? styles.itemActive : styles.item}
                      aria-label={`剧本大纲 ${item.sequence}：${aria}`}
                      title={aria}
                    >
                      <div className={styles.itemNumPill}>{item.sequence}</div>
                      <div className={styles.itemTitle}>{displayTitle}</div>
                      {badgeText ? <span className={badgeClass}>{badgeText}</span> : null}
                    </Link>
                    <button
                      type="button"
                      className={styles.outlineNavRemove}
                      aria-label="删除该大纲章节"
                      title="删除"
                      disabled={Boolean(deletingOutlineId)}
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setConfirmDeleteOutlineId(item.outlineId)
                      }}
                    >
                      —
                    </button>
                  </div>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </nav>
  )
}
