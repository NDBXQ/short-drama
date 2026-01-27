import type { ReactElement } from "react"
import layoutStyles from "../VideoAssetSidebarLayout.module.css"
import audioStyles from "../VideoAssetSidebarAudio.module.css"
import type { Asset, AudioAsset } from "../../../utils/timelineUtils"
import { AudioRow } from "./AudioRow"

export function AudioAssetsTab({
  scriptAudioAssets,
  audioAssets,
  onUploadAudio,
  onOpenPreview
}: {
  scriptAudioAssets: Array<{ id: string; name: string; kind: "audio"; src: string; roleName: string; speakerName: string; content: string }>
  audioAssets: AudioAsset[]
  onUploadAudio: (file: File) => void
  onOpenPreview: (asset: Asset) => void
}): ReactElement {
  return (
    <div className={layoutStyles.tabBody} aria-label="音频素材">
      <div className={layoutStyles.splitBlock} aria-label="脚本音频">
        <div className={layoutStyles.splitLabel}>脚本</div>
        <div className={layoutStyles.splitContent}>
          {scriptAudioAssets.length > 0 ? (
            <>
              <div className={layoutStyles.sectionHeader}>
                <div className={layoutStyles.assetSectionTitle}>音频</div>
                <div className={layoutStyles.groupMeta}>{scriptAudioAssets.length} 条</div>
              </div>
              <div className={audioStyles.audioList}>
                {scriptAudioAssets.map((a) => (
                  <AudioRow key={a.id} id={a.id} name={a.name} src={a.src} content={a.content} draggableAsset={a as any} onOpenPreview={onOpenPreview as any} />
                ))}
              </div>
            </>
          ) : (
            <div className={layoutStyles.emptyHint}>暂无脚本音频</div>
          )}
        </div>
      </div>

      <div className={layoutStyles.splitBlock} aria-label="素材库音频">
        <div className={layoutStyles.splitLabel}>素材库</div>
        <div className={layoutStyles.splitContent}>
          <div className={layoutStyles.sectionHeader}>
            <div className={layoutStyles.assetSectionTitle}>音频</div>
            <div className={layoutStyles.groupMeta}>{audioAssets.length} 条</div>
            <label className={layoutStyles.uploadBtn}>
              <input
                type="file"
                accept="audio/*"
                className={layoutStyles.uploadInput}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  onUploadAudio(file)
                  e.target.value = ""
                }}
              />
              添加
            </label>
          </div>
          <div className={audioStyles.audioList}>
            {audioAssets.length > 0 ? (
              audioAssets.map((a) => <AudioRow key={a.id} id={a.id} name={a.name} src={a.src} draggableAsset={a} onOpenPreview={onOpenPreview as any} />)
            ) : (
              <div className={layoutStyles.emptyHint}>暂无素材库音频</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
