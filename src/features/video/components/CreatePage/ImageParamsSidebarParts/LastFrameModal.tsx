"use client"

import Image from "next/image"
import { useEffect, type ReactElement } from "react"
import { createPortal } from "react-dom"
import styles from "../ImageParamsSidebar.module.css"
import modalStyles from "./LastFrameModal.module.css"

export function LastFrameModal({
  open,
  prevVideoLastFrameUrl,
  errorText,
  usingLastFrame,
  onClose,
  onUse
}: {
  open: boolean
  prevVideoLastFrameUrl?: string | null
  errorText?: string | null
  usingLastFrame: boolean
  onClose: () => void
  onUse: () => Promise<void> | void
}): ReactElement | null {
  const canPortal = typeof document !== "undefined"

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [open, onClose])

  if (!open) return null

  const content = (
    <div className={modalStyles.overlay} role="dialog" aria-modal="true" aria-label="查看尾帧图" onClick={onClose}>
      <div className={modalStyles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={modalStyles.modalHeader}>
          <div className={modalStyles.modalTitle}>上个分镜视频尾帧图</div>
          <button type="button" className={styles.secondaryBtn} onClick={onClose}>
            关闭
          </button>
        </div>
        <div className={modalStyles.modalBody}>
          {prevVideoLastFrameUrl ? (
            <div className={modalStyles.modalImgWrap}>
              <Image className={modalStyles.modalImg} src={prevVideoLastFrameUrl} alt="" width={1200} height={900} unoptimized />
            </div>
          ) : (
            <div className={styles.shotCutError}>未在数据库中找到上个分镜视频的尾帧图</div>
          )}
          {errorText ? <div className={styles.shotCutError}>{errorText}</div> : null}
        </div>
        <div className={modalStyles.modalActions}>
          <button type="button" className={styles.secondaryBtn} onClick={onClose} disabled={usingLastFrame}>
            取消
          </button>
          <button type="button" className={modalStyles.modalPrimaryBtn} disabled={usingLastFrame || !prevVideoLastFrameUrl} onClick={() => onUse()}>
            使用
          </button>
        </div>
      </div>
    </div>
  )

  return canPortal ? createPortal(content, document.body) : content
}
