"use client"

import { type ReactNode, useMemo } from "react"
import styles from "./ShortDramaStepsNav.module.css"

export type ShortDramaStepKey = "planning" | "world" | "character"

type ShortDramaStepsNavProps = Readonly<{
  shortDrama: any
  active: ShortDramaStepKey
  onChange: (next: ShortDramaStepKey) => void
  extraItems?: ReactNode
}>

export function ShortDramaStepsNav({ shortDrama, active, onChange, extraItems }: ShortDramaStepsNavProps) {
  const shortDramaObj = shortDrama && typeof shortDrama === "object" ? (shortDrama as any) : {}
  const planningResult = shortDramaObj?.planningResult ?? null
  const worldSetting = shortDramaObj?.worldSetting ?? null
  const characterSetting = shortDramaObj?.characterSetting ?? null
  const planningConfirmedAt = typeof shortDramaObj?.planningConfirmedAt === "number" ? shortDramaObj.planningConfirmedAt : null
  const confirmed = Boolean(typeof planningConfirmedAt === "number" || (planningResult && worldSetting && characterSetting))

  const steps = useMemo(() => {
    const hasPlanning = Boolean(planningResult)
    const hasWorld = confirmed && Boolean(worldSetting)
    const hasCharacter = confirmed && Boolean(characterSetting)
    return [
      {
        key: "planning" as const,
        title: "剧本策划",
        desc: "前置条件",
        badge: hasPlanning ? (confirmed ? "已确认" : "未确认") : "未生成"
      },
      {
        key: "world" as const,
        title: "世界观设定",
        desc: "基于策划并行",
        badge: !confirmed ? "待确认" : hasWorld ? "已生成" : "未生成"
      },
      {
        key: "character" as const,
        title: "角色设定",
        desc: "基于策划并行",
        badge: !confirmed ? "待确认" : hasCharacter ? "已生成" : "未生成"
      }
    ]
  }, [characterSetting, confirmed, planningResult, worldSetting])

  return (
    <div className={styles.nav} aria-label="短剧步骤">
      {steps.map((s) => (
        <button
          key={s.key}
          type="button"
          className={active === s.key ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem}
          onClick={() => onChange(s.key)}
        >
          <div className={styles.navRow}>
            <div className={styles.navTitle}>{s.title}</div>
            <div className={s.badge === "已确认" || s.badge === "已生成" ? styles.badgeOk : styles.badgeMuted}>{s.badge}</div>
          </div>
          <div className={styles.navDesc}>{s.desc}</div>
        </button>
      ))}
      {extraItems}
    </div>
  )
}
