"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState, type ReactElement } from "react"
import styles from "./UserDetailPage.module.css"

type ApiOk<T> = { ok: true; data: T; traceId: string }
type ApiErr = { ok: false; error: { code: string; message: string }; traceId: string }

type UserDetail = {
  id: string
  account: string
  email: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string | null
  security: {
    roleKey: string
    tokenVersion: number
    lastLoginAt: string | null
    passwordUpdatedAt: string | null
    failedLoginCount: number
    lockedUntil: string | null
    disabledAt: string | null
    disabledReason: string | null
  }
}

type GetResult = ApiOk<{ user: UserDetail }> | ApiErr
type PatchResult = ApiOk<{ user: { id: string; account: string; email: string | null; roleKey: string } }> | ApiErr
type ActionResult = ApiOk<{ ok: true }> | ApiErr

function fmtTime(v: string | null): string {
  if (!v) return "-"
  const d = new Date(v)
  if (!Number.isFinite(d.getTime())) return v
  return d.toLocaleString()
}

type ModalKind = null | "disable" | "enable" | "resetPassword" | "forceLogout"

export function UserDetailPage({ userId }: { userId: string }): ReactElement {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [user, setUser] = useState<UserDetail | null>(null)

  const [emailDraft, setEmailDraft] = useState("")
  const [roleDraft, setRoleDraft] = useState("")

  const [modal, setModal] = useState<ModalKind>(null)
  const [confirmAccount, setConfirmAccount] = useState("")
  const [reason, setReason] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [acting, setActing] = useState(false)

  const title = useMemo(() => (user ? `账号：${user.account}` : "账号详情"), [user])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, { method: "GET" })
      const json = (await res.json()) as GetResult
      if (!json.ok) throw new Error(json.error.message)
      setUser(json.data.user)
      setEmailDraft(json.data.user.email ?? "")
      setRoleDraft(json.data.user.security.roleKey ?? "user")
    } catch (e) {
      const anyErr = e as { message?: string }
      setError(anyErr?.message ?? "加载失败")
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    void load()
  }, [load])

  const onSave = useCallback(async () => {
    if (!user || saving) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: emailDraft.trim() || null, roleKey: roleDraft.trim() || "user" })
      })
      const json = (await res.json()) as PatchResult
      if (!json.ok) throw new Error(json.error.message)
      await load()
    } catch (e) {
      const anyErr = e as { message?: string }
      setError(anyErr?.message ?? "保存失败")
    } finally {
      setSaving(false)
    }
  }, [emailDraft, load, roleDraft, saving, user])

  const openModal = useCallback((k: ModalKind) => {
    setModal(k)
    setConfirmAccount("")
    setReason("")
    setNewPassword("")
  }, [])

  const closeModal = useCallback(() => {
    setModal(null)
    setConfirmAccount("")
    setReason("")
    setNewPassword("")
  }, [])

  const runAction = useCallback(async () => {
    if (!user || !modal || acting) return
    setActing(true)
    setError(null)
    try {
      const base = `/api/admin/users/${encodeURIComponent(user.id)}`
      const url =
        modal === "disable"
          ? `${base}/disable`
          : modal === "enable"
            ? `${base}/enable`
            : modal === "resetPassword"
              ? `${base}/reset-password`
              : `${base}/force-logout`

      const body =
        modal === "disable"
          ? { confirmAccount: confirmAccount.trim(), reason: reason.trim() || undefined }
          : modal === "resetPassword"
            ? { confirmAccount: confirmAccount.trim(), newPassword }
            : { confirmAccount: confirmAccount.trim() }

      const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
      const json = (await res.json()) as ActionResult
      if (!json.ok) throw new Error(json.error.message)
      closeModal()
      await load()
    } catch (e) {
      const anyErr = e as { message?: string }
      setError(anyErr?.message ?? "操作失败")
    } finally {
      setActing(false)
    }
  }, [acting, closeModal, confirmAccount, load, modal, newPassword, reason, user])

  return (
    <main className={styles.page}>
      <div className={styles.topBar}>
        <div className={styles.topLeft}>
          <div className={styles.breadcrumb}>
            <Link className={styles.link} href="/admin/users">
              账号管理
            </Link>
            <span className={styles.sep}>/</span>
            <span>{user?.account ?? userId}</span>
          </div>
          <div className={styles.topTitle}>{title}</div>
          <div className={styles.topMeta}>{loading ? "加载中…" : user ? `ID: ${user.id}` : ""}</div>
        </div>
        <div className={styles.topActions}>
          <button type="button" className={styles.topBtn} onClick={() => void load()} disabled={loading || saving || acting}>
            刷新
          </button>
          <button type="button" className={styles.topBtnPrimary} onClick={() => void onSave()} disabled={loading || saving || acting || !user}>
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      </div>

      {error ? <div className={styles.error}>{error}</div> : null}

      {!user && !loading ? <div className={styles.empty}>账号不存在或无权限</div> : null}

      {user ? (
        <div className={styles.grid}>
          <section className={styles.panel} aria-label="基本信息">
            <div className={styles.panelTitle}>基本信息</div>
            <div className={styles.kv}>
              <div className={styles.k}>账号</div>
              <div className={styles.v}>{user.account}</div>
              <div className={styles.k}>邮箱</div>
              <div className={styles.v}>
                <input className={styles.input} value={emailDraft} onChange={(e) => setEmailDraft(e.target.value)} placeholder="可为空" />
              </div>
              <div className={styles.k}>状态</div>
              <div className={styles.v}>{user.isActive ? <span className={styles.ok}>启用</span> : <span className={styles.bad}>禁用</span>}</div>
              <div className={styles.k}>角色</div>
              <div className={styles.v}>
                <input className={styles.input} value={roleDraft} onChange={(e) => setRoleDraft(e.target.value)} />
              </div>
              <div className={styles.k}>创建时间</div>
              <div className={styles.v}>{fmtTime(user.createdAt)}</div>
              <div className={styles.k}>更新时间</div>
              <div className={styles.v}>{fmtTime(user.updatedAt)}</div>
            </div>
          </section>

          <section className={styles.panel} aria-label="安全信息">
            <div className={styles.panelTitle}>安全信息</div>
            <div className={styles.kv}>
              <div className={styles.k}>最近登录</div>
              <div className={styles.v}>{fmtTime(user.security.lastLoginAt)}</div>
              <div className={styles.k}>密码更新时间</div>
              <div className={styles.v}>{fmtTime(user.security.passwordUpdatedAt)}</div>
              <div className={styles.k}>失败次数</div>
              <div className={styles.v}>{String(user.security.failedLoginCount ?? 0)}</div>
              <div className={styles.k}>锁定至</div>
              <div className={styles.v}>{fmtTime(user.security.lockedUntil)}</div>
              <div className={styles.k}>Token 版本</div>
              <div className={styles.v}>{String(user.security.tokenVersion ?? 1)}</div>
              <div className={styles.k}>禁用时间</div>
              <div className={styles.v}>{fmtTime(user.security.disabledAt)}</div>
              <div className={styles.k}>禁用原因</div>
              <div className={styles.v}>{user.security.disabledReason ?? "-"}</div>
            </div>
          </section>

          <section className={styles.panel} aria-label="操作">
            <div className={styles.panelTitle}>操作</div>
            <div className={styles.actions}>
              {user.isActive ? (
                <button type="button" className={styles.dangerBtn} onClick={() => openModal("disable")} disabled={acting}>
                  禁用账号
                </button>
              ) : (
                <button type="button" className={styles.topBtnPrimary} onClick={() => openModal("enable")} disabled={acting}>
                  启用账号
                </button>
              )}
              <button type="button" className={styles.dangerBtn} onClick={() => openModal("resetPassword")} disabled={acting}>
                重置密码
              </button>
              <button type="button" className={styles.dangerBtn} onClick={() => openModal("forceLogout")} disabled={acting}>
                强制下线
              </button>
              <Link className={styles.topBtn} href={`/admin/audit?targetId=${encodeURIComponent(user.id)}`}>
                查看审计
              </Link>
            </div>
          </section>
        </div>
      ) : null}

      {modal ? (
        <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="确认操作" onMouseDown={closeModal}>
          <div className={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitle}>
                {modal === "disable"
                  ? "禁用账号"
                  : modal === "enable"
                    ? "启用账号"
                    : modal === "resetPassword"
                      ? "重置密码"
                      : "强制下线"}
              </div>
              <button type="button" className={styles.modalClose} onClick={closeModal} aria-label="关闭">
                ×
              </button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.tip}>
                输入目标账号 <span className={styles.mono}>{user?.account}</span> 以确认
              </div>
              <input className={styles.input} value={confirmAccount} onChange={(e) => setConfirmAccount(e.target.value)} placeholder="确认账号" />
              {modal === "disable" ? (
                <input className={styles.input} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="禁用原因（可选）" />
              ) : null}
              {modal === "resetPassword" ? (
                <input className={styles.input} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="新密码" type="password" />
              ) : null}
              <div className={styles.modalActions}>
                <button type="button" className={styles.topBtn} onClick={closeModal} disabled={acting}>
                  取消
                </button>
                <button type="button" className={styles.dangerBtn} onClick={() => void runAction()} disabled={acting || !confirmAccount.trim()}>
                  {acting ? "处理中…" : "确认执行"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}

