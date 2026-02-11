"use client"

import { useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import styles from "./ShortDramaSetupPage.module.css"
import navStyles from "../workspace/components/shortDrama/ShortDramaStepsNav.module.css"
import { ShortDramaPanel } from "../workspace/components/shortDrama/ShortDramaPanel"
import type { ShortDramaStepKey } from "../workspace/components/shortDrama/ShortDramaStepsNav"
import { ShortDramaStepsNav } from "../workspace/components/shortDrama/ShortDramaStepsNav"
import type { ApiErr, ApiOk } from "@/shared/api"
import { buildOutlineStoryTextFromShortDrama } from "../workspace/api/shortDrama"

type ShortDramaSetupPageProps = Readonly<{
  storyId: string
  storyMetadata?: Record<string, unknown>
  hasOutlines?: boolean
  storyConfig: {
    title: string
    ratio: string
    resolution: string
    style: string
  }
}>

function isShortDramaReady(shortDrama: any): boolean {
  if (!shortDrama || typeof shortDrama !== "object") return false
  if (!(shortDrama as any).planningResult) return false
  if (!(shortDrama as any).worldSetting) return false
  if (!(shortDrama as any).characterSetting) return false
  return true
}

export function ShortDramaSetupPage({ storyId, storyMetadata, hasOutlines: hasOutlinesProp, storyConfig }: ShortDramaSetupPageProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = searchParams.get("next") || ""

  const [shortDrama, setShortDrama] = useState<any>(() => (storyMetadata as any)?.shortDrama ?? {})
  const [activeStep, setActiveStep] = useState<ShortDramaStepKey>("planning")
  const ready = useMemo(() => isShortDramaReady(shortDrama), [shortDrama])
  const planningOk = Boolean(shortDrama && typeof shortDrama === "object" && (shortDrama as any).planningResult)
  const confirmed = Boolean(
    shortDrama &&
      typeof shortDrama === "object" &&
      (typeof (shortDrama as any).planningConfirmedAt === "number" || isShortDramaReady(shortDrama))
  )
  const worldOk = Boolean(confirmed && shortDrama && typeof shortDrama === "object" && (shortDrama as any).worldSetting)
  const characterOk = Boolean(confirmed && shortDrama && typeof shortDrama === "object" && (shortDrama as any).characterSetting)
  const [generating, setGenerating] = useState(false)
  const [errorText, setErrorText] = useState<string | null>(null)
  const [hasOutlines, setHasOutlines] = useState(Boolean(hasOutlinesProp))

  const continueUrl = (() => {
    if (next && next.startsWith("/")) return next
    return `/script/workspace/${encodeURIComponent(storyId)}?mode=brief`
  })()

  const gotoOutline = async () => {
    if (generating) return
    if (hasOutlines) {
      router.push(continueUrl)
      return
    }
    if (!ready) return
    setGenerating(true)
    setErrorText(null)
    try {
      const story_text = buildOutlineStoryTextFromShortDrama({
        planningResult: (shortDrama as any).planningResult,
        worldSetting: (shortDrama as any).worldSetting,
        characterSetting: (shortDrama as any).characterSetting,
        maxBytes: 49_000
      })
      const res = await fetch("/api/coze/storyboard/generate-outline", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          storyId,
          input_type: "brief",
          story_text,
          title: storyConfig.title,
          ratio: storyConfig.ratio,
          resolution: storyConfig.resolution,
          style: storyConfig.style
        })
      })
      const json = (await res.json().catch(() => null)) as ApiOk<unknown> | ApiErr | null
      if (!res.ok || !json || (json as ApiErr).ok === false) {
        const errJson = (json as ApiErr | null) ?? null
        setErrorText(errJson?.error?.message ?? "生成大纲失败，请稍后重试")
        return
      }
      setHasOutlines(true)
      router.push(continueUrl)
    } catch (e) {
      const anyErr = e as { message?: string }
      setErrorText(anyErr?.message ?? "网络异常，请稍后重试")
    } finally {
      setGenerating(false)
    }
  }

  const onRegenerateOutline = async () => {
    if (!ready || generating) return
    setGenerating(true)
    setErrorText(null)
    try {
      const story_text = buildOutlineStoryTextFromShortDrama({
        planningResult: (shortDrama as any).planningResult,
        worldSetting: (shortDrama as any).worldSetting,
        characterSetting: (shortDrama as any).characterSetting,
        maxBytes: 49_000
      })
      const res = await fetch("/api/coze/storyboard/generate-outline", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          storyId,
          input_type: "brief",
          story_text,
          title: storyConfig.title,
          ratio: storyConfig.ratio,
          resolution: storyConfig.resolution,
          style: storyConfig.style
        })
      })
      const json = (await res.json().catch(() => null)) as ApiOk<unknown> | ApiErr | null
      if (!res.ok || !json || (json as ApiErr).ok === false) {
        const errJson = (json as ApiErr | null) ?? null
        setErrorText(errJson?.error?.message ?? "重新生成大纲失败，请稍后重试")
        return
      }
      setHasOutlines(true)
      router.push(continueUrl)
    } catch (e) {
      const anyErr = e as { message?: string }
      setErrorText(anyErr?.message ?? "网络异常，请稍后重试")
    } finally {
      setGenerating(false)
    }
  }

  const outlineDisabled = generating || (!hasOutlines && !ready)
  const outlineBadge = generating ? "生成中…" : hasOutlines ? "已生成" : ready ? "未生成" : "待完善"
  const outlineBadgeClass = outlineBadge === "已生成" ? navStyles.badgeOk : navStyles.badgeMuted

  return (
    <main className={styles.container}>
      <section className={styles.layout} aria-label="短剧信息布局">
        <aside className={styles.rail} aria-label="创作流程">
          <div className={styles.card}>
            <div className={styles.cardTitle}>剧本信息</div>
            <div className={styles.flowList}>
              <ShortDramaStepsNav
                shortDrama={shortDrama}
                active={activeStep}
                onChange={setActiveStep}
                extraItems={
                  <button type="button" className={navStyles.navItem} disabled={outlineDisabled} onClick={gotoOutline}>
                    <div className={navStyles.navRow}>
                      <div className={navStyles.navTitle}>剧本大纲</div>
                      <div className={outlineBadgeClass}>{outlineBadge}</div>
                    </div>
                    <div className={navStyles.navDesc}>{hasOutlines ? "已生成可查看" : ready ? "生成后进入" : "需先完成短剧信息"}</div>
                  </button>
                }
              />
            </div>
          </div>
        </aside>

        <section className={styles.panelCard} aria-label="短剧信息编辑">
          <ShortDramaPanel
            storyId={storyId}
            shortDrama={shortDrama}
            onShortDramaUpdate={setShortDrama}
            showNav={false}
            active={activeStep}
            onActiveChange={setActiveStep}
          />
        </section>

        <aside className={styles.rail} aria-label="检查清单与操作">
          <div className={styles.card}>
            <div className={styles.cardTitle}>前置条件</div>
            <div className={styles.kv}>
              <div className={styles.kvRow}>
                <div className={styles.kvKey}>剧本策划</div>
                <div className={styles.kvVal}>{planningOk ? "已生成" : "未生成"}</div>
              </div>
              <div className={styles.kvRow}>
                <div className={styles.kvKey}>策划确认</div>
                <div className={styles.kvVal}>{confirmed ? "已确认" : "未确认"}</div>
              </div>
              <div className={styles.kvRow}>
                <div className={styles.kvKey}>世界观设定</div>
                <div className={styles.kvVal}>{worldOk ? "已生成" : "未生成"}</div>
              </div>
              <div className={styles.kvRow}>
                <div className={styles.kvKey}>角色设定</div>
                <div className={styles.kvVal}>{characterOk ? "已生成" : "未生成"}</div>
              </div>
            </div>
          </div>

          <div className={styles.card}>
            <div className={styles.cardTitle}>故事配置</div>
            <div className={styles.kv}>
              <div className={styles.kvRow}>
                <div className={styles.kvKey}>标题</div>
                <div className={styles.kvVal}>{storyConfig.title?.trim() ? storyConfig.title.trim() : "—"}</div>
              </div>
              <div className={styles.kvRow}>
                <div className={styles.kvKey}>比例</div>
                <div className={styles.kvVal}>{storyConfig.ratio}</div>
              </div>
              <div className={styles.kvRow}>
                <div className={styles.kvKey}>分辨率</div>
                <div className={styles.kvVal}>{storyConfig.resolution}</div>
              </div>
              <div className={styles.kvRow}>
                <div className={styles.kvKey}>画风</div>
                <div className={styles.kvVal}>{storyConfig.style}</div>
              </div>
            </div>
          </div>

          <div className={styles.card}>
            <div className={styles.cardTitle}>操作</div>
            <div className={styles.actionStack}>
              {errorText ? <div className={styles.error}>{errorText}</div> : null}
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={() => router.push(`/script/workspace/${encodeURIComponent(storyId)}?mode=brief`)}
              >
                返回工作台
              </button>
              <button type="button" className={styles.secondaryBtn} disabled={!ready || generating || !hasOutlines} onClick={onRegenerateOutline}>
                重新生成大纲
              </button>
              <button type="button" className={styles.primaryBtn} disabled={outlineDisabled} onClick={gotoOutline}>
                {generating ? "生成中…" : hasOutlines ? "进入大纲" : "继续下一步"}
              </button>
            </div>
          </div>
        </aside>
      </section>
    </main>
  )
}
