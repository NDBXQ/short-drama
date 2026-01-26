"use client"

import { useEffect, useState, type ReactElement } from "react"
import { X } from "lucide-react"
import styles from "./StoryOriginalContentModal.module.css"
import { getStoryOriginalContent } from "../actions/library"

interface StoryOriginalContentModalProps {
  open: boolean
  storyId: string | null
  onClose: () => void
}

export function StoryOriginalContentModal({ open, storyId, onClose }: StoryOriginalContentModalProps): ReactElement | null {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<{ title: string; intro?: string; originalText: string } | null>(null)

  useEffect(() => {
    if (!open || !storyId) return
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setLoading(true)
      setError(null)
      setData(null)
    })
    getStoryOriginalContent(storyId)
      .then((res) => {
        if (cancelled) return
        if (!res.success || !res.data) {
          setError(res.message || "加载失败")
          return
        }
        setData({ title: res.data.title, intro: res.data.intro, originalText: res.data.originalText })
      })
      .catch((e) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : "加载失败")
      })
      .finally(() => {
        if (cancelled) return
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, storyId])

  if (!open || !storyId) return null

  return (
    <>
      <div className={styles.overlay} onClick={onClose} />
      <div className={styles.modal}>
        <div className={styles.header}>
          <div className={styles.title}>{data?.title ?? "查看原始内容"}</div>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </div>

        <div className={styles.body}>
          {loading ? (
            <div className={styles.muted}>加载中...</div>
          ) : error ? (
            <div className={styles.muted}>{error}</div>
          ) : data ? (
            <>
              {data.intro ? (
                <div className={styles.section}>
                  <div className={styles.sectionHeader}>简介</div>
                  <div className={styles.sectionBody}>{data.intro}</div>
                </div>
              ) : null}
              <div className={styles.section}>
                <div className={styles.sectionHeader}>原文内容</div>
                <div className={styles.sectionBody}>{data.originalText || "（空）"}</div>
              </div>
            </>
          ) : null}
        </div>

        <div className={styles.footer}>
          <button type="button" className={styles.btn} onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </>
  )
}
