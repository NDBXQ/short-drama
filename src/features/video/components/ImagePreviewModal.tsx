import { type ReactElement, useEffect, useRef, useState } from "react"
import styles from "./ImagePreviewModal.module.css"
import { PreviewPane } from "./ImagePreviewModalParts/PreviewPane"
import { SidePanel } from "./ImagePreviewModalParts/SidePanel"
import { useImageNaturalSize } from "./ImagePreviewModalParts/useImageNaturalSize"
import { useSelectionRect } from "./ImagePreviewModalParts/useSelectionRect"
import { ImageAssetPickerModal } from "./ImagePreview/ImageAssetPickerModal"

type ImagePreviewModalProps = {
  open: boolean
  title: string
  imageSrc: string
  generatedImageId?: string
  storyboardId?: string | null
  category?: string | null
  frameKind?: "first" | "last" | null
  description?: string | null
  prompt?: string | null
  onStoryboardFrameUpdated?: (p: { storyboardId: string; frameKind: "first" | "last"; url: string; thumbnailUrl: string | null }) => void
  onClose: () => void
}

export function ImagePreviewModal({
  open,
  title,
  imageSrc,
  generatedImageId,
  storyboardId,
  category,
  frameKind,
  description,
  prompt,
  onStoryboardFrameUpdated,
  onClose
}: ImagePreviewModalProps): ReactElement | null {
  const [currentSrc, setCurrentSrc] = useState(() => (imageSrc?.trim() ? imageSrc : ""))
  const [currentGeneratedImageId, setCurrentGeneratedImageId] = useState<string | undefined>(() => generatedImageId)
  const [editPrompt, setEditPrompt] = useState("")
  const [replacePickerOpen, setReplacePickerOpen] = useState(false)
  const frameRef = useRef<HTMLDivElement | null>(null)
  const imageSize = useImageNaturalSize(open, currentSrc)

  const selection = useSelectionRect({
    open,
    imageSize,
    frameRef,
    disabled: false
  })

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      if (selection.isEditing) {
        selection.setIsEditing(false)
        selection.setDraftRect(null)
        return
      }
      onClose()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [onClose, open, selection])

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [open])

  if (!open) return null
  const stableStoryboardId = typeof storyboardId === "string" ? storyboardId.trim() : ""

  return (
    <div className={styles.overlay} onClick={onClose} role="presentation">
      <div className={styles.modal} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
        <PreviewPane
          title={title}
          currentSrc={currentSrc}
          imageSize={imageSize}
          frameRef={frameRef}
          canEdit={selection.canEdit}
          isEditing={selection.isEditing}
          setIsEditing={selection.setIsEditing}
          confirmedRect={selection.confirmedRect}
          draftRect={selection.draftRect}
          setDraftRect={selection.setDraftRect}
          overlayStyle={selection.overlayStyle}
          overlayRect={selection.overlayRect}
          inpaintLoading={false}
          beginBoxSelect={selection.beginBoxSelect}
          onBoxSelectMove={selection.onBoxSelectMove}
          onBoxSelectEnd={selection.onBoxSelectEnd}
          startMove={selection.startMove}
          startResize={selection.startResize}
          onSelectionPointerMove={selection.onSelectionPointerMove}
          onSelectionPointerUp={selection.onSelectionPointerUp}
          clearSelection={selection.clearSelection}
        />

        <SidePanel
          open={open}
          title={title}
          description={description}
          prompt={prompt}
          storyboardId={storyboardId ?? null}
          category={category ?? null}
          frameKind={frameKind ?? null}
          currentSrc={currentSrc}
          setCurrentSrc={setCurrentSrc}
          currentGeneratedImageId={currentGeneratedImageId}
          setCurrentGeneratedImageId={setCurrentGeneratedImageId}
          isEditing={selection.isEditing}
          confirmedRect={selection.confirmedRect}
          setConfirmedRect={selection.setConfirmedRect}
          setIsEditing={selection.setIsEditing}
          editPrompt={editPrompt}
          setEditPrompt={setEditPrompt}
          onReplaceFromLibrary={() => setReplacePickerOpen(true)}
          onStoryboardFrameUpdated={onStoryboardFrameUpdated}
          onClose={onClose}
        />

        <ImageAssetPickerModal
          open={replacePickerOpen && Boolean(stableStoryboardId)}
          title={title}
          entityName={title}
          storyboardId={stableStoryboardId}
          category={(category ?? "background") as any}
          onPicked={({ url, thumbnailUrl, generatedImageId }) => {
            setReplacePickerOpen(false)
            setCurrentSrc(url)
            setCurrentGeneratedImageId(generatedImageId)
            selection.setIsEditing(false)
            selection.setDraftRect(null)
            selection.setConfirmedRect(null)
            setEditPrompt("")
            if (stableStoryboardId) window.dispatchEvent(new CustomEvent("video_reference_images_updated", { detail: { storyboardId: stableStoryboardId } }))
            if (stableStoryboardId && frameKind && onStoryboardFrameUpdated) onStoryboardFrameUpdated({ storyboardId: stableStoryboardId, frameKind, url, thumbnailUrl })
          }}
          onClose={() => setReplacePickerOpen(false)}
        />
      </div>
    </div>
  )
}
