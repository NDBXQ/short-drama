import Link from "next/link"
import type { ReactElement } from "react"
import styles from "./page.module.css"

export default function AdminPage(): ReactElement {
  return (
    <main className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>超级管理员后台</h1>
        <div className={styles.subtitle}>用于项目内接口联调与回归测试（仅管理员可访问）</div>
      </div>

      <div className={styles.cards}>
        <Link href="/admin/api-tester" className={styles.card}>
          <div className={styles.cardTitle}>API 测试台</div>
          <div className={styles.cardDesc}>选择接口、编辑请求、查看响应、保存历史与导出 curl</div>
        </Link>
        <Link href="/admin/users" className={styles.card}>
          <div className={styles.cardTitle}>账号管理</div>
          <div className={styles.cardDesc}>账号列表、创建、启用禁用、重置密码、强制下线</div>
        </Link>
        <Link href="/admin/audit" className={styles.card}>
          <div className={styles.cardTitle}>审计日志</div>
          <div className={styles.cardDesc}>追踪管理员操作记录，支持筛选与查看详情</div>
        </Link>
        <Link href="/admin/telemetry" className={styles.card}>
          <div className={styles.cardTitle}>自迭代任务单</div>
          <div className={styles.cardDesc}>基于 /tvc 漏斗数据生成可验证的迭代任务单</div>
        </Link>
      </div>
    </main>
  )
}
