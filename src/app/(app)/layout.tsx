import { Suspense, type ReactElement, type ReactNode } from "react"
import { AppHeader } from "@/components/app-header/AppHeader"
import styles from "./layout.module.css"

/**
 * 应用主布局（带顶部导航）
 * @param {Object} props - 组件属性
 * @param {ReactNode} props.children - 子节点
 * @returns {ReactElement} 布局内容
 */
export default function AppLayout({
  children
}: Readonly<{
  children: ReactNode
}>): ReactElement {
  return (
    <div className={styles.shell}>
      <Suspense fallback={null}>
        <AppHeader />
      </Suspense>
      <div className={styles.page}>{children}</div>
    </div>
  )
}
