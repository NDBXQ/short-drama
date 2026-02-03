"use client"

import type { ReactElement } from "react"
import styles from "./MyTypeTabs.module.css"

export type MyContentType = "standard" | "tvc"

interface MyTypeTabsProps {
  value: MyContentType
  onChange: (value: MyContentType) => void
}

export function MyTypeTabs({ value, onChange }: MyTypeTabsProps): ReactElement {
  return (
    <div className={styles.container}>
      <button
        type="button"
        className={`${styles.tab} ${value === "standard" ? styles.active : ""}`}
        onClick={() => onChange("standard")}
      >
        标准视频生成
      </button>
      <button type="button" className={`${styles.tab} ${value === "tvc" ? styles.active : ""}`} onClick={() => onChange("tvc")}>
        TVC 视频生成
      </button>
    </div>
  )
}
