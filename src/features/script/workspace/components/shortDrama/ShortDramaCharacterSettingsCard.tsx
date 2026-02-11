"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import styles from "./ShortDramaCharacterSettingsCard.module.css"
import { patchStoryShortDramaMetadata } from "../../api/shortDrama"
import { Section, TextField, SmallField } from "./ShortDramaPlanningFields"
import { cloneJson, toText, unwrapCharacterSettings } from "./shortDramaPlanningModel"
import { useVideoImageEvents } from "@/features/video/hooks/useVideoAssetEvents"

type ShortDramaCharacterSettingsCardProps = Readonly<{
  storyId: string
  planningResult: any
  planningConfirmedAt?: number
  worldSetting: any
  characterSetting: any
  onSaved?: (nextCharacterSetting: any) => void
}>

type CharacterItem = Record<string, unknown>
type RoleImageItem = {
  id: string
  storyId: string
  storyboardId: string | null
  name: string
  description: string | null
  url: string
  thumbnailUrl: string | null
  category: string
  prompt: string | null
  createdAt: string
}

function buildCharacterSettingForSave(input: { normalized: ReturnType<typeof unwrapCharacterSettings>; inner: any }): any {
  if (input.normalized.wrapper === "wrapped" && input.normalized.original && typeof input.normalized.original === "object") {
    return { ...(input.normalized.original as any), character_settings: input.inner }
  }
  return input.inner
}

function getCharacters(inner: any): CharacterItem[] {
  const base = inner && typeof inner === "object" ? inner : {}
  const list = (base as any)?.characters
  return Array.isArray(list) ? (list.filter((x) => x && typeof x === "object") as CharacterItem[]) : []
}

function withCharacters(inner: any, characters: CharacterItem[]): any {
  const base = inner && typeof inner === "object" ? inner : {}
  return { ...base, characters }
}

function defaultCharacter(): CharacterItem {
  return {
    character_name: "",
    character_type: "",
    age: "",
    occupation: "",
    appearance: "",
    physique: "",
    hairstyle: "",
    clothing: "",
    personality: "",
    strengths: "",
    weaknesses: "",
    tone: "",
    script_setting: "",
    special_skills: "",
    cover_description: ""
  }
}

