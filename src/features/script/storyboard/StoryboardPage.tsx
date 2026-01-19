import Link from "next/link"
import type { ReactElement } from "react"
import styles from "./StoryboardPage.module.css"

type StoryboardPageProps = Readonly<{
  mode?: string
  outline?: string
  storyId?: string
}>

/**
 * 生成分镜文本页面（简版占位实现）
 * @param {StoryboardPageProps} props - 组件属性
 * @param {string} [props.mode] - 进入模式（brief/source）
 * @param {string} [props.outline] - 大纲编号
 * @returns {ReactElement} 页面内容
 */
export function StoryboardPage({ mode, outline, storyId }: StoryboardPageProps): ReactElement {
  const promptTitle = mode === "source" ? "故事原文" : "剧情简介"
  const outlineIndex = (() => {
    const parsed = Number(outline)
    if (!Number.isFinite(parsed)) return 3
    if (parsed < 1) return 1
    if (parsed > 4) return 4
    return Math.trunc(parsed)
  })()

  return (
    <main className={styles.main}>
      <section className={styles.hero}>
        <div className={styles.heroLeft}>
          <div className={styles.tag}>
            <span className={styles.tagIcon} aria-hidden="true" />
            分镜文本生成
          </div>
          <h1 className={styles.title}>生成分镜文本</h1>
          <p className={styles.subtitle}>
            基于剧本大纲生成逐场景镜头描述与对白文本。当前来源：剧本大纲 {outlineIndex}（{promptTitle}
            模式）。
          </p>
        </div>

        <div className={styles.heroActions}>
          <Link
            className={styles.backButton}
            href={
              typeof storyId === "string" && storyId.trim()
                ? `/script/workspace/${encodeURIComponent(storyId.trim())}?mode=${mode ?? "brief"}&outline=${outlineIndex}`
                : "/script"
            }
          >
            返回大纲工作区
          </Link>
          <Link className={styles.primaryButton} href="/video">
            去视频创作
          </Link>
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <div className={styles.cardTitle}>生成参数</div>
          <div className={styles.cardHint}>简版占位：先把结构搭起来</div>
        </div>

        <div className={styles.formGrid}>
          <label className={styles.field}>
            <div className={styles.label}>镜头风格</div>
            <select className={styles.select} defaultValue="cinema">
              <option value="cinema">电影感（推荐）</option>
              <option value="tv">电视剧</option>
              <option value="short">短视频</option>
            </select>
          </label>

          <label className={styles.field}>
            <div className={styles.label}>每集场景数</div>
            <select className={styles.select} defaultValue="8">
              <option value="6">6</option>
              <option value="8">8</option>
              <option value="10">10</option>
            </select>
          </label>

          <label className={styles.fieldWide}>
            <div className={styles.label}>补充要求</div>
            <textarea className={styles.textarea} rows={3} placeholder="例如：增加人物动作细节、镜头运动、环境音等…" />
          </label>
        </div>

        <div className={styles.actions}>
          <button type="button" className={styles.generateButton}>
            生成分镜文本
          </button>
          <button type="button" className={styles.secondaryButton}>
            清空
          </button>
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <div className={styles.cardTitle}>生成结果</div>
          <div className={styles.cardHint}>展示版：后续接入真实生成能力</div>
        </div>

        <div className={styles.resultEmpty}>
          <div className={styles.resultIcon} aria-hidden="true" />
          <div className={styles.resultTitle}>尚未生成分镜文本</div>
          <div className={styles.resultDesc}>点击“生成分镜文本”后，这里将展示逐场景镜头与对白内容。</div>
        </div>
      </section>
    </main>
  )
}
