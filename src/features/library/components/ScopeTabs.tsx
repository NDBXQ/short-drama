import type { ReactElement } from "react"
import styles from "./ScopeTabs.module.css"

export type Scope = "my" | "library" | "shared"

interface ScopeTabsProps {
  value: Scope
  onChange: (scope: Scope) => void
}

export function ScopeTabs({ value, onChange }: ScopeTabsProps): ReactElement {
  return (
    <div className={styles.container}>
      <button
        type="button"
        className={`${styles.tab} ${value === "my" ? styles.active : ""}`}
        onClick={() => onChange("my")}
      >
        我的内容
      </button>
      <button
        type="button"
        className={`${styles.tab} ${value === "library" ? styles.active : ""}`}
        onClick={() => onChange("library")}
      >
        资源库
      </button>
      <button
        type="button"
        className={`${styles.tab} ${value === "shared" ? styles.active : ""}`}
        onClick={() => onChange("shared")}
      >
        共享资源库
      </button>
    </div>
  )
}