export function ShortDramaCharacterSettingsCard({
  storyId,
  planningResult,
  planningConfirmedAt,
  worldSetting,
  characterSetting,
  onSaved
}: ShortDramaCharacterSettingsCardProps) {
  const normalized = useMemo(() => unwrapCharacterSettings(characterSetting), [characterSetting])
  const [draft, setDraft] = useState<any>(() => {
    const inner = normalized.inner && typeof normalized.inner === "object" ? normalized.inner : {}
    return cloneJson(inner)
  })
  const [snapshot, setSnapshot] = useState<any>(() => cloneJson(draft))
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [errorText, setErrorText] = useState<string | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const [imagesLoading, setImagesLoading] = useState(false)
  const [imagesError, setImagesError] = useState<string | null>(null)
  const [roleImagesByName, setRoleImagesByName] = useState<Record<string, RoleImageItem>>({})
  const [generatingAll, setGeneratingAll] = useState(false)
  const [generatingCurrent, setGeneratingCurrent] = useState(false)
  const refreshTimerRef = useRef<number | null>(null)

  const isLocked = !planningResult || (typeof planningConfirmedAt !== "number" && !characterSetting)
  const characters = getCharacters(draft)
  const active = characters[activeIndex] ?? null

  const buildRoleImagePrompt = useCallback((ch: any, index: number): { name: string; prompt: string } | null => {
    const pick = (v: unknown) => String(v ?? "").trim()
    const shrink = (s: string, max = 800) => (s.length > max ? s.slice(0, max) : s)
    const name = pick(ch?.character_name) || `角色${index + 1}`
    if (/^旁白$/u.test(name) || /^narrator$/i.test(name)) return null

    const type = pick(ch?.character_type)
    const age = pick(ch?.age)
    const occupation = pick(ch?.occupation)
    const appearance = pick(ch?.appearance)
    const physique = pick(ch?.physique)
    const hairstyle = pick(ch?.hairstyle)
    const clothing = pick(ch?.clothing)

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
  }, [])

  const fetchRoleImages = useCallback(async () => {
    if (!storyId) return
    setImagesLoading(true)
    setImagesError(null)
    try {
      const u = new URL("/api/video-creation/images", window.location.origin)
      u.searchParams.set("storyId", storyId)
      u.searchParams.set("category", "role")
      u.searchParams.set("includeGlobal", "true")
      u.searchParams.set("limit", "200")
      u.searchParams.set("offset", "0")
      const res = await fetch(u.toString(), { method: "GET" })
      const json = (await res.json().catch(() => null)) as any
      if (!res.ok || !json || json.ok === false) {
        throw new Error(json?.error?.message ?? `HTTP ${res.status}`)
      }
      const items = Array.isArray(json?.data?.items) ? (json.data.items as RoleImageItem[]) : []
      const latest: Record<string, RoleImageItem> = {}
      for (const it of items) {
        const n = String((it as any)?.name ?? "").trim()
        if (!n) continue
        if (latest[n]) continue
        latest[n] = it
      }
      setRoleImagesByName(latest)
    } catch (e) {
      const anyErr = e as { message?: string }
      setImagesError(anyErr?.message ?? "加载角色图片失败")
    } finally {
      setImagesLoading(false)
    }
  }, [storyId])

  const scheduleRefresh = useCallback(() => {
    if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current)
    refreshTimerRef.current = window.setTimeout(() => {
      refreshTimerRef.current = null
      fetchRoleImages()
    }, 600)
  }, [fetchRoleImages])

  useEffect(() => {
    fetchRoleImages()
    return () => {
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current)
    }
  }, [fetchRoleImages])

  useVideoImageEvents({
    storyId,
    includeGlobal: true,
    enabled: Boolean(storyId),
    onEvent: (ev) => {
      if (ev.category !== "role") return
      scheduleRefresh()
    }
  })

  useEffect(() => {
    if (editing || saving) return
    const inner = normalized.inner && typeof normalized.inner === "object" ? cloneJson(normalized.inner) : {}
    setDraft(inner)
    setSnapshot(cloneJson(inner))
    setActiveIndex(0)
  }, [editing, normalized.inner, saving])

  const updateActive = (patch: Record<string, unknown>) => {
    setDraft((prev: any) => {
      const prevObj = prev && typeof prev === "object" ? prev : {}
      const list = getCharacters(prevObj)
      const idx = Math.max(0, Math.min(activeIndex, list.length - 1))
      const current = list[idx] ?? defaultCharacter()
      const nextList = list.slice()
      nextList[idx] = { ...current, ...patch }
      return withCharacters(prevObj, nextList)
    })
  }

  const onAddCharacter = () => {
    setDraft((prev: any) => {
      const prevObj = prev && typeof prev === "object" ? prev : {}
      const list = getCharacters(prevObj)
      const nextList = [...list, defaultCharacter()]
      return withCharacters(prevObj, nextList)
    })
    setActiveIndex(characters.length)
  }

  const onRemoveActive = () => {
    setDraft((prev: any) => {
      const prevObj = prev && typeof prev === "object" ? prev : {}
      const list = getCharacters(prevObj)
      if (list.length === 0) return prevObj
      const idx = Math.max(0, Math.min(activeIndex, list.length - 1))
      const nextList = list.filter((_, i) => i !== idx)
      return withCharacters(prevObj, nextList)
    })
    setActiveIndex((i) => Math.max(0, i - 1))
  }

  const onEditClick = () => {
    if (isLocked) return
    setSnapshot(cloneJson(draft))
    setErrorText(null)
    setEditing(true)
  }

  const onCancelClick = () => {
    setDraft(cloneJson(snapshot))
    setErrorText(null)
    setEditing(false)
  }

  const onSaveClick = async () => {
    if (saving) return
    setSaving(true)
    setErrorText(null)
    try {
      const inner = draft && typeof draft === "object" ? cloneJson(draft) : {}
      const nextCharacterSetting = buildCharacterSettingForSave({ normalized, inner })
      await patchStoryShortDramaMetadata(storyId, {
        planningResult,
        worldSetting,
        characterSetting: nextCharacterSetting,
        planningConfirmedAt
      })
      setSnapshot(cloneJson(inner))
      setEditing(false)
      onSaved?.(nextCharacterSetting)
    } catch (e) {
      const anyErr = e as { message?: string }
      setErrorText(anyErr?.message ?? "保存失败，请稍后重试")
    } finally {
      setSaving(false)
    }
  }

  const generateAllRoleImages = async (forceRegenerate: boolean) => {
    if (isLocked || editing || saving) return
    if (generatingAll) return
    setGeneratingAll(true)
    setImagesError(null)
    try {
      const prompts = characters
        .map((c, idx) => buildRoleImagePrompt(c, idx))
        .filter(Boolean)
        .slice(0, 50) as Array<{ name: string; prompt: string }>
      if (prompts.length === 0) return
      const res = await fetch("/api/video-creation/images/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          storyId,
          async: true,
          forceRegenerate,
          prompts: prompts.map((p) => ({ name: p.name, prompt: p.prompt, category: "role" }))
        })
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
    } catch (e) {
      const anyErr = e as { message?: string }
      setImagesError(anyErr?.message ?? "生成角色图片失败")
    } finally {
      setGeneratingAll(false)
    }
  }

  const generateCurrentRoleImage = async (forceRegenerate: boolean) => {
    if (isLocked || editing || saving) return
    if (generatingCurrent) return
    if (!active) return
    setGeneratingCurrent(true)
    setImagesError(null)
    try {
      const prompt = buildRoleImagePrompt(active, activeIndex)
      if (!prompt) return
      const res = await fetch("/api/video-creation/images/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          storyId,
          async: true,
          forceRegenerate,
          prompts: [{ name: prompt.name, prompt: prompt.prompt, category: "role" }]
        })
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
    } catch (e) {
      const anyErr = e as { message?: string }
      setImagesError(anyErr?.message ?? "生成角色图片失败")
    } finally {
      setGeneratingCurrent(false)
    }
  }

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <div className={styles.headerMain}>
          <div className={styles.title}>角色设定</div>
          <div className={styles.subTitle}>{isLocked ? "请先在剧本策划中确认并生成设定" : "可基于策划内容调整"}</div>
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
            <button type="button" className={styles.primaryBtn} onClick={onEditClick} disabled={isLocked}>
              编辑
            </button>
          )}
        </div>
      </div>

      {errorText ? <div className={styles.error}>{errorText}</div> : null}
      {imagesError ? <div className={styles.error}>{imagesError}</div> : null}

      <div className={styles.characterBar} aria-label="角色列表">
        <div className={styles.characterTabs}>
          {characters.length ? (
            characters.map((c, idx) => {
              const name = toText((c as any)?.character_name).trim() || `角色${idx + 1}`
              return (
                <button
                  key={`${name}_${idx}`}
                  type="button"
                  className={idx === activeIndex ? `${styles.characterTab} ${styles.characterTabActive}` : styles.characterTab}
                  onClick={() => setActiveIndex(idx)}
                >
                  {name}
                </button>
              )
            })
          ) : (
            <div className={styles.placeholder}>暂无角色</div>
          )}
        </div>
        {editing ? (
          <div className={styles.characterActions}>
            <button type="button" className={styles.secondaryBtn} onClick={onAddCharacter}>
              新增角色
            </button>
            <button type="button" className={styles.secondaryBtn} onClick={onRemoveActive} disabled={!characters.length}>
              删除当前
            </button>
          </div>
        ) : (
          <div className={styles.characterActions}>
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={() => generateAllRoleImages(false)}
              disabled={isLocked || saving || generatingAll || generatingCurrent || characters.length === 0}
            >
              {generatingAll ? "生成中…" : "生成全部角色图"}
            </button>
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={() => generateAllRoleImages(true)}
              disabled={isLocked || saving || generatingAll || generatingCurrent || characters.length === 0}
            >
              重新生成全部
            </button>
          </div>
        )}
      </div>

      {active ? (
        <div className={styles.grid}>
          <Section title="角色形象">
            <div className={styles.imagePanel}>
              {(() => {
                const name = toText((active as any)?.character_name).trim() || `角色${activeIndex + 1}`
                const img = roleImagesByName[name]
                const src = img?.thumbnailUrl || img?.url || ""
                if (!src) return <div className={styles.imagePlaceholder}>{imagesLoading ? "加载中…" : "暂无角色图"}</div>
                return (
                  <button
                    type="button"
                    className={styles.imageThumb}
                    onClick={() => window.open(img.url, "_blank", "noopener,noreferrer")}
                  >
                    <img src={src} alt={name} />
                  </button>
                )
              })()}
              <div className={styles.imageMeta}>
                <div className={styles.imageMetaTitle}>当前角色图</div>
                  <div className={styles.imageMetaDesc}>基于外形字段生成</div>
                <div className={styles.imageActions}>
                  <button
                    type="button"
                    className={styles.secondaryBtn}
                    onClick={() => generateCurrentRoleImage(false)}
                    disabled={isLocked || saving || generatingAll || generatingCurrent}
                  >
                    {generatingCurrent ? "生成中…" : "生成当前"}
                  </button>
                  <button
                    type="button"
                    className={styles.secondaryBtn}
                    onClick={() => generateCurrentRoleImage(true)}
                    disabled={isLocked || saving || generatingAll || generatingCurrent}
                  >
                    重新生成当前
                  </button>
                  <button type="button" className={styles.secondaryBtn} onClick={fetchRoleImages} disabled={imagesLoading}>
                    刷新
                  </button>
                </div>
              </div>
            </div>
            {characters.length ? (
              <div className={styles.imageGrid} aria-label="角色图集">
                {characters.map((c, idx) => {
                  const name = toText((c as any)?.character_name).trim() || `角色${idx + 1}`
                  const img = roleImagesByName[name]
                  const src = img?.thumbnailUrl || img?.url || ""
                  return (
                    <button
                      key={`${name}_${idx}`}
                      type="button"
                      className={styles.imageCard}
                      onClick={() => (img?.url ? window.open(img.url, "_blank", "noopener,noreferrer") : null)}
                      disabled={!img?.url}
                    >
                      <div className={styles.imageCardName}>{name}</div>
                      {src ? <img className={styles.imageCardImg} src={src} alt={name} /> : <div className={styles.imageCardEmpty}>未生成</div>}
                    </button>
                  )
                })}
              </div>
            ) : null}
          </Section>

          <Section title="基础信息">
            <div className={styles.kvGrid}>
              <SmallField
                label="姓名"
                value={toText((active as any)?.character_name)}
                editing={editing}
                placeholder="角色名"
                onChange={(v) => updateActive({ character_name: v })}
              />
              <SmallField
                label="类型"
                value={toText((active as any)?.character_type)}
                editing={editing}
                placeholder="如：女主/男主/反派"
                onChange={(v) => updateActive({ character_type: v })}
              />
              <SmallField label="年龄" value={toText((active as any)?.age)} editing={editing} onChange={(v) => updateActive({ age: v })} />
              <SmallField
                label="职业"
                value={toText((active as any)?.occupation)}
                editing={editing}
                onChange={(v) => updateActive({ occupation: v })}
              />
            </div>
          </Section>

          <Section title="人物小传">
            <TextField
              label="剧本人设"
              value={toText((active as any)?.script_setting)}
              editing={editing}
              rows={5}
              onChange={(v) => updateActive({ script_setting: v })}
            />
            <TextField
              label="性格"
              value={toText((active as any)?.personality)}
              editing={editing}
              rows={4}
              onChange={(v) => updateActive({ personality: v })}
            />
          </Section>

          <Section title="外形与包装">
            <TextField
              label="相貌"
              value={toText((active as any)?.appearance)}
              editing={editing}
              rows={4}
              onChange={(v) => updateActive({ appearance: v })}
            />
            <TextField
              label="体格"
              value={toText((active as any)?.physique)}
              editing={editing}
              rows={3}
              onChange={(v) => updateActive({ physique: v })}
            />
            <TextField
              label="发型"
              value={toText((active as any)?.hairstyle)}
              editing={editing}
              rows={3}
              onChange={(v) => updateActive({ hairstyle: v })}
            />
            <TextField
              label="服装"
              value={toText((active as any)?.clothing)}
              editing={editing}
              rows={3}
              onChange={(v) => updateActive({ clothing: v })}
            />
            <TextField
              label="封面描述"
              value={toText((active as any)?.cover_description)}
              editing={editing}
              rows={3}
              onChange={(v) => updateActive({ cover_description: v })}
            />
          </Section>

          <Section title="能力与缺点">
            <TextField
              label="特长/技能"
              value={toText((active as any)?.special_skills)}
              editing={editing}
              rows={4}
              onChange={(v) => updateActive({ special_skills: v })}
            />
            <TextField
              label="弱点"
              value={toText((active as any)?.weaknesses)}
              editing={editing}
              rows={4}
              onChange={(v) => updateActive({ weaknesses: v })}
            />
            <TextField
              label="口吻"
              value={toText((active as any)?.tone)}
              editing={editing}
              rows={4}
              onChange={(v) => updateActive({ tone: v })}
            />
          </Section>
        </div>
      ) : (
        <div className={styles.empty}>暂无可编辑角色</div>
      )}
    </div>
  )
}
