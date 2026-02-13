"use client"

import { useSearchParams } from "next/navigation"
import { useCallback, useEffect, useMemo, useState, type ReactElement } from "react"
import styles from "./AuditLogsPage.module.css"

type ApiOk<T> = { ok: true; data: T; traceId: string }
type ApiErr = { ok: false; error: { code: string; message: string }; traceId: string }

type AuditItem = {
  id: string
  createdAt: string
  actorUserId: string | null
  action: string
  targetType: string
  targetId: string | null
  targetUserId: string | null
  before: Record<string, unknown>
  after: Record<string, unknown>
  ip: string | null
  userAgent: string | null
  traceId: string | null
}

type ListResult = ApiOk<{ items: AuditItem[]; limit: number; offset: number }> | ApiErr

function fmtTime(v: string): string {
  const d = new Date(v)
  if (!Number.isFinite(d.getTime())) return v
  return d.toLocaleString()
}

export function AuditLogsPage(): ReactElement {
  const sp = useSearchParams()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<AuditItem[]>([])

  const [actorUserId, setActorUserId] = useState("")
  const [targetId, setTargetId] = useState("")
  const [action, setAction] = useState("")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")

  useEffect(() => {
    const t = (sp?.get("targetId") ?? "").trim()
    if (t) setTargetId(t)
  }, [sp])

  const queryString = useMemo(() => {
    const q = new URLSearchParams()
    if (actorUserId.trim()) q.set("actorUserId", actorUserId.trim())
    if (targetId.trim()) q.set("targetId", targetId.trim())
    if (action.trim()) q.set("action", action.trim())
    if (from.trim()) q.set("from", from.trim())
    if (to.trim()) q.set("to", to.trim())
    q.set("limit", "100")
    q.set("offset", "0")
    return q.toString()
  }, [action, actorUserId, from, targetId, to])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/audit?${queryString}`, { method: "GET" })
      const json = (await res.json()) as ListResult
      if (!json.ok) throw new Error(json.error.message)
      setItems(json.data.items ?? [])
    } catch (e) {
      const anyErr = e as { message?: string }
      setError(anyErr?.message ?? "加载失败")
    } finally {
      setLoading(false)
    }
  }, [queryString])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <main className={styles.page}>
      <div className={styles.topBar}>
        <div className={styles.topLeft}>
          <div className={styles.topTitle}>审计日志</div>
          <div className={styles.topMeta}>{loading ? "加载中…" : `${items.length} 条记录`}</div>
        </div>
        <div className={styles.topActions}>
          <button type="button" className={styles.topBtn} onClick={() => void load()} disabled={loading}>
            刷新
          </button>
        </div>
      </div>

      {error ? <div className={styles.error}>{error}</div> : null}

      <section className={styles.panel} aria-label="筛选">
        <div className={styles.filters}>
          <input className={styles.input} value={actorUserId} onChange={(e) => setActorUserId(e.target.value)} placeholder="操作者 userId" />
          <input className={styles.input} value={targetId} onChange={(e) => setTargetId(e.target.value)} placeholder="目标 ID（用户ID）" />
          <input className={styles.input} value={action} onChange={(e) => setAction(e.target.value)} placeholder="动作（例如 user.disable）" />
          <input className={styles.input} value={from} onChange={(e) => setFrom(e.target.value)} placeholder="from (ISO 或 yyyy-mm-dd)" />
          <input className={styles.input} value={to} onChange={(e) => setTo(e.target.value)} placeholder="to (ISO 或 yyyy-mm-dd)" />
          <button type="button" className={styles.topBtn} onClick={() => void load()} disabled={loading}>
            应用
          </button>
        </div>
      </section>

      <section className={styles.panel} aria-label="日志列表">
        <div className={styles.list}>
          {items.map((it) => (
            <details key={it.id} className={styles.item}>
              <summary className={styles.summary}>
                <span className={styles.mono}>{fmtTime(it.createdAt)}</span>
                <span className={styles.action}>{it.action}</span>
                <span className={styles.muted}>target: {it.targetId ?? "-"}</span>
              </summary>
              <div className={styles.detailGrid}>
                <div className={styles.k}>操作者</div>
                <div className={styles.v}>{it.actorUserId ?? "-"}</div>
                <div className={styles.k}>IP</div>
                <div className={styles.v}>{it.ip ?? "-"}</div>
                <div className={styles.k}>traceId</div>
                <div className={styles.v}>{it.traceId ?? "-"}</div>
                <div className={styles.k}>before</div>
                <pre className={styles.pre}>{JSON.stringify(it.before ?? {}, null, 2)}</pre>
                <div className={styles.k}>after</div>
                <pre className={styles.pre}>{JSON.stringify(it.after ?? {}, null, 2)}</pre>
              </div>
            </details>
          ))}
          {items.length === 0 && !loading ? <div className={styles.empty}>暂无记录</div> : null}
        </div>
      </section>
    </main>
  )
}

