"use client"

import type { ReactElement, ReactNode } from "react"
import styles from "../ImageParamsSidebar.module.css"

export function ChipGroup({ title, children }: { title: string; children: ReactNode }): ReactElement {
  return (
    <div className={styles.group}>
      <div className={styles.groupHeader}>
        <span>{title}</span>
      </div>
      <div className={styles.chipList}>{children}</div>
    </div>
  )
}
