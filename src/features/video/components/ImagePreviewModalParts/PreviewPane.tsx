import Image from "next/image"
import type { ReactElement } from "react"
import styles from "../ImagePreviewModal.module.css"
import type { NormalizedRect, ResizeHandle } from "./selectionUtils"

export function PreviewPane({
  title,
  currentSrc,
  imageSize,
  frameRef,
  canEdit,
  isEditing,
  setIsEditing,
  confirmedRect,
  draftRect,
  setDraftRect,
  overlayStyle,
  overlayRect,
  inpaintLoading,
  beginBoxSelect,
  onBoxSelectMove,
  onBoxSelectEnd,
  startMove,
  startResize,
  onSelectionPointerMove,
  onSelectionPointerUp,
  clearSelection
}: {
  title: string
  currentSrc: string
  imageSize: { width: number; height: number } | null
  frameRef: React.RefObject<HTMLDivElement | null>
  canEdit: boolean
  isEditing: boolean
  setIsEditing: (v: boolean) => void
  confirmedRect: NormalizedRect | null
  draftRect: NormalizedRect | null
  setDraftRect: (r: NormalizedRect | null) => void
  overlayStyle: { left: number; top: number; width: number; height: number } | null
  overlayRect: NormalizedRect | null
  inpaintLoading: boolean
  beginBoxSelect: (e: React.PointerEvent) => void
  onBoxSelectMove: (e: React.PointerEvent) => void
  onBoxSelectEnd: (e: React.PointerEvent) => void
  startMove: (e: React.PointerEvent) => void
  startResize: (handle: ResizeHandle) => (e: React.PointerEvent) => void
  onSelectionPointerMove: (e: React.PointerEvent) => void
  onSelectionPointerUp: (e: React.PointerEvent) => void
  clearSelection: () => void
}): ReactElement {
  return (
    <div className={styles.left}>
      <div
        ref={frameRef}
        className={styles.previewFrame}
        style={{ aspectRatio: imageSize ? `${imageSize.width} / ${imageSize.height}` : undefined }}
      >
        {currentSrc ? (
          <Image
            src={currentSrc}
            alt={title}
            fill
            unoptimized
            sizes="(max-width: 1023px) 100vw, 980px"
            style={{ objectFit: "contain" }}
          />
        ) : null}

        <button
          type="button"
          className={styles.editButton}
          disabled={!canEdit || inpaintLoading}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            if (!canEdit) return
            setIsEditing(!isEditing)
            setDraftRect(null)
          }}
        >
          {isEditing ? "退出编辑" : "编辑"}
        </button>

        {isEditing ? (
          <div
            className={styles.editOverlay}
            onPointerDown={beginBoxSelect}
            onPointerMove={onBoxSelectMove}
            onPointerUp={onBoxSelectEnd}
            onPointerLeave={onBoxSelectEnd}
            role="presentation"
          />
        ) : null}

        {overlayStyle ? (
          <div
            className={styles.selectionRect}
            style={{ left: overlayStyle.left, top: overlayStyle.top, width: overlayStyle.width, height: overlayStyle.height }}
            onPointerDown={overlayRect ? startMove : undefined}
            onPointerMove={overlayRect ? onSelectionPointerMove : undefined}
            onPointerUp={overlayRect ? onSelectionPointerUp : undefined}
            onPointerCancel={overlayRect ? onSelectionPointerUp : undefined}
          >
            {overlayRect ? (
              <>
                <div className={`${styles.selectionHandle} ${styles.handleNw}`} onPointerDown={startResize("nw")} />
                <div className={`${styles.selectionHandle} ${styles.handleN}`} onPointerDown={startResize("n")} />
                <div className={`${styles.selectionHandle} ${styles.handleNe}`} onPointerDown={startResize("ne")} />
                <div className={`${styles.selectionHandle} ${styles.handleE}`} onPointerDown={startResize("e")} />
                <div className={`${styles.selectionHandle} ${styles.handleSe}`} onPointerDown={startResize("se")} />
                <div className={`${styles.selectionHandle} ${styles.handleS}`} onPointerDown={startResize("s")} />
                <div className={`${styles.selectionHandle} ${styles.handleSw}`} onPointerDown={startResize("sw")} />
                <div className={`${styles.selectionHandle} ${styles.handleW}`} onPointerDown={startResize("w")} />
              </>
            ) : null}
          </div>
        ) : null}

        {!isEditing && confirmedRect ? (
          <div className={styles.editControls}>
            <button
              type="button"
              className={styles.editCtrlBtn}
              disabled={inpaintLoading}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                clearSelection()
                setIsEditing(true)
              }}
            >
              清除/重选
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

