"use client"

import { useCallback, useEffect, useMemo, useRef, type ReactElement } from "react"
import styles from "./StyleVibePanel.module.css"
import type { TvcStepId, VibeStyleCard } from "@/features/tvc/types"
import type { TvcAgentStep } from "@/features/tvc/agent/types"

const steps: Array<{ id: TvcStepId; label: string }> = [
  { id: "step-0", label: "需求分析与产品确认" },
  { id: "step-1", label: "产品分镜设计" },
  { id: "step-2", label: "产品参考图生成" },
  { id: "step-3", label: "产品分镜脚本书写" },
  { id: "step-4", label: "首帧画面生成" },
  { id: "step-5", label: "视频生成" }
]

export function StyleVibePanel({
  activeStep,
  onStepChange,
  onNeedMoreStyles,
  durationSec,
  agentStepByCanvasId
}: {
  activeStep: TvcStepId
  onStepChange: (id: TvcStepId) => void
  selectedStyleId: string
  onSelectStyle: (id: string) => void
  onNeedMoreStyles: () => void
  brief: string
  setBrief: (v: string) => void
  durationSec: number
  setDurationSec: (v: number) => void
  onGenerateShotlist: () => void
  isGeneratingShotlist: boolean
  agentStepByCanvasId?: Partial<Record<TvcStepId, TvcAgentStep>>
}): ReactElement {
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const sectionElsRef = useRef<Partial<Record<TvcStepId, HTMLElement | null>>>({})


  const registerSection = useCallback((id: TvcStepId) => {
    return (el: HTMLElement | null) => {
      sectionElsRef.current[id] = el
    }
  }, [])

  const scrollTo = useCallback(
    (id: TvcStepId) => {
      const el = sectionElsRef.current[id]
      if (!el) return
      el.scrollIntoView({ behavior: "smooth", block: "start" })
      onStepChange(id)
    },
    [onStepChange]
  )

  useEffect(() => {
    const root = canvasRef.current
    if (!root) return

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting)
        if (visible.length === 0) return
        visible.sort((a, b) => {
          const ratio = b.intersectionRatio - a.intersectionRatio
          if (ratio !== 0) return ratio
          return a.boundingClientRect.top - b.boundingClientRect.top
        })
        const top = visible[0]
        const id = (top.target as HTMLElement).dataset.stepId as TvcStepId | undefined
        if (!id) return
        if (id !== activeStep) onStepChange(id)
      },
      { root, threshold: [0.2, 0.35, 0.5, 0.65], rootMargin: "-12% 0px -70% 0px" }
    )

    const visibleSteps = steps.filter((s) => Boolean(agentStepByCanvasId?.[s.id]))
    for (const s of visibleSteps) {
      const el = sectionElsRef.current[s.id]
      if (el) observer.observe(el)
    }

    return () => observer.disconnect()
  }, [activeStep, onStepChange, agentStepByCanvasId])

  const renderAgentStep = (step: TvcAgentStep): ReactElement => {
    const prompt = step.content.prompt?.trim() ?? ""
    const sections = step.content.sections ?? []
    const images = step.content.images ?? []
    const storyboards = step.content.storyboards ?? []
    const videoClips = step.content.videoClips ?? []

    return (
      <div className={styles.agentWrap}>
        {step.title?.trim() ? <div className={styles.agentTitle}>{step.title.trim()}</div> : null}
        {prompt ? <div className={styles.agentPrompt}>{prompt}</div> : null}

        {sections.length ? (
          <div className={styles.agentGroup}>
            {sections.map((s, idx) => (
              <div key={`${s.sectionName}_${idx}`} className={styles.agentSection}>
                <div className={styles.agentGroupTitle}>{s.sectionName}</div>
                <div className={styles.agentKvGrid}>
                  {s.fields.map((f, i) => (
                    <div key={`${f.name}_${i}`} className={styles.agentKvRow}>
                      <div className={styles.agentKvKey} title={f.name}>
                        {f.name}
                      </div>
                      <div className={styles.agentKvVal}>{f.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {images.length ? (
          <div className={styles.agentGroup}>
            <div className={styles.agentGroupTitle}>图片</div>
            <div className={styles.agentImageGrid}>
              {images.map((img, idx) => {
                const url = img.url ?? img.URL ?? img.href ?? ""
                const desc = img.description ?? img.prompt ?? img.PROMPT ?? ""
                const type = img.type ?? ""
                const category = img.category ?? ""
                return (
                  <div key={`${url || "img"}_${idx}`} className={styles.agentImageCard}>
                    {url ? <img className={styles.agentImageThumb} src={url} alt={desc || category || type || "image"} /> : <div />}
                    <div className={styles.agentImageMeta}>
                      {desc ? <div className={styles.agentImageLine}>{desc}</div> : null}
                      {category ? <div className={styles.agentImageLine}>分类：{category}</div> : null}
                      {type ? <div className={styles.agentImageLine}>类型：{type}</div> : null}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ) : null}

        {storyboards.length ? (
          <div className={styles.agentGroup}>
            <div className={styles.agentGroupTitle}>分镜</div>
            <div className={styles.agentTable}>
              {storyboards.map((row, idx) => (
                <div key={`sb_${idx}`} className={styles.agentTableRow}>
                  {Object.entries(row)
                    .filter(([, v]) => String(v ?? "").trim())
                    .map(([k, v]) => (
                      <div key={`${k}_${idx}`} className={styles.agentKvRow}>
                        <div className={styles.agentKvKey} title={k}>
                          {k}
                        </div>
                        <div className={styles.agentKvVal}>{String(v ?? "")}</div>
                      </div>
                    ))}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {videoClips.length ? (
          <div className={styles.agentGroup}>
            <div className={styles.agentGroupTitle}>视频片段</div>
            <div className={styles.agentTable}>
              {videoClips.map((row, idx) => (
                <div key={`vc_${idx}`} className={styles.agentTableRow}>
                  {Object.entries(row)
                    .filter(([, v]) => String(v ?? "").trim())
                    .map(([k, v]) => (
                      <div key={`${k}_${idx}`} className={styles.agentKvRow}>
                        <div className={styles.agentKvKey} title={k}>
                          {k}
                        </div>
                        <div className={styles.agentKvVal}>{String(v ?? "")}</div>
                      </div>
                    ))}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    )
  }

  const renderSectionContent = (id: TvcStepId): ReactElement => {
    const agentStep = agentStepByCanvasId?.[id]
    if (agentStep) return renderAgentStep(agentStep)

    return (
      <div className={styles.placeholder}>
        <div className={styles.placeholderText}>等待智能体输出该步骤内容。你也可以在右侧对话框中补充或修改需求。</div>
        <button type="button" className={styles.needAction} onClick={onNeedMoreStyles}>
          Tell Me in the Chat
        </button>
      </div>
    )
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.title}>Style & Vibe</div>
        <div className={styles.badge}>Beta</div>
      </div>

      <div className={styles.layout}>
        <div className={styles.navHost} aria-label="TVC 流程步骤">
          <div className={styles.navTrigger} aria-hidden="true" />
          <div className={styles.navPopover}>
            <div className={styles.nav}>
              {steps.map((s) => {
                const isActive = s.id === activeStep
                const hasContent = Boolean(agentStepByCanvasId?.[s.id])
                return (
                  <button
                    key={s.id}
                    type="button"
                    className={`${styles.step} ${isActive ? styles.stepActive : ""} ${hasContent ? "" : styles.stepDisabled}`}
                    onClick={() => {
                      if (!hasContent) return
                      scrollTo(s.id)
                    }}
                    disabled={!hasContent}
                  >
                    <span className={styles.stepLeft}>
                      <span className={`${styles.dot} ${isActive ? styles.dotActive : ""}`} aria-hidden="true" />
                      <span className={styles.stepLabel}>{s.label}</span>
                    </span>
                    <span aria-hidden="true">›</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <div className={styles.canvas} aria-label="画布" ref={canvasRef}>
          {steps
            .filter((s) => Boolean(agentStepByCanvasId?.[s.id]))
            .map((s) => (
              <section key={s.id} className={styles.section} data-step-id={s.id} ref={registerSection(s.id)}>
                <div className={styles.sectionHeader}>
                  <div className={styles.sectionTitle}>{s.label}</div>
                  {s.id === "step-1" || s.id === "step-3" ? <div className={styles.sectionMeta}>{durationSec}s</div> : null}
                </div>
                <div className={styles.sectionBody}>{renderSectionContent(s.id)}</div>
              </section>
            ))}
        </div>
      </div>
    </div>
  )
}
