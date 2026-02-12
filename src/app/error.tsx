"use client"

import Link from "next/link"
import type { ReactElement } from "react"
import styles from "./error.module.css"

type GlobalErrorProps = Readonly<{
  error: Error & { digest?: string }
  reset: () => void
}>

export default function GlobalError({ error, reset }: GlobalErrorProps): ReactElement {
  const message = (error?.message ?? "").trim()
  const digest = (error as any)?.digest ? String((error as any).digest) : ""
  const showDetails = process.env.NODE_ENV !== "production"

  return (
    <div className={styles.shell}>
      <div className={styles.card}>
        <div className={styles.title}>页面加载失败</div>
        <div className={styles.desc}>
          {message ? message : "服务端渲染遇到异常，导致页面无法完成加载。你可以重试或返回首页。"}
        </div>

        <div className={styles.actions}>
          <button type="button" className={styles.primary} onClick={reset}>
            重试
          </button>
          <Link className={styles.secondary} href="/">
            回到首页
          </Link>
          <Link className={styles.secondary} href="/login">
            去登录
          </Link>
        </div>

        {showDetails && (digest || message) ? (
          <div className={styles.detail}>
            {digest ? <div className={styles.detailLine}>digest: {digest}</div> : null}
            {message ? <div className={styles.detailLine}>message: {message}</div> : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
