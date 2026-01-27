"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useState } from "react"
import type { ReactElement } from "react"
import { CircleHelp, Home, Library, LogIn, LogOut, NotebookPen, UserRound, Video } from "lucide-react"
import { appNavItems } from "@/shared/navigation"
import styles from "./AppHeader.module.css"

type MeResult =
  | { ok: true; data: { user: { id: string; account: string } }; traceId: string }
  | { ok: false; error: { code: string; message: string }; traceId: string }

type AppHeaderVariant = "app" | "auth"

type AppHeaderProps = {
  variant?: AppHeaderVariant
}

/**
 * 应用顶部导航栏
 * @returns {ReactElement} Header 组件
 */
export function AppHeader({ variant = "app" }: AppHeaderProps): ReactElement {
  const pathname = usePathname() ?? "/"
  const router = useRouter()
  const [me, setMe] = useState<MeResult | null>(null)
  const [loggingOut, setLoggingOut] = useState(false)

  const isActive = (href: string): boolean => {
    if (href === "/") return pathname === "/"
    return pathname.startsWith(href)
  }

  useEffect(() => {
    if (variant === "auth") return

    let cancelled = false

    ;(async (): Promise<void> => {
      try {
        const res = await fetch("/api/auth/me", { method: "GET" })
        const json = (await res.json()) as MeResult
        if (!cancelled) setMe(json)
      } catch {
        if (!cancelled)
          setMe({
            ok: false,
            error: { code: "NETWORK_ERROR", message: "网络错误" },
            traceId: "n/a"
          })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [variant])

  const displayAccount = useMemo(() => {
    if (!me || !me.ok) return null
    return me.data.user.account
  }, [me])

  /**
   * 退出登录并跳转到登录页
   * @returns {Promise<void>} 无返回值
   */
  const onLogout = useCallback(async (): Promise<void> => {
    if (loggingOut) return
    setLoggingOut(true)

    try {
      await fetch("/api/auth/logout", { method: "POST" })
    } finally {
      setLoggingOut(false)
      router.replace("/login")
      router.refresh()
    }
  }, [loggingOut, router])

  return (
    <header className={styles.header}>
      <div className={`${styles.inner} ${variant === "auth" ? styles.innerNoNav : ""}`}>
        <Link href="/" className={styles.brand} aria-label="AI 视频创作平台" title="AI 视频创作平台">
          <span className={styles.brandIcon} aria-hidden="true">
            <Video size={20} strokeWidth={2.2} />
          </span>
        </Link>

        {variant === "app" ? (
          <nav className={styles.nav} aria-label="主导航">
            {appNavItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`${styles.navItem} ${isActive(item.href) ? styles.navItemActive : ""}`}
                aria-label={item.label}
                title={item.label}
              >
                {item.href === "/" ? (
                  <Home size={20} strokeWidth={2.2} />
                ) : item.href.startsWith("/script") ? (
                  <NotebookPen size={20} strokeWidth={2.2} />
                ) : item.href.startsWith("/video") ? (
                  <Video size={20} strokeWidth={2.2} />
                ) : (
                  <Library size={20} strokeWidth={2.2} />
                )}
              </Link>
            ))}
          </nav>
        ) : null}

        <div className={styles.actions}>
          <Link href="/help" className={styles.actionLink} aria-label="帮助中心" title="帮助中心">
            <CircleHelp size={20} strokeWidth={2.2} />
          </Link>
          {variant === "app" ? (
            <>
              {displayAccount ? (
                <>
                  <button
                    type="button"
                    className={`${styles.actionButton} ${styles.logout}`}
                    onClick={onLogout}
                    disabled={loggingOut}
                    aria-label="退出登录"
                    title={loggingOut ? "退出中…" : "退出登录"}
                  >
                    <LogOut size={20} strokeWidth={2.2} />
                  </button>
                  <span className={styles.account} aria-label="当前账号" title={displayAccount}>
                    <UserRound size={20} strokeWidth={2.2} />
                  </span>
                </>
              ) : (
                <Link href="/login" className={styles.actionLink} aria-label="去登录" title="去登录">
                  <LogIn size={20} strokeWidth={2.2} />
                </Link>
              )}
            </>
          ) : null}
        </div>
      </div>
    </header>
  )
}
