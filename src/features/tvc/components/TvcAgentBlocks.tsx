"use client"

import type { ReactElement } from "react"
import styles from "./TvcAgentBlocks.module.css"
import type { TvcAgentBlock, TvcAgentResponse, TvcAgentStep } from "@/features/tvc/agent/types"

function renderKvRows(entries: Array<{ key: string; value: string }>): ReactElement {
  return (
    <div className={styles.kvGrid}>
      {entries.map((kv, idx) => (
        <div key={`${kv.key}_${idx}`} className={styles.kvRow}>
          <div className={styles.kvKey} title={kv.key}>
            {kv.key}
          </div>
          <div className={styles.kvVal}>{kv.value}</div>
        </div>
      ))}
    </div>
  )
}

function StepCard({ step }: { step: TvcAgentStep }): ReactElement {
  const title = step.title?.trim() ? step.title.trim() : "步骤"
  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div className={styles.cardTitle}>{title}</div>
        {step.id ? <div className={styles.badge}>Step {step.id}</div> : null}
      </div>
      <div className={styles.cardBody}>
        {step.content.prompt ? (
          <>
            <div className={styles.sectionTitle}>提示</div>
            <div className={styles.textBlock}>{step.content.prompt}</div>
          </>
        ) : null}

        {step.content.sections?.length ? (
          <>
            <div className={styles.sectionTitle}>内容</div>
            {step.content.sections.map((s, idx) => (
              <div key={`${s.sectionName}_${idx}`}>
                <div className={styles.sectionTitle}>{s.sectionName}</div>
                {renderKvRows(s.fields.map((f) => ({ key: f.name, value: f.value })))}
              </div>
            ))}
          </>
        ) : null}

        {step.content.images?.length ? (
          <>
            <div className={styles.sectionTitle}>图片</div>
            <div className={styles.imageGrid}>
              {step.content.images.map((img, idx) => {
                const url = img.url ?? img.URL ?? img.href ?? ""
                const desc = img.description ?? ""
                const type = img.type ?? ""
                const category = img.category ?? ""
                return (
                  <div key={`${url || "img"}_${idx}`} className={styles.imageCard}>
                    {url ? <img className={styles.imageThumb} src={url} alt={desc || category || type || "image"} /> : <div />}
                    <div className={styles.imageMeta}>
                      {desc ? <div className={styles.imageMetaLine}>{desc}</div> : null}
                      {category ? <div className={styles.imageMetaLine}>分类：{category}</div> : null}
                      {type ? <div className={styles.imageMetaLine}>类型：{type}</div> : null}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        ) : null}

        {step.content.storyboards?.length ? (
          <>
            <div className={styles.sectionTitle}>分镜头</div>
            {step.content.storyboards.map((row, idx) => {
              const entries = Object.entries(row)
                .filter(([, v]) => String(v ?? "").trim())
                .map(([k, v]) => ({ key: k, value: String(v ?? "") }))
              return <div key={`sb_${idx}`}>{renderKvRows(entries)}</div>
            })}
          </>
        ) : null}

        {step.content.videoClips?.length ? (
          <>
            <div className={styles.sectionTitle}>视频片段</div>
            {step.content.videoClips.map((row, idx) => {
              const entries = Object.entries(row)
                .filter(([, v]) => String(v ?? "").trim())
                .map(([k, v]) => ({ key: k, value: String(v ?? "") }))
              return <div key={`vc_${idx}`}>{renderKvRows(entries)}</div>
            })}
          </>
        ) : null}
      </div>
    </div>
  )
}

function ResponseCard({
  response,
  onAction
}: {
  response: TvcAgentResponse
  onAction?: (command: string) => void
}): ReactElement {
  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div className={styles.cardTitle}>交互</div>
        <div className={styles.badge}>Response</div>
      </div>
      <div className={styles.cardBody}>
        <div className={styles.textBlock}>{response.text}</div>
        {response.actions.length ? (
          <div className={styles.actions}>
            {response.actions.map((a, idx) => (
              <button
                key={`${a.command}_${idx}`}
                type="button"
                className={`${styles.actionBtn} ${idx === 0 ? styles.actionBtnPrimary : ""}`}
                onClick={() => onAction?.(a.command)}
              >
                {a.command}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}

export function TvcAgentBlocks({
  blocks,
  onAction
}: {
  blocks: TvcAgentBlock[]
  onAction?: (command: string) => void
}): ReactElement {
  return (
    <div className={styles.wrap}>
      {blocks.map((b, idx) => {
        if (b.kind === "text") {
          return (
            <div key={`t_${idx}`} className={styles.textBlock}>
              {b.text}
            </div>
          )
        }
        if (b.kind === "step") {
          if (b.step) return <StepCard key={`s_${idx}`} step={b.step} />
          return (
            <div key={`s_${idx}`} className={styles.textBlock}>
              {b.raw}
            </div>
          )
        }
        if (b.kind === "response") {
          if (b.response) return <ResponseCard key={`r_${idx}`} response={b.response} onAction={onAction} />
          return (
            <div key={`r_${idx}`} className={styles.textBlock}>
              {b.raw}
            </div>
          )
        }
        return null
      })}
    </div>
  )
}

