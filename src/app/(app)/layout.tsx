import { Suspense, type ReactElement, type ReactNode } from "react"
import { AppHeader } from "@/components/app-header/AppHeader"
import styles from "./layout.module.css"
import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"
import { SESSION_COOKIE_NAME } from "@/shared/session"
import { getTraceId } from "@/shared/trace"
import { AuthService } from "@/server/domains/auth/services/authService"

/**
 * 应用主布局（带顶部导航）
 * @param {Object} props - 组件属性
 * @param {ReactNode} props.children - 子节点
 * @returns {ReactElement} 布局内容
 */
export default async function AppLayout({
  children
}: Readonly<{
  children: ReactNode
}>): Promise<ReactElement> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value
  const hdrs = await headers()
  const traceId = getTraceId(new Headers(hdrs as any))
  try {
    await AuthService.getCurrentUser(token, true, traceId)
  } catch {
    redirect("/login")
  }

  return (
    <div className={styles.shell}>
      <Suspense fallback={null}>
        <AppHeader />
      </Suspense>
      <div className={styles.page}>{children}</div>
    </div>
  )
}
