import type { ReactElement } from "react"
import styles from "./HelpPage.module.css"
import { HelpDoc } from "./HelpDoc"

/**
 * 帮助中心占位页
 * @returns {ReactElement} 页面内容
 */
export default function HelpPage(): ReactElement {
  return (
    <main className={styles.main}>
      <HelpDoc />
    </main>
  )
}
