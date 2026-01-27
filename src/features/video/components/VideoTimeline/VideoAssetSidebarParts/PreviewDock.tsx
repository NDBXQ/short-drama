import type { ReactElement } from "react"
import previewStyles from "../VideoAssetSidebarPreview.module.css"

export function PreviewDock({
  previewMedia,
  onClose
}: {
  previewMedia: { kind: "audio" | "video"; name: string; src: string } | null
  onClose: () => void
}): ReactElement | null {
  if (!previewMedia) return null

  return (
    <div className={previewStyles.previewDock} aria-label="素材预览">
      <div className={previewStyles.previewDockHeader}>
        <div className={previewStyles.previewDockTitle} title={previewMedia.name}>
          {previewMedia.name}
        </div>
        <button type="button" className={previewStyles.previewDockClose} onClick={onClose} aria-label="关闭预览">
          ×
        </button>
      </div>
      {previewMedia.kind === "audio" ? (
        <audio key={previewMedia.src} className={previewStyles.previewDockAudio} src={previewMedia.src} controls autoPlay />
      ) : (
        <video key={previewMedia.src} className={previewStyles.previewDockVideo} src={previewMedia.src} controls autoPlay playsInline />
      )}
    </div>
  )
}
