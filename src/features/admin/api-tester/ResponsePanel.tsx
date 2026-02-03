import type { ReactElement } from "react"
import styles from "./ApiTesterPage.module.css"
import type { RequestDraft, ResponseState } from "./types"

export function ResponsePanel({ draft, resp }: { draft: RequestDraft; resp: ResponseState }): ReactElement {
  return (
    <section className={styles.panel} aria-label="响应查看器">
      <div className={styles.panelHeader}>
        <div className={styles.panelTitle}>响应</div>
        <div className={styles.statusRow}>
          {resp.status !== null ? <span className={styles.status}>{resp.status}</span> : <span className={styles.statusMuted}>—</span>}
          {resp.timeMs !== null ? <span className={styles.time}>{resp.timeMs}ms</span> : <span className={styles.time}> </span>}
        </div>
      </div>

      {resp.error ? <div className={styles.error}>{resp.error}</div> : null}

      {draft.stream ? (
        <div className={styles.streamBox} aria-label="事件流">
          {resp.streamEvents.length > 0 ? (
            resp.streamEvents.map((l, i) => (
              <div key={`${i}-${l}`} className={styles.streamLine}>
                {l}
              </div>
            ))
          ) : (
            <div className={styles.empty}>暂无事件</div>
          )}
        </div>
      ) : (
        <div className={styles.resTabs}>
          <details open className={styles.details}>
            <summary className={styles.summary}>Body</summary>
            <pre className={styles.pre}>{resp.bodyJson ? JSON.stringify(resp.bodyJson, null, 2) : resp.bodyText || ""}</pre>
          </details>
          <details className={styles.details}>
            <summary className={styles.summary}>Headers</summary>
            <pre className={styles.pre}>{JSON.stringify(resp.headers, null, 2)}</pre>
          </details>
        </div>
      )}
    </section>
  )
}

