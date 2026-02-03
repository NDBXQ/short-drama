import type { ReactElement } from "react"
import { GenerationHeader } from "./GenerationHeader"
import shellStyles from "../ImageCreate/Shell.module.css"

export function CreateWorkspaceMain({
  onBack,
  activeTab,
  onTabChange,
  sceneNo,
  recommendedStoryboardMode,
  canPrevScene,
  canNextScene,
  onPrevScene,
  onNextScene,
  info,
  leftPanel,
  rightPanel
}: {
  onBack: () => void
  activeTab: "image" | "video"
  onTabChange: (tab: "image" | "video") => void
  sceneNo: number
  recommendedStoryboardMode: any
  canPrevScene: boolean
  canNextScene: boolean
  onPrevScene: () => void
  onNextScene: () => void
  info: Array<{ label: string; value: string }>
  leftPanel: ReactElement
  rightPanel: ReactElement
}): ReactElement {
  return (
    <>
      <GenerationHeader
        onBack={onBack}
        activeTab={activeTab}
        onTabChange={onTabChange}
        sceneNo={sceneNo}
        recommendedStoryboardMode={recommendedStoryboardMode}
        canPrevScene={canPrevScene}
        canNextScene={canNextScene}
        onPrevScene={onPrevScene}
        onNextScene={onNextScene}
        info={info}
      />

      <div className={shellStyles.workspaceWrap}>
        <div
          className={shellStyles.body}
          style={
            {
              ["--dock-h" as any]: activeTab === "video" ? "190px" : "140px",
              ["--dock-gap" as any]: "8px",
              gridTemplateRows: "calc(100% - var(--dock-h, 0px) - var(--dock-gap, 0px)) var(--dock-h, 0px)",
              rowGap: "var(--dock-gap, 0px)",
              columnGap: "8px"
            } as any
          }
        >
          {leftPanel}
          <div aria-hidden style={{ gridColumn: 1, gridRow: 2 }} />
          {rightPanel}
        </div>
      </div>
    </>
  )
}
