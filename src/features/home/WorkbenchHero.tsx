import Link from "next/link"
import type { ReactElement } from "react"
import styles from "./WorkbenchHero.module.css"

/**
 * 首页工作台引导区块
 * @returns {ReactElement} 区块内容
 */
export function WorkbenchHero(): ReactElement {
  return (
    <section className={styles.card} aria-label="工作台">
      <div className={styles.tag}>
        <span className={styles.tagIcon} aria-hidden="true" />
        快速开始
      </div>

      <div className={styles.actions}>
        <Link href="/script" className={`${styles.actionCard} ${styles.primary}`}>
          <div className={styles.actionIcon} aria-hidden="true" />
          <div className={styles.actionText}>
            <div className={styles.actionTitle}>新建剧本</div>
            <div className={styles.actionSub}>从原文/简介出发，生成分镜脚本</div>
          </div>
          <span className={styles.chevron} aria-hidden="true">
            →
          </span>
        </Link>

        <Link href="/video" className={`${styles.actionCard} ${styles.secondary}`}>
          <div className={`${styles.actionIcon} ${styles.secondaryIcon}`} aria-hidden="true" />
          <div className={styles.actionText}>
            <div className={styles.actionTitle}>视频创作</div>
            <div className={styles.actionSub}>基于分镜脚本，快速合成成片</div>
          </div>
          <span className={styles.chevron} aria-hidden="true">
            →
          </span>
        </Link>

        <Link href="/tvc" className={`${styles.actionCard} ${styles.tvc}`}>
          <div className={`${styles.actionIcon} ${styles.tvcIcon}`} aria-hidden="true" />
          <div className={styles.actionText}>
            <div className={styles.actionTitle}>TVC 一键成片</div>
            <div className={styles.actionSub}>输入产品与风格，生成广告脚本与成片</div>
          </div>
          <span className={styles.chevron} aria-hidden="true">
            →
          </span>
        </Link>
      </div>
    </section>
  )
}
