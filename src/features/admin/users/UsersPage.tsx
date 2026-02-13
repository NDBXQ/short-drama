"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactElement } from "react"
import styles from "./UsersPage.module.css"

type ApiOk<T> = { ok: true; data: T; traceId: string }
type ApiErr = { ok: false; error: { code: string; message: string }; traceId: string }

type UserListItem = {
  id: string
  account: string
  email: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string | null
  roleKey: string
  lastLoginAt: string | null
}

type ListResult = ApiOk<{ items: UserListItem[]; limit: number; offset: number }> | ApiErr
type CreateResult = ApiOk<{ user: { id: string; account: string } }> | ApiErr

function fmtTime(v: string | null): string {
  if (!v) return "-"
  const d = new Date(v)
  if (!Number.isFinite(d.getTime())) return v
  return d.toLocaleString()
}

export function UsersPage(): ReactElement {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<UserListItem[]>([])

  const [q, setQ] = useState("")
  const [status, setStatus] = useState<"" | "active" | "inactive">("")
  const [role, setRole] = useState("")
  const [sort, setSort] = useState<"createdAt" | "lastLoginAt">("createdAt")

  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createAccount, setCreateAccount] = useState("")
  const [createEmail, setCreateEmail] = useState("")
  const [createPassword, setCreatePassword] = useState("")
  const [createRoleKey, setCreateRoleKey] = useState("user")

  const queryString = useMemo(() => {
    const sp = new URLSearchParams()
    if (q.trim()) sp.set("q", q.trim())
    if (status) sp.set("status", status)
    if (role.trim()) sp.set("role", role.trim())
    sp.set("sort", sort)
    sp.set("order", "desc")
    sp.set("limit", "50")
    sp.set("offset", "0")
    return sp.toString()
  }, [q, role, sort, status])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/users?${queryString}`, { method: "GET" })
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

  const onCreate = useCallback(
    async (e: FormEvent) => {
      e.preventDefault()
      if (creating) return
      setCreating(true)
      setError(null)
      try {
        const res = await fetch("/api/admin/users", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            account: createAccount.trim(),
            email: createEmail.trim() || undefined,
            password: createPassword,
            roleKey: createRoleKey.trim()
          })
        })
        const json = (await res.json()) as CreateResult
        if (!json.ok) throw new Error(json.error.message)
        setCreateOpen(false)
        setCreateAccount("")
        setCreateEmail("")
        setCreatePassword("")
        setCreateRoleKey("user")
        await load()
      } catch (e2) {
        const anyErr = e2 as { message?: string }
        setError(anyErr?.message ?? "创建失败")
      } finally {
        setCreating(false)
      }
    },
    [createAccount, createEmail, createPassword, createRoleKey, creating, load]
  )

  return (
    <main className={styles.page}>
      <div className={styles.topBar}>
        <div className={styles.topLeft}>
          <div className={styles.topTitle}>账号管理</div>
          <div className={styles.topMeta}>{loading ? "加载中…" : `${items.length} 个账号`}</div>
        </div>
        <div className={styles.topActions}>
          <button type="button" className={styles.topBtn} onClick={() => void load()} disabled={loading || creating}>
            刷新
          </button>
          <button type="button" className={styles.topBtnPrimary} onClick={() => setCreateOpen(true)} disabled={loading || creating}>
            新建账号
          </button>
        </div>
      </div>

      {error ? <div className={styles.error}>{error}</div> : null}

      <section className={styles.panel} aria-label="筛选">
        <div className={styles.filters}>
          <input className={styles.input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索账号 / 邮箱 / ID" />
          <select className={styles.select} value={status} onChange={(e) => setStatus(e.target.value as any)} aria-label="状态筛选">
            <option value="">全部状态</option>
            <option value="active">启用</option>
            <option value="inactive">禁用</option>
          </select>
          <input className={styles.input} value={role} onChange={(e) => setRole(e.target.value)} placeholder="角色（roleKey）" />
          <select className={styles.select} value={sort} onChange={(e) => setSort(e.target.value as any)} aria-label="排序">
            <option value="createdAt">按创建时间</option>
            <option value="lastLoginAt">按最近登录</option>
          </select>
          <button type="button" className={styles.topBtn} onClick={() => void load()} disabled={loading}>
            应用
          </button>
        </div>
      </section>

      <section className={styles.panel} aria-label="账号列表">
        <div className={styles.table}>
          <div className={`${styles.tr} ${styles.th}`}>
            <div>账号</div>
            <div>邮箱</div>
            <div>状态</div>
            <div>角色</div>
            <div>最近登录</div>
            <div>创建时间</div>
          </div>
          {items.map((u) => (
            <Link key={u.id} className={`${styles.tr} ${styles.row}`} href={`/admin/users/${encodeURIComponent(u.id)}`}>
              <div className={styles.mono}>{u.account}</div>
              <div className={styles.muted}>{u.email ?? "-"}</div>
              <div className={u.isActive ? styles.ok : styles.bad}>{u.isActive ? "启用" : "禁用"}</div>
              <div className={styles.mono}>{u.roleKey}</div>
              <div className={styles.muted}>{fmtTime(u.lastLoginAt)}</div>
              <div className={styles.muted}>{fmtTime(u.createdAt)}</div>
            </Link>
          ))}
          {items.length === 0 && !loading ? <div className={styles.empty}>暂无账号</div> : null}
        </div>
      </section>

      {createOpen ? (
        <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="新建账号" onMouseDown={() => setCreateOpen(false)}>
          <div className={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitle}>新建账号</div>
              <button type="button" className={styles.modalClose} onClick={() => setCreateOpen(false)} aria-label="关闭">
                ×
              </button>
            </div>
            <form className={styles.modalBody} onSubmit={onCreate}>
              <label className={styles.field}>
                <div className={styles.label}>账号</div>
                <input className={styles.input} value={createAccount} onChange={(e) => setCreateAccount(e.target.value)} required />
              </label>
              <label className={styles.field}>
                <div className={styles.label}>邮箱（可选）</div>
                <input className={styles.input} value={createEmail} onChange={(e) => setCreateEmail(e.target.value)} />
              </label>
              <label className={styles.field}>
                <div className={styles.label}>初始密码</div>
                <input className={styles.input} value={createPassword} onChange={(e) => setCreatePassword(e.target.value)} type="password" required />
              </label>
              <label className={styles.field}>
                <div className={styles.label}>角色（roleKey）</div>
                <input className={styles.input} value={createRoleKey} onChange={(e) => setCreateRoleKey(e.target.value)} />
              </label>
              <div className={styles.modalActions}>
                <button type="button" className={styles.topBtn} onClick={() => setCreateOpen(false)} disabled={creating}>
                  取消
                </button>
                <button type="submit" className={styles.topBtnPrimary} disabled={creating}>
                  {creating ? "创建中…" : "创建"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </main>
  )
}

