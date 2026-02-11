"use client"

import { useState } from "react"
import styles from "./ShortDramaPanel.module.css"
import { ShortDramaPlanningCard } from "./ShortDramaPlanningCard"
import { ShortDramaWorldSettingCard } from "./ShortDramaWorldSettingCard"
import { ShortDramaCharacterSettingsCard } from "./ShortDramaCharacterSettingsCard"
import type { ShortDramaStepKey } from "./ShortDramaStepsNav"
import { ShortDramaStepsNav } from "./ShortDramaStepsNav"

type ShortDramaPanelProps = Readonly<{
  storyId: string
  shortDrama: any
  onShortDramaUpdate?: (next: any) => void
  active?: ShortDramaStepKey
  onActiveChange?: (next: ShortDramaStepKey) => void
  showNav?: boolean
}>

export function ShortDramaPanel({ storyId, shortDrama, onShortDramaUpdate, active: activeProp, onActiveChange, showNav = true }: ShortDramaPanelProps) {
  const shortDramaObj = shortDrama && typeof shortDrama === "object" ? (shortDrama as any) : {}
  const planningResult = shortDramaObj?.planningResult ?? null
  const worldSetting = shortDramaObj?.worldSetting ?? null
  const characterSetting = shortDramaObj?.characterSetting ?? null
  const planningConfirmedAt = typeof shortDramaObj?.planningConfirmedAt === "number" ? shortDramaObj.planningConfirmedAt : null
  const confirmed = Boolean(typeof planningConfirmedAt === "number" || (planningResult && worldSetting && characterSetting))
  const worldVisible = confirmed ? worldSetting : null
  const characterVisible = confirmed ? characterSetting : null
  const [innerActive, setInnerActive] = useState<ShortDramaStepKey>("planning")
  const active = activeProp ?? innerActive
  const setActive = onActiveChange ?? setInnerActive

  return (
    <div className={showNav ? styles.root : styles.rootNoNav} aria-label="短剧信息">
      {showNav ? <ShortDramaStepsNav shortDrama={shortDramaObj} active={active} onChange={setActive} /> : null}

      <section className={styles.detail} aria-label="短剧详情">
        {active === "planning" ? (
          <ShortDramaPlanningCard
            storyId={storyId}
            planningResult={planningResult}
            worldSetting={worldSetting}
            characterSetting={characterSetting}
            planningConfirmedAt={planningConfirmedAt ?? undefined}
            onSaved={(nextPlanningResult) =>
              onShortDramaUpdate?.({
                ...shortDramaObj,
                planningResult: nextPlanningResult,
                worldSetting: null,
                characterSetting: null
              })
            }
            onShortDramaUpdate={onShortDramaUpdate}
          />
        ) : active === "world" ? (
          <ShortDramaWorldSettingCard
            storyId={storyId}
            planningResult={planningResult}
            planningConfirmedAt={planningConfirmedAt ?? undefined}
            worldSetting={worldVisible}
            characterSetting={characterSetting}
            onSaved={(nextWorldSetting) => onShortDramaUpdate?.({ ...shortDramaObj, worldSetting: nextWorldSetting })}
          />
        ) : (
          <ShortDramaCharacterSettingsCard
            storyId={storyId}
            planningResult={planningResult}
            planningConfirmedAt={planningConfirmedAt ?? undefined}
            worldSetting={worldVisible}
            characterSetting={characterVisible}
            onSaved={(nextCharacterSetting) => onShortDramaUpdate?.({ ...shortDramaObj, characterSetting: nextCharacterSetting })}
          />
        )}
      </section>
    </div>
  )
}
