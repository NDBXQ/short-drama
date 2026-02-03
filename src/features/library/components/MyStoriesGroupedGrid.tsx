"use client"

import type { ReactElement } from "react"
import { LibraryGrid } from "./LibraryGrid"
import type { LibraryItem } from "./LibraryCard"
import styles from "./MyStoriesGroupedGrid.module.css"

interface MyStoriesGroupedGridProps {
  items: LibraryItem[]
  view: "grid" | "list"
  onItemClick?: (item: LibraryItem) => void
  onViewContent?: (item: LibraryItem) => void
  selectedIds?: Set<string>
  onToggleSelected?: (id: string) => void
  emptyStandardText?: string
  emptyTvcText?: string
  onCreateTvc?: () => void
  showStandard?: boolean
  showTvc?: boolean
}

function Group({
  title,
  items,
  view,
  onItemClick,
  onViewContent,
  selectedIds,
  onToggleSelected,
  emptyText,
  actionLabel,
  onAction,
}: {
  title: string
  items: LibraryItem[]
  view: "grid" | "list"
  onItemClick?: (item: LibraryItem) => void
  onViewContent?: (item: LibraryItem) => void
  selectedIds?: Set<string>
  onToggleSelected?: (id: string) => void
  emptyText?: string
  actionLabel?: string
  onAction?: () => void
}): ReactElement {
  return (
    <div className={styles.group}>
      <div className={styles.groupHeader}>
        <div className={styles.groupTitle}>{title}</div>
        <div className={styles.groupMeta}>{items.length}</div>
      </div>
      <div className={styles.divider} />
      {items.length > 0 ? (
        <LibraryGrid
          items={items}
          view={view}
          onItemClick={onItemClick}
          onViewContent={onViewContent}
          selectedIds={selectedIds}
          onToggleSelected={onToggleSelected}
        />
      ) : (
        <div className={styles.emptyInGroup}>
          <div>{emptyText ?? "暂无内容"}</div>
          {actionLabel && onAction ? (
            <button type="button" className={styles.actionBtn} onClick={onAction}>
              {actionLabel}
            </button>
          ) : null}
        </div>
      )}
    </div>
  )
}

export function MyStoriesGroupedGrid({
  items,
  view,
  onItemClick,
  onViewContent,
  selectedIds,
  onToggleSelected,
  emptyStandardText,
  emptyTvcText,
  onCreateTvc,
  showStandard = true,
  showTvc = true,
}: MyStoriesGroupedGridProps): ReactElement {
  const standardItems = items.filter((i) => i.type !== "tvc")
  const tvcItems = items.filter((i) => i.type === "tvc")

  return (
    <div className={styles.wrap}>
      {showStandard ? (
        <Group
          title="标准视频生成"
          items={standardItems}
          view={view}
          onItemClick={onItemClick}
          onViewContent={onViewContent}
          selectedIds={selectedIds}
          onToggleSelected={onToggleSelected}
          emptyText={emptyStandardText ?? "暂无标准视频项目"}
        />
      ) : null}
      {showTvc ? (
        <Group
          title="TVC 视频生成"
          items={tvcItems}
          view={view}
          onItemClick={onItemClick}
          onViewContent={onViewContent}
          selectedIds={selectedIds}
          onToggleSelected={onToggleSelected}
          emptyText={emptyTvcText ?? "暂无 TVC 项目"}
          actionLabel={onCreateTvc ? "去创建" : undefined}
          onAction={onCreateTvc}
        />
      ) : null}
    </div>
  )
}
