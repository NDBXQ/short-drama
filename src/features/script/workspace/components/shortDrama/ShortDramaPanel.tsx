"use client"

import { useMemo, useState } from "react"
import styles from "./ShortDramaPanel.module.css"
import { ShortDramaPlanningCard } from "./ShortDramaPlanningCard"
import { ShortDramaWorldSettingCard } from "./ShortDramaWorldSettingCard"
import { ShortDramaCharacterSettingsCard } from "./ShortDramaCharacterSettingsCard"

type ShortDramaPanelProps = Readonly<{
  storyId: string
  shortDrama: any
  onShortDramaUpdate?: (next: any) => void
}>

type StepKey = "planning" | "world" | "character"

export function ShortDramaPanel({ storyId, shortDrama, onShortDramaUpdate }: ShortDramaPanelProps) {
  const shortDramaObj = shortDrama && typeof shortDrama === "object" ? (shortDrama as any) : {}
  const planningResult = shortDramaObj?.planningResult ?? null
  const worldSetting = shortDramaObj?.worldSetting ?? null
  const characterSetting = shortDramaObj?.characterSetting ?? null
  const planningConfirmedAt = typeof shortDramaObj?.planningConfirmedAt === "number" ? shortDramaObj.planningConfirmedAt : null
  const confirmed = Boolean(typeof planningConfirmedAt === "number" || (planningResult && worldSetting && characterSetting))
  const worldVisible = confirmed ? worldSetting : null
  const characterVisible = confirmed ? characterSetting : null
  const [active, setActive] = useState<StepKey>("planning")

  const steps = useMemo(() => {
    const hasPlanning = Boolean(planningResult)
    const hasWorld = confirmed && Boolean(worldSetting)
    const hasCharacter = confirmed && Boolean(characterSetting)
    return [
      {
        key: "planning" as const,
        title: "剧本策划",
        desc: "前置条件",
        ok: hasPlanning,
        badge: hasPlanning ? (confirmed ? "已确认" : "未确认") : "未生成"
      },
      {
        key: "world" as const,
        title: "世界观设定",
        desc: "基于策划并行",
        ok: hasWorld,
        badge: !confirmed ? "待确认" : hasWorld ? "已生成" : "未生成"
      },
      {
        key: "character" as const,
        title: "角色设定",
        desc: "基于策划并行",
        ok: hasCharacter,
        badge: !confirmed ? "待确认" : hasCharacter ? "已生成" : "未生成"
      }
    ]
  }, [characterSetting, confirmed, planningResult, worldSetting])

  return (
    <div className={styles.root} aria-label="短剧信息">
      <aside className={styles.nav} aria-label="短剧步骤">
        {steps.map((s) => (
          <button
            key={s.key}
            type="button"
            className={active === s.key ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem}
            onClick={() => setActive(s.key)}
          >
            <div className={styles.navRow}>
              <div className={styles.navTitle}>{s.title}</div>
              <div className={s.badge === "已确认" || s.badge === "已生成" ? styles.badgeOk : styles.badgeMuted}>{s.badge}</div>
            </div>
            <div className={styles.navDesc}>{s.desc}</div>
          </button>
        ))}
      </aside>

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
