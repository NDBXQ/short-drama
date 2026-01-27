import type { ReactElement } from "react"
import layoutStyles from "../VideoAssetSidebarLayout.module.css"
import type { Asset, MediaAsset } from "../../../utils/timelineUtils"
import { AssetChip } from "./AssetChip"

export function ImageAssetsTab({
  mediaAssets,
  onOpenPreview
}: {
  mediaAssets: MediaAsset[]
  onOpenPreview: (asset: Asset) => void
}): ReactElement {
  return (
    <div className={layoutStyles.tabBody} aria-label="图片素材">
      <div className={layoutStyles.splitBlock} aria-label="脚本图片">
        <div className={layoutStyles.splitLabel}>脚本</div>
        <div className={layoutStyles.splitContent}>
          <div className={layoutStyles.emptyHint}>暂无脚本图片</div>
        </div>
      </div>

      <div className={layoutStyles.splitBlock} aria-label="素材库图片">
        <div className={layoutStyles.splitLabel}>素材库</div>
        <div className={layoutStyles.splitContent}>
          <div className={layoutStyles.sectionHeader}>
            <div className={layoutStyles.assetSectionTitle}>图片</div>
          </div>
          <div className={layoutStyles.chipList}>
            {mediaAssets.length > 0 ? mediaAssets.map((a) => <AssetChip key={a.id} asset={a} onOpenPreview={onOpenPreview} />) : <div className={layoutStyles.emptyHint}>暂无素材库图片</div>}
          </div>
        </div>
      </div>
    </div>
  )
}
