import type { ReactElement } from "react"
import styles from "./ApiTesterPage.module.css"
import type { SavedRequest } from "./types"

export function HistoryModal({
  open,
  history,
  onClose,
  onPick
}: {
  open: boolean
  history: SavedRequest[]
  onClose: () => void
  onPick: (h: SavedRequest) => void
}): ReactElement | null {
  if (!open) return null

  return (
    <div className={styles.historyOverlay} role="dialog" aria-modal="true" aria-label="请求历史" onClick={onClose}>
      <div className={styles.historyPanel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.historyHeader}>
          <div className={styles.historyTitle}>历史</div>
          <button type="button" className={styles.historyClose} onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>
        <div className={styles.historyList}>
          {history.length > 0 ? (
            history.map((h) => (
              <button type="button" key={h.id} className={styles.historyItem} onClick={() => onPick(h)} title={h.url}>
                <span className={styles.historyMethod}>{h.method}</span>
                <span className={styles.historyUrl}>{h.url}</span>
              </button>
            ))
          ) : (
            <div className={styles.empty}>暂无历史</div>
          )}
        </div>
      </div>
    </div>
  )
}

