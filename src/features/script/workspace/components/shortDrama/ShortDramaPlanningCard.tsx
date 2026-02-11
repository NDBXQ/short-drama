"use client"

import { useEffect, useMemo, useState } from "react"
import styles from "./ShortDramaPlanningCard.module.css"
import { callShortDramaCharacterSettings, callShortDramaWorldSetting, patchStoryShortDramaMetadata } from "../../api/shortDrama"
import { DurationRangeField, RangeField, Section, SmallField, TextField } from "./ShortDramaPlanningFields"
import { cloneJson, sanitizeGenres, toText, unwrapCharacterSettings, unwrapPlanningResult } from "./shortDramaPlanningModel"

type ShortDramaPlanningCardProps = Readonly<{
  storyId: string
  planningResult: any
  worldSetting: any
  characterSetting: any
  planningConfirmedAt?: number
  onSaved?: (nextPlanningResult: any) => void
  onShortDramaUpdate?: (next: any) => void
}>

export function ShortDramaPlanningCard({
  storyId,
  planningResult,
  worldSetting,
  characterSetting,
  planningConfirmedAt,
  onSaved,
  onShortDramaUpdate
}: ShortDramaPlanningCardProps) {
  const hasGeneratedSettings = Boolean(worldSetting && characterSetting)
  const normalized = useMemo(() => unwrapPlanningResult(planningResult), [planningResult])
  const [draft, setDraft] = useState<any>(() => {
    const inner = normalized.inner && typeof normalized.inner === "object" ? normalized.inner : {}
    return cloneJson(inner)
  })
  const [snapshot, setSnapshot] = useState<any>(() => cloneJson(draft))
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [errorText, setErrorText] = useState<string | null>(null)
  const [genreDraft, setGenreDraft] = useState("")
  const [generateErrorText, setGenerateErrorText] = useState<string | null>(null)

  useEffect(() => {
    if (editing || saving || generating) return
    const next = normalized.inner && typeof normalized.inner === "object" ? cloneJson(normalized.inner) : {}
    setDraft(next)
    setSnapshot(cloneJson(next))
  }, [editing, generating, normalized.inner, saving])

  const themeModule = (draft?.theme_module && typeof draft.theme_module === "object" ? draft.theme_module : {}) as any
  const coverModule = (draft?.cover_module && typeof draft.cover_module === "object" ? draft.cover_module : {}) as any
  const parameterModule = (draft?.parameter_module && typeof draft.parameter_module === "object" ? draft.parameter_module : {}) as any
  const coreReq = (themeModule?.core_requirements && typeof themeModule.core_requirements === "object" ? themeModule.core_requirements : {}) as any

  const genres = sanitizeGenres(themeModule?.genres)
  const scriptName = toText(themeModule?.script_name).trim()
  const frequencyType = toText(themeModule?.frequency_type).trim()
  const outputLanguage = toText(themeModule?.output_language).trim()

  const updateTheme = (patch: Record<string, unknown>) => {
    setDraft((prev: any) => {
      const prevObj = prev && typeof prev === "object" ? prev : {}
      const tm = (prevObj as any).theme_module
      const tmObj = tm && typeof tm === "object" ? tm : {}
      return { ...prevObj, theme_module: { ...tmObj, ...patch } }
    })
  }

  const updateCore = (patch: Record<string, unknown>) => {
    setDraft((prev: any) => {
      const prevObj = prev && typeof prev === "object" ? prev : {}
      const tm = (prevObj as any).theme_module
      const tmObj = tm && typeof tm === "object" ? tm : {}
      const cr = (tmObj as any).core_requirements
      const crObj = cr && typeof cr === "object" ? cr : {}
      return { ...prevObj, theme_module: { ...tmObj, core_requirements: { ...crObj, ...patch } } }
    })
  }

  const updateCover = (patch: Record<string, unknown>) => {
    setDraft((prev: any) => {
      const prevObj = prev && typeof prev === "object" ? prev : {}
      const cm = (prevObj as any).cover_module
      const cmObj = cm && typeof cm === "object" ? cm : {}
      return { ...prevObj, cover_module: { ...cmObj, ...patch } }
    })
  }

  const updateParams = (patch: Record<string, unknown>) => {
    setDraft((prev: any) => {
      const prevObj = prev && typeof prev === "object" ? prev : {}
      const pm = (prevObj as any).parameter_module
      const pmObj = pm && typeof pm === "object" ? pm : {}
      return { ...prevObj, parameter_module: { ...pmObj, ...patch } }
    })
  }

  const removeGenre = (idx: number) => updateTheme({ genres: genres.filter((_, i) => i !== idx) })

  const addGenres = () => {
    const raw = genreDraft.trim()
    if (!raw) return
    const parts = raw
      .split(/[,，、\n]/g)
      .map((s) => s.trim())
      .filter(Boolean)
    updateTheme({ genres: sanitizeGenres([...genres, ...parts]) })
    setGenreDraft("")
  }

  const buildPlanningResultForSave = (innerPlanning: any): any => {
    if (normalized.wrapper === "wrapped" && normalized.original && typeof normalized.original === "object") {
      return { ...(normalized.original as any), planning_result: innerPlanning }
    }
    return innerPlanning
  }

  const sanitizeDraftInner = (): any => {
    const inner = draft && typeof draft === "object" ? cloneJson(draft) : {}
    const tm = (inner as any).theme_module
    if (tm && typeof tm === "object") (tm as any).genres = sanitizeGenres((tm as any).genres)

    const clampInt = (v: unknown, min: number, max: number, fallback?: number): number | undefined => {
      const n = Number(v)
      const base = Number.isFinite(n) ? Math.trunc(n) : fallback
      if (base === undefined) return undefined
      if (base < min) return min
      if (base > max) return max
      return base
    }

    const snapInt = (v: unknown, step: number, min: number, max: number, fallback?: number): number | undefined => {
      const n = Number(v)
      const base = Number.isFinite(n) ? n : fallback
      if (base === undefined) return undefined
      const snapped = Math.round(base / step) * step
      return clampInt(snapped, min, max)
    }

    const pm = (inner as any).parameter_module
    const pmObj = pm && typeof pm === "object" ? pm : {}
    const duration = (pmObj as any).single_episode_duration
    const durationObj = duration && typeof duration === "object" ? duration : {}

    ;(inner as any).parameter_module = {
      ...pmObj,
      total_episodes: clampInt((pmObj as any).total_episodes, 40, 150, 60),
      dialogue_word_ratio: clampInt((pmObj as any).dialogue_word_ratio, 30, 60, 40),
      main_characters_limit: clampInt((pmObj as any).main_characters_limit, 1, 10, 10),
      scenes_per_episode_limit: clampInt((pmObj as any).scenes_per_episode_limit, 1, 10, 3),
      word_limit_per_episode: snapInt((pmObj as any).word_limit_per_episode, 50, 500, 2000, 600),
      single_episode_duration: {
        ...durationObj,
        min: clampInt((durationObj as any).min, 1, 5, 3),
        max: clampInt((durationObj as any).max, 1, 5, 4),
        unit: typeof (durationObj as any).unit === "string" && (durationObj as any).unit.trim() ? (durationObj as any).unit : "分钟"
      }
    }
    return inner
  }

  const triggerAllCharacterImageGeneration = async (nextCharacterSetting: unknown): Promise<void> => {
    const normalizedCharacters = unwrapCharacterSettings(nextCharacterSetting)
    const inner = normalizedCharacters.inner && typeof normalizedCharacters.inner === "object" ? normalizedCharacters.inner : {}
    const characters = Array.isArray((inner as any).characters) ? (inner as any).characters : []
    if (!characters.length) return

    const pickText = (v: unknown) => String(v ?? "").trim()
    const shrink = (s: string, max = 800) => (s.length > max ? s.slice(0, max) : s)
    const buildPrompt = (ch: any, index: number) => {
      const name = pickText(ch?.character_name ?? ch?.characterName ?? ch?.name) || `角色${index + 1}`
      if (/^旁白$/u.test(name) || /^narrator$/i.test(name)) return null

      const type = pickText(ch?.character_type ?? ch?.characterType ?? ch?.type)
      const age = pickText(ch?.age)
      const occupation = pickText(ch?.occupation)
      const appearance = pickText(ch?.appearance)
      const physique = pickText(ch?.physique)
      const hairstyle = pickText(ch?.hairstyle)
      const clothing = pickText(ch?.clothing)

      const lines: string[] = []
      lines.push("请生成一张写实影视剧角色设定图。")
      lines.push(`角色姓名：${shrink(name, 60)}。`)
      if (type) lines.push(`角色类型：${shrink(type, 60)}。`)
      if (age) lines.push(`年龄：${shrink(age, 40)}。`)
      if (occupation) lines.push(`职业：${shrink(occupation, 120)}。`)
      if (appearance) lines.push(`相貌：${shrink(appearance)}。`)
      if (physique) lines.push(`体格：${shrink(physique)}。`)
      if (hairstyle) lines.push(`发型：${shrink(hairstyle)}。`)
      if (clothing) lines.push(`服装：${shrink(clothing)}。`)
      lines.push("要求：单人，人物主体清晰，构图干净，电影级光影，高清细节，背景简洁，不要文字、水印、logo，避免多人同框。")

      return { name, prompt: lines.join("\n") }
    }

    const prompts = characters.map(buildPrompt).filter(Boolean).slice(0, 50) as Array<{ name: string; prompt: string }>
    if (prompts.length === 0) return
    const res = await fetch("/api/video-creation/images/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        storyId,
        async: true,
        forceRegenerate: false,
        prompts: prompts.map((p) => ({ name: p.name, prompt: p.prompt, category: "role" }))
      })
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
  }

  const extractGenerationInputs = (innerPlanning: any): {
    genres: string[]
    worldview_setting: string
    core_conflict: string
    protagonist_setting: string
  } => {
    const theme = innerPlanning?.theme_module ?? {}
    const rawGenres = Array.isArray(theme?.genres) ? theme.genres : []
    const genres = sanitizeGenres(rawGenres)
    const core = theme?.core_requirements ?? {}
    const worldview_setting = typeof core?.worldview_setting === "string" ? core.worldview_setting : ""
    const core_conflict = typeof core?.core_conflict === "string" ? core.core_conflict : ""
    const protagonist_setting = typeof core?.protagonist_setting === "string" ? core.protagonist_setting : ""
    return { genres, worldview_setting, core_conflict, protagonist_setting }
  }

  const onEditClick = () => {
    setSnapshot(cloneJson(draft))
    setErrorText(null)
    setEditing(true)
  }

  const onCancelClick = () => {
    setDraft(cloneJson(snapshot))
    setErrorText(null)
    setEditing(false)
    setGenreDraft("")
  }

  const onSaveClick = async () => {
    if (saving) return
    setSaving(true)
    setErrorText(null)
    try {
      const sanitizedInner = sanitizeDraftInner()
      const nextPlanningResult = buildPlanningResultForSave(sanitizedInner)
      await patchStoryShortDramaMetadata(storyId, { planningResult: nextPlanningResult, worldSetting: null, characterSetting: null })
      setSnapshot(cloneJson(sanitizedInner))
      setEditing(false)
      setGenreDraft("")
      onSaved?.(nextPlanningResult)
    } catch (e) {
      const anyErr = e as { message?: string }
      setErrorText(anyErr?.message ?? "保存失败，请稍后重试")
    } finally {
      setSaving(false)
    }
  }

  const onConfirmAndGenerate = async () => {
    if (saving || generating) return
    setGenerateErrorText(null)
    setGenerating(true)
    const confirmedAt = Date.now()
    try {
      const sanitizedInner = sanitizeDraftInner()
      const nextPlanningResult = buildPlanningResultForSave(sanitizedInner)

      await patchStoryShortDramaMetadata(storyId, {
        planningResult: nextPlanningResult,
        worldSetting,
        characterSetting,
        planningConfirmedAt: confirmedAt
      })
      onShortDramaUpdate?.({ planningResult: nextPlanningResult, worldSetting, characterSetting, planningConfirmedAt: confirmedAt })
      onSaved?.(nextPlanningResult)

      const inputs = extractGenerationInputs(sanitizedInner)
      const [nextWorldSetting, nextCharacterSetting] = await Promise.all([
        callShortDramaWorldSetting({ genres: inputs.genres, worldview_setting: inputs.worldview_setting, core_conflict: inputs.core_conflict }),
        callShortDramaCharacterSettings({
          genres: inputs.genres,
          worldview_setting: inputs.worldview_setting,
          core_conflict: inputs.core_conflict,
          protagonist_setting: inputs.protagonist_setting
        })
      ])

      await patchStoryShortDramaMetadata(storyId, {
        planningResult: nextPlanningResult,
        worldSetting: nextWorldSetting,
        characterSetting: nextCharacterSetting,
        planningConfirmedAt: confirmedAt
      })

      setSnapshot(cloneJson(sanitizedInner))
      setEditing(false)
      setGenreDraft("")
      onShortDramaUpdate?.({
        planningResult: nextPlanningResult,
        worldSetting: nextWorldSetting,
        characterSetting: nextCharacterSetting,
        planningConfirmedAt: confirmedAt
      })

      triggerAllCharacterImageGeneration(nextCharacterSetting).catch(() => null)
    } catch (e) {
      const anyErr = e as { message?: string }
      setGenerateErrorText(anyErr?.message ?? "生成失败，请稍后重试")
    } finally {
      setGenerating(false)
    }
  }

  const duration = (parameterModule?.single_episode_duration && typeof parameterModule.single_episode_duration === "object"
    ? parameterModule.single_episode_duration
    : {}) as any

  const getInt = (v: any, fallback: number): number => {
    const n = Number(v)
    if (!Number.isFinite(n)) return fallback
    return Math.trunc(n)
  }

  const clampInt = (v: number, min: number, max: number): number => {
    if (v < min) return min
    if (v > max) return max
    return Math.trunc(v)
  }

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <div className={styles.headerMain}>
          <div className={styles.title}>{scriptName || "未命名短剧"}</div>
          <div className={styles.subTitle}>
            {frequencyType ? `频类型：${frequencyType}` : ""}
            {frequencyType && outputLanguage ? " · " : ""}
            {outputLanguage ? `语言：${outputLanguage}` : ""}
          </div>
        </div>
        <div className={styles.headerActions}>
          {editing ? (
            <>
              <button type="button" className={styles.secondaryBtn} onClick={onCancelClick} disabled={saving}>
                取消
              </button>
              <button type="button" className={styles.primaryBtn} onClick={onSaveClick} disabled={saving}>
                {saving ? "保存中…" : "保存"}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={onConfirmAndGenerate}
                disabled={generating || saving || !planningResult}
              >
                {generating ? "生成中…" : planningConfirmedAt || hasGeneratedSettings ? "重新生成设定" : "确认策划并生成设定"}
              </button>
              <button type="button" className={styles.primaryBtn} onClick={onEditClick} disabled={generating || saving}>
                编辑
              </button>
            </>
          )}
        </div>
      </div>

      {errorText ? <div className={styles.error}>{errorText}</div> : null}
      {generateErrorText ? <div className={styles.error}>{generateErrorText}</div> : null}

      <div className={styles.briefLayout}>
        <div className={styles.col} aria-label="基础信息">
          <div className={styles.meta}>
            <div className={styles.metaLabel}>题材</div>
            <div className={styles.metaValue}>
              <div className={styles.chips}>
                {genres.length ? (
                  genres.map((g, idx) => (
                    <span key={`${g}_${idx}`} className={styles.chip}>
                      <span className={styles.chipText}>{g}</span>
                      {editing ? (
                        <button type="button" className={styles.chipRemove} onClick={() => removeGenre(idx)} aria-label={`移除题材 ${g}`}>
                          ×
                        </button>
                      ) : null}
                    </span>
                  ))
                ) : (
                  <span className={styles.placeholder}>—</span>
                )}
              </div>
              {editing ? (
                <div className={styles.genreEditor}>
                  <input
                    className={styles.input}
                    value={genreDraft}
                    placeholder="输入题材，回车或点击添加（支持逗号分隔）"
                    onChange={(e) => setGenreDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        addGenres()
                      }
                    }}
                  />
                  <button type="button" className={styles.secondaryBtn} onClick={addGenres} disabled={!genreDraft.trim()}>
                    添加
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          <Section title="主题">
            <SmallField label="剧名" value={toText(themeModule?.script_name)} editing={editing} placeholder="请输入剧名" onChange={(v) => updateTheme({ script_name: v })} />
            <SmallField
              label="频类型"
              value={toText(themeModule?.frequency_type)}
              editing={editing}
              placeholder="如：男频/女频"
              onChange={(v) => updateTheme({ frequency_type: v })}
            />
            <SmallField
              label="语言"
              value={toText(themeModule?.output_language)}
              editing={editing}
              placeholder="如：中文"
              onChange={(v) => updateTheme({ output_language: v })}
            />
            <TextField label="主题概述" value={toText(themeModule?.theme)} editing={editing} rows={4} onChange={(v) => updateTheme({ theme: v })} />
          </Section>

          <Section title="核心设定">
            <TextField label="核心冲突" value={toText(coreReq?.core_conflict)} editing={editing} rows={4} onChange={(v) => updateCore({ core_conflict: v })} />
            <TextField label="世界观设定" value={toText(coreReq?.worldview_setting)} editing={editing} rows={4} onChange={(v) => updateCore({ worldview_setting: v })} />
            <TextField label="主角设定" value={toText(coreReq?.protagonist_setting)} editing={editing} rows={4} onChange={(v) => updateCore({ protagonist_setting: v })} />
            <TextField label="叙事风格" value={toText(coreReq?.narrative_style)} editing={editing} rows={3} onChange={(v) => updateCore({ narrative_style: v })} />
            <TextField label="短剧适配要点" value={toText(coreReq?.short_drama_adaptation)} editing={editing} rows={3} onChange={(v) => updateCore({ short_drama_adaptation: v })} />
          </Section>
        </div>

        <div className={styles.col} aria-label="参数">
          <RangeField
            label="总集数"
            unit="集"
            value={getInt(parameterModule?.total_episodes, 60)}
            editing={editing}
            min={40}
            max={150}
            onChange={(v) => updateParams({ total_episodes: clampInt(v, 40, 150) })}
          />
          <RangeField
            label="对白占比"
            unit="%"
            value={getInt(parameterModule?.dialogue_word_ratio, 40)}
            editing={editing}
            min={30}
            max={60}
            onChange={(v) => updateParams({ dialogue_word_ratio: clampInt(v, 30, 60) })}
          />
          <RangeField
            label="主要角色上限"
            unit="人"
            value={getInt(parameterModule?.main_characters_limit, 10)}
            editing={editing}
            min={1}
            max={10}
            onChange={(v) => updateParams({ main_characters_limit: clampInt(v, 1, 10) })}
          />
          <RangeField
            label="单集场景上限"
            unit="场"
            value={getInt(parameterModule?.scenes_per_episode_limit, 3)}
            editing={editing}
            min={1}
            max={10}
            onChange={(v) => updateParams({ scenes_per_episode_limit: clampInt(v, 1, 10) })}
          />
          <RangeField
            label="单集字数上限"
            unit="字"
            value={getInt(parameterModule?.word_limit_per_episode, 600)}
            editing={editing}
            min={500}
            max={2000}
            step={50}
            onChange={(v) => updateParams({ word_limit_per_episode: clampInt(v, 500, 2000) })}
          />
          <DurationRangeField
            unit={toText(duration?.unit) || "分钟"}
            minValue={getInt(duration?.min, 3)}
            maxValue={getInt(duration?.max, 4)}
            editing={editing}
            min={1}
            max={5}
            onChange={(next) => {
              updateParams({ single_episode_duration: { ...duration, min: clampInt(next.min, 1, 5), max: clampInt(next.max, 1, 5), unit: toText(duration?.unit) || "分钟" } })
            }}
          />
        </div>

        <div className={styles.col} aria-label="封面预览">
          <div className={styles.coverPreview}>
            <div className={styles.coverTitle}>封面预览</div>
            <div className={styles.coverCard}>
              <div className={styles.coverName}>{scriptName || "未命名短剧"}</div>
              <div className={styles.coverMeta}>{toText(coverModule?.visual_style).trim() ? `风格：${toText(coverModule?.visual_style).trim()}` : "风格：—"}</div>
              <div className={styles.coverMeta}>{toText(coverModule?.protagonist_image).trim() ? `主角：${toText(coverModule?.protagonist_image).trim()}` : "主角：—"}</div>
              <div className={styles.coverMeta}>
                {toText(coverModule?.background_environment).trim() ? `背景：${toText(coverModule?.background_environment).trim()}` : "背景：—"}
              </div>
            </div>
          </div>

          <Section title="封面方向">
            <TextField label="标题设计" value={toText(coverModule?.title_design)} editing={editing} rows={3} onChange={(v) => updateCover({ title_design: v })} />
            <TextField label="视觉风格" value={toText(coverModule?.visual_style)} editing={editing} rows={3} onChange={(v) => updateCover({ visual_style: v })} />
            <TextField label="主角形象" value={toText(coverModule?.protagonist_image)} editing={editing} rows={3} onChange={(v) => updateCover({ protagonist_image: v })} />
            <TextField label="背景环境" value={toText(coverModule?.background_environment)} editing={editing} rows={3} onChange={(v) => updateCover({ background_environment: v })} />
          </Section>
        </div>
      </div>
    </div>
  )
}
