"use client"

import type { ReactElement } from "react"
import { useMemo, useState } from "react"
import styles from "./StoryContentModal.module.css"

type Props = {
  url?: string | null
}

function toSafeHttpUrl(input: string | null | undefined): string | null {
  const raw = typeof input === "string" ? input.trim() : ""
  if (!raw) return null
  try {
    const u = new URL(raw)
    if (u.protocol !== "http:" && u.protocol !== "https:") return null
    return u.toString()
  } catch {
    return null
  }
}

export function StoryContentFinalVideoPreview({ url }: Props): ReactElement {
  const [failed, setFailed] = useState(false)
  const safeUrl = useMemo(() => toSafeHttpUrl(url), [url])
  const showVideo = Boolean(safeUrl) && !failed

  return (
    <div className={styles.section}>
      <div className={styles.sectionTitle}>成片预览</div>
      <div className={styles.finalVideoShell}>
        {showVideo ? (
          <video
            className={styles.finalVideo}
            src={safeUrl as string}
            controls
            playsInline
            preload="metadata"
            onError={() => setFailed(true)}
          />
        ) : (
          <div className={styles.finalVideoEmpty}>
            <div className={styles.muted}>{safeUrl ? "视频加载失败" : "暂无成片"}</div>
          </div>
        )}
      </div>

      {safeUrl ? (
        <div className={styles.linkRow}>
          <a className={styles.linkBtn} href={safeUrl} target="_blank" rel="noreferrer">
            在新窗口打开
          </a>
        </div>
      ) : null}
    </div>
  )
}

