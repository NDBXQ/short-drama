"use client"

import Link from "next/link"
import { ArrowLeft, LayoutGrid, ListChecks, Plus } from "lucide-react"
import { useEffect, useMemo, useState, type ReactElement } from "react"
import styles from "./TvcWorkspacePage.module.css"
import type { ChatMessage, TvcPreviewTab, TvcStepId } from "@/features/tvc/types"
import { StyleVibePanel } from "@/features/tvc/components/StyleVibePanel"
import { TvcPreviewPanel } from "@/features/tvc/components/TvcPreviewPanel"
import { TvcTimelinePanel, type TimelineShot } from "@/features/tvc/components/TvcTimelinePanel"
import { TvcChatPanel } from "@/features/tvc/components/TvcChatPanel"
import type { TvcAgentStep } from "@/features/tvc/agent/types"
import { parseAgentBlocks, parseStepXml } from "@/features/tvc/agent/parseAgentBlocks"
import { getOrCreateTvcSessionId } from "@/features/tvc/agent/session"

const styleNameById: Record<string, string> = {
  glittercore: "Glittercore",
  "y2k-mcbling": "Y2K McBling",
  "y2k-acid": "Y2K Acid",
  "gen-z-naive": "Gen Z Naive",
  "retro-futurism": "Retro-Futurism",
  tiltshift: "Tilt-shift",
  euphoria: "Euphoria",
  "collage-pop": "Collage Pop",
  cyberpunk: "Cyberpunk"
}

function normalizeStepId(raw: string): TvcStepId | null {
  const id = raw.trim()
  if (id === "step-0" || id === "0") return "step-0"
  if (id === "step-1" || id === "1") return "step-1"
  if (id === "step-2" || id === "2") return "step-2"
  if (id === "step-3" || id === "3") return "step-3"
  if (id === "step-4" || id === "4") return "step-4"
  if (id === "step-5" || id === "5") return "step-5"
  return null
}

export function TvcWorkspacePage(): ReactElement {
  const [isCompact, setIsCompact] = useState(false)
  const [activeStep, setActiveStep] = useState<TvcStepId>("step-0")
  const [selectedStyleId, setSelectedStyleId] = useState("cyberpunk")
  const [activeTab, setActiveTab] = useState<TvcPreviewTab>("shotlist")
  const [chatFocusToken, setChatFocusToken] = useState(0)
  const [activeDock, setActiveDock] = useState<"edit" | "board">("edit")
  const [projectId, setProjectId] = useState("")
  const sessionId = useMemo(() => getOrCreateTvcSessionId(projectId), [projectId])
  const [projectError, setProjectError] = useState<string | null>(null)
  const [isCreatingProject, setIsCreatingProject] = useState(false)
  const [finalVideoUrl, setFinalVideoUrl] = useState<string | null>(null)
  const [brief, setBrief] = useState("")
  const [durationSec, setDurationSec] = useState(30)
  const [shots, setShots] = useState<TimelineShot[]>([])
  const [selectedShotId, setSelectedShotId] = useState<string | null>(null)
  const [shotlistLoading, setShotlistLoading] = useState(false)
  const [isGeneratingShotlist, setIsGeneratingShotlist] = useState(false)
  const [isAssemblingVideo, setIsAssemblingVideo] = useState(false)
  const [agentStepByCanvasId, setAgentStepByCanvasId] = useState<Partial<Record<TvcStepId, TvcAgentStep>>>({})
  const [initialChatMessages, setInitialChatMessages] = useState<ChatMessage[] | null>(null)
  const [assetUrlByKey, setAssetUrlByKey] = useState<Record<string, string>>({})

  const sendTelemetry = useMemo(() => {
    const getClientTraceId = (): string => {
      try {
        const key = "tvc_trace_id"
        const existing = sessionStorage.getItem(key)
        if (existing && existing.trim()) return existing.trim()
        const next = crypto.randomUUID()
        sessionStorage.setItem(key, next)
        return next
      } catch {
        return crypto.randomUUID()
      }
    }

    return (event: string, payload: Record<string, unknown>) => {
      const traceId = getClientTraceId()
      const body = {
        event,
        page: "/tvc",
        payload
      }

      try {
        void fetch("/api/telemetry/events", {
          method: "POST",
          headers: { "content-type": "application/json", "x-trace-id": traceId },
          body: JSON.stringify(body),
          keepalive: true
        })
      } catch {}
    }
  }, [])

  useEffect(() => {
    const query = window.matchMedia("(max-width: 1023px)")
    const sync = () => setIsCompact(query.matches)
    sync()
    query.addEventListener("change", sync)
    return () => query.removeEventListener("change", sync)
  }, [])

  const selectedStyleName = useMemo(() => styleNameById[selectedStyleId] ?? "Custom", [selectedStyleId])

  useEffect(() => {
    if (!projectId) return
    const needed: Array<{ kind: "reference_image" | "first_frame" | "video_clip"; index: number }> = []

    const pushIndex = (kind: "reference_image" | "first_frame" | "video_clip", raw: unknown) => {
      const n = Number.parseInt(String(raw ?? "").replace(/[^\d]/g, ""), 10)
      if (!Number.isFinite(n) || n <= 0) return
      needed.push({ kind, index: n })
    }

    const step2 = agentStepByCanvasId["step-2"]
    for (const img of (step2?.content?.images ?? []) as any[]) {
      pushIndex("reference_image", (img as any)?.index)
    }
    const step4 = agentStepByCanvasId["step-4"]
    for (const img of (step4?.content?.images ?? []) as any[]) {
      pushIndex("first_frame", (img as any)?.index)
    }
    const step5 = agentStepByCanvasId["step-5"]
    for (const clip of (step5?.content?.videoClips ?? []) as any[]) {
      pushIndex("video_clip", (clip as any)?.index)
    }

    const unique = new Map<string, { kind: "reference_image" | "first_frame" | "video_clip"; index: number }>()
    for (const it of needed) unique.set(`${it.kind}:${it.index}`, it)

    const missing = Array.from(unique.values()).filter((it) => !assetUrlByKey[`${it.kind}:${it.index}`])
    if (missing.length === 0) return

    let cancelled = false
    const run = async () => {
      await Promise.all(
        missing.map(async (it) => {
          const res = await fetch(
            `/api/tvc/projects/${encodeURIComponent(projectId)}/assets/resolve?sessionId=${encodeURIComponent(sessionId)}&kind=${encodeURIComponent(it.kind)}&index=${encodeURIComponent(
              String(it.index)
            )}`,
            { method: "GET", cache: "no-store" }
          ).catch(() => null)
          const json = (await res?.json().catch(() => null)) as any
          const url = String(json?.data?.url ?? "").trim()
          if (!url) return
          if (cancelled) return
          setAssetUrlByKey((prev) => {
            const key = `${it.kind}:${it.index}`
            if (prev[key]) return prev
            return { ...prev, [key]: url }
          })
        })
      )
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [agentStepByCanvasId, assetUrlByKey, projectId, sessionId])

  const deriveShotsFromAgentStep = useMemo(() => {
    const parseSeq = (raw: unknown): number | null => {
      const s = String(raw ?? "").trim()
      if (!s) return null
      const n = Number.parseInt(s.replace(/[^\d]/g, ""), 10)
      return Number.isFinite(n) && n > 0 ? n : null
    }

    const normalizeKey = (k: unknown): string => {
      return String(k ?? "")
        .replace(/[\u00A0\s]+/g, "")
        .replace(/[：:]+$/g, "")
        .trim()
    }

    const buildTextFromRecord = (record: Record<string, string>): string => {
      const pick = (...keys: string[]) => {
        for (const k of keys) {
          const v = (record[k] ?? "").trim()
          if (v) return v
        }
        return ""
      }

      const lines: string[] = []
      const camera = pick("镜头类型", "镜头", "镜头类别", "shot_type", "type")
      const scene = pick("画面描述", "场景描述", "描述", "画面", "storyboard_text", "description", "内容")
      const action = pick("动作描述", "动作", "action", "action_description")
      const dialog = pick("台词/旁白", "台词", "旁白", "台词旁白", "dialogue", "voice_over", "voiceover", "旁白时间", "台词时间")
      const duration = pick("时长", "duration", "duration_sec", "durationSeconds", "秒")

      if (camera) lines.push(`镜头类型: ${camera}`)
      if (scene) lines.push(`画面描述: ${scene}`)
      if (action) lines.push(`动作描述: ${action}`)
      if (dialog) lines.push(`台词/旁白: ${dialog}`)
      if (duration) lines.push(`时长: ${duration}`)

      if (lines.length > 0) return lines.join("\n")

      return Object.entries(record)
        .filter(([, v]) => String(v ?? "").trim())
        .map(([k, v]) => `${k}: ${String(v ?? "").trim()}`)
        .join("\n")
    }

    return (step: TvcAgentStep | undefined | null): TimelineShot[] => {
      if (!step) return []
      const storyboards = step.content.storyboards ?? []
      if (Array.isArray(storyboards) && storyboards.length > 0) {
        return storyboards.map((r, idx) => {
          const anyRow = r as Record<string, unknown>
          const seqRaw = parseSeq(anyRow["sequence"]) ?? parseSeq(anyRow["shot"]) ?? parseSeq(anyRow["序号"]) ?? null
          const seq = seqRaw ?? idx + 1
          const text =
            String(anyRow["storyboard_text"] ?? anyRow["storyboardText"] ?? anyRow["画面描述"] ?? anyRow["description"] ?? anyRow["内容"] ?? "")
              .trim() || JSON.stringify(anyRow)
          return { id: `draft_sb_${idx}`, sequence: seq, storyboardText: text }
        })
      }

      const sections = step.content.sections ?? []
      if (!Array.isArray(sections) || sections.length === 0) return []
      return sections.map((sec, idx) => {
        const record: Record<string, string> = {}
        for (const f of sec.fields ?? []) {
          if (!f?.name) continue
          const key = normalizeKey(f.name)
          if (!key) continue
          record[key] = String(f.value ?? "").trim()
        }
        const fromName = parseSeq(sec.sectionName) ?? null
        const fromField = parseSeq(record["序号"] ?? record["shot"] ?? record["镜头"] ?? "") ?? null
        const seq = fromName ?? fromField ?? idx + 1
        const text = buildTextFromRecord(record)
        return { id: `draft_sec_${idx}`, sequence: seq, storyboardText: text, scriptContent: record }
      })
    }
  }, [])

  const firstFrameBySequence = useMemo(() => {
    const step4 = agentStepByCanvasId["step-4"]
    const images = step4?.content?.images ?? []
    if (!Array.isArray(images) || images.length === 0) return new Map<number, { url: string; prompt: string }>()

    const map = new Map<number, { url: string; prompt: string }>()
    for (let idx = 0; idx < images.length; idx += 1) {
      const anyImg = images[idx] as Record<string, unknown>
      const indexRaw = String(anyImg["index"] ?? "").trim()
      const index = Number.parseInt(indexRaw.replace(/[^\d]/g, ""), 10)
      if (!Number.isFinite(index) || index <= 0) continue
      const url = String(anyImg["url"] ?? anyImg["URL"] ?? anyImg["href"] ?? assetUrlByKey[`first_frame:${index}`] ?? "").trim()
      if (!url) continue

      const prompt = String(anyImg["prompt"] ?? "").trim()
      const desc = String(anyImg["description"] ?? "").trim()
      const m = desc.match(/(?:shot|镜头)\s*0*([0-9]+)/i)
      const seq = m?.[1] ? Number.parseInt(m[1] ?? "", 10) : idx + 1
      if (Number.isFinite(seq) && seq > 0 && !map.has(seq)) map.set(seq, { url, prompt })
    }
    return map
  }, [agentStepByCanvasId, assetUrlByKey])

  const videoBySequence = useMemo(() => {
    const step5 = agentStepByCanvasId["step-5"]
    const clips = step5?.content?.videoClips ?? []
    if (!Array.isArray(clips) || clips.length === 0) return new Map<number, { url: string; prompt: string; durationSeconds?: number }>()

    const parseDuration = (raw: unknown): number | null => {
      if (typeof raw === "number" && Number.isFinite(raw)) return Math.trunc(raw)
      const s = String(raw ?? "").trim()
      if (!s) return null
      const n = Number.parseInt(s.replace(/[^\d]/g, ""), 10)
      return Number.isFinite(n) && n > 0 ? n : null
    }

    const map = new Map<number, { url: string; prompt: string; durationSeconds?: number }>()
    for (let idx = 0; idx < clips.length; idx += 1) {
      const anyClip = clips[idx] as Record<string, unknown>
      const indexRaw = String(anyClip["index"] ?? "").trim()
      const index = Number.parseInt(indexRaw.replace(/[^\d]/g, ""), 10)
      if (!Number.isFinite(index) || index <= 0) continue
      const url = String(anyClip["url"] ?? anyClip["video_url"] ?? anyClip["href"] ?? assetUrlByKey[`video_clip:${index}`] ?? "").trim()
      if (!url) continue
      const prompt = String(anyClip["prompt"] ?? "").trim()
      const durationSeconds = parseDuration(anyClip["duration"] ?? anyClip["duration_sec"] ?? anyClip["durationSeconds"]) ?? undefined
      const fromDesc = (() => {
        const d = String(anyClip["title"] ?? anyClip["description"] ?? "").trim()
        const m = d.match(/(?:shot|镜头)\s*0*([0-9]+)/i)
        return m ? Number.parseInt(m[1] ?? "", 10) : null
      })()
      const seq = (fromDesc ?? idx + 1) as number
      if (!map.has(seq)) map.set(seq, { url, prompt, durationSeconds })
    }
    return map
  }, [agentStepByCanvasId, assetUrlByKey])

  const previewShots = useMemo(() => {
    if (shots.length > 0) return shots
    const fromScript = deriveShotsFromAgentStep(agentStepByCanvasId["step-3"])
    if (fromScript.length > 0) return fromScript
    const fromDesign = deriveShotsFromAgentStep(agentStepByCanvasId["step-1"])
    if (fromDesign.length > 0) return fromDesign
    return shots
  }, [agentStepByCanvasId, deriveShotsFromAgentStep, shots])

  const displayShots = useMemo(() => {
    return previewShots.map((s) => {
      const first = firstFrameBySequence.get(s.sequence)
      const video = videoBySequence.get(s.sequence)
      const hasFirstUrl = Boolean((s as any).frames?.first?.url)
      const hasVideoUrl = Boolean((s as any).videoInfo?.url)
      if (!first && !video) return s
      return {
        ...s,
        ...(first && !hasFirstUrl
          ? {
              frames: {
                ...((s as any).frames ?? {}),
                first: { url: first.url, prompt: first.prompt }
              }
            }
          : null),
        ...(video && !hasVideoUrl
          ? {
              videoInfo: {
                ...((s as any).videoInfo ?? {}),
                url: video.url,
                prompt: video.prompt,
                ...(video.durationSeconds ? { durationSeconds: video.durationSeconds } : {})
              }
            }
          : null)
      } as TimelineShot
    })
  }, [firstFrameBySequence, previewShots, videoBySequence])

  const activeShot = useMemo(() => {
    if (!selectedShotId) return null
    return displayShots.find((s) => s.id === selectedShotId) ?? null
  }, [displayShots, selectedShotId])

  useEffect(() => {
    if (selectedShotId && displayShots.some((s) => s.id === selectedShotId)) return
    setSelectedShotId(displayShots[0]?.id ?? null)
  }, [displayShots, selectedShotId])

  const previewImages = useMemo(() => {
    const collect = (stepId: TvcStepId): Array<{ url: string; desc: string; category: string; type: string }> => {
      const step = agentStepByCanvasId[stepId]
      const images = step?.content?.images ?? []
      if (!Array.isArray(images)) return []
      return images
        .map((img) => {
          const anyImg = img as Record<string, unknown>
          const indexRaw = String(anyImg["index"] ?? "").trim()
          const index = Number.parseInt(indexRaw.replace(/[^\d]/g, ""), 10)
          const url =
            String(
              anyImg["url"] ??
                anyImg["URL"] ??
                anyImg["href"] ??
                (stepId === "step-2" ? assetUrlByKey[`reference_image:${index}`] : assetUrlByKey[`first_frame:${index}`]) ??
                ""
            ).trim()
          const desc = String(anyImg["description"] ?? anyImg["prompt"] ?? "").trim()
          const category = String(anyImg["category"] ?? "").trim()
          const type = String(anyImg["type"] ?? "").trim()
          if (!url) return null
          return { url, desc, category, type }
        })
        .filter(Boolean) as Array<{ url: string; desc: string; category: string; type: string }>
    }

    const step4Images = collect("step-4")
    const seen = new Set<string>()
    const merged = [...step4Images].filter((x) => {
      if (seen.has(x.url)) return false
      seen.add(x.url)
      return true
    })
    return merged
  }, [agentStepByCanvasId, assetUrlByKey])

  const previewVideos = useMemo(() => {
    const step5 = agentStepByCanvasId["step-5"]
    const clips = step5?.content?.videoClips ?? []
    if (!Array.isArray(clips)) return []
    return clips
      .map((c) => {
        const anyClip = c as Record<string, unknown>
        const indexRaw = String(anyClip["index"] ?? "").trim()
        const index = Number.parseInt(indexRaw.replace(/[^\d]/g, ""), 10)
        const url = String(anyClip["url"] ?? anyClip["video_url"] ?? anyClip["href"] ?? assetUrlByKey[`video_clip:${index}`] ?? "").trim()
        const title = String(anyClip["title"] ?? anyClip["name"] ?? anyClip["description"] ?? "").trim()
        const duration = String(anyClip["duration"] ?? anyClip["duration_sec"] ?? anyClip["durationSeconds"] ?? "").trim()
        if (!url) return null
        return { url, title, duration }
      })
      .filter(Boolean) as Array<{ url: string; title: string; duration: string }>
  }, [agentStepByCanvasId, assetUrlByKey])

  useEffect(() => {
    sendTelemetry("tvc_open", { referrer: document.referrer || null, userAgent: navigator.userAgent })
  }, [sendTelemetry])

  useEffect(() => {
    let cancelled = false
    const initialStyleId = "cyberpunk"
    const initialDurationSec = 30
    const readProjectIdFromUrl = (): string => {
      try {
        const url = new URL(window.location.href)
        return (url.searchParams.get("projectId") ?? "").trim()
      } catch {
        return ""
      }
    }
    const shouldForceNewProject = (): boolean => {
      try {
        const url = new URL(window.location.href)
        const v = (url.searchParams.get("new") ?? "").trim().toLowerCase()
        return v === "1" || v === "true" || v === "yes"
      } catch {
        return false
      }
    }
    const readCachedId = (): string => {
      try {
        return (window.localStorage.getItem("last_tvc_project_id") ?? "").trim()
      } catch {
        return ""
      }
    }
    const saveCachedId = (id: string) => {
      try {
        window.localStorage.setItem("last_tvc_project_id", id)
      } catch {}
    }

    const fetchProject = async (id: string) => {
      const res = await fetch(`/api/tvc/projects/${encodeURIComponent(id)}`, { method: "GET", cache: "no-store" })
      const json = (await res.json().catch(() => null)) as any
      if (!res.ok || !json?.ok) throw new Error(json?.error?.message ?? `HTTP ${res.status}`)
      return json.data.project as any
    }

    const createProject = async () => {
      const res = await fetch("/api/tvc/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "TVC 项目", styleId: initialStyleId, durationSec: initialDurationSec })
      })
      const json = (await res.json().catch(() => null)) as any
      if (!res.ok || !json?.ok) throw new Error(json?.error?.message ?? `HTTP ${res.status}`)
      return json.data.project as any
    }

    void (async () => {
      setProjectError(null)
      const forceNew = shouldForceNewProject()
      const candidate = forceNew ? "" : readProjectIdFromUrl() || readCachedId()
      try {
        const proj = candidate ? await fetchProject(candidate) : await createProject()
        if (cancelled) return
        const id = String(proj.id ?? "").trim()
        if (id) {
          setProjectId(id)
          saveCachedId(id)
        }
        if (forceNew) {
          try {
            const url = new URL(window.location.href)
            url.searchParams.delete("new")
            window.history.replaceState({}, "", url.toString())
          } catch {}
        }
        const tvcMeta = (proj.metadata as any)?.tvc ?? {}
        const nextBrief = typeof tvcMeta.brief === "string" ? tvcMeta.brief : typeof proj.storyText === "string" ? proj.storyText : ""
        const nextDuration = typeof tvcMeta.durationSec === "number" ? tvcMeta.durationSec : 30
        const nextStyle = typeof tvcMeta.styleId === "string" ? tvcMeta.styleId : typeof proj.shotStyle === "string" ? proj.shotStyle : initialStyleId
        setBrief(nextBrief ?? "")
        setDurationSec(nextDuration)
        if (nextStyle) setSelectedStyleId((prev) => (nextStyle !== prev ? nextStyle : prev))
        setFinalVideoUrl(typeof proj.finalVideoUrl === "string" && proj.finalVideoUrl.trim() ? proj.finalVideoUrl.trim() : null)
      } catch (e) {
        if (cancelled) return
        const anyErr = e as { message?: string }
        setProjectError(anyErr?.message ?? "项目初始化失败")
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!projectId) return
    void (async () => {
      try {
        await fetch(`/api/tvc/projects/${encodeURIComponent(projectId)}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ styleId: selectedStyleId })
        })
      } catch {}
    })()
  }, [projectId, selectedStyleId])

  useEffect(() => {
    if (!projectId) return
    void (async () => {
      const res = await fetch(`/api/tvc/projects/${encodeURIComponent(projectId)}/creation`, { method: "GET", cache: "no-store" }).catch(() => null)
      if (!res) return
      const json = (await res.json().catch(() => null)) as any
      if (!res.ok || !json?.ok) return

      const steps = Array.isArray(json?.data?.steps) ? (json.data.steps as any[]) : []
      const messages = Array.isArray(json?.data?.messages) ? (json.data.messages as any[]) : []

      if (steps.length > 0) {
        const next: Partial<Record<TvcStepId, TvcAgentStep>> = {}
        for (const s of steps) {
          const stepId = normalizeStepId(String(s.stepId ?? ""))
          if (!stepId) continue
          const rawXml = typeof s.rawXml === "string" ? s.rawXml : ""
          const parsed = rawXml ? parseStepXml(rawXml) : null
          const content = (parsed?.content ?? (s.content ?? {})) as any
          const title = (parsed?.title ?? (typeof s.title === "string" ? s.title : "")).trim()
          next[stepId] = { id: stepId, title, content }
        }
        setAgentStepByCanvasId(next)
      }

      if (messages.length > 0) {
        const chat: ChatMessage[] = messages
          .map((m) => {
            const role = m.role === "assistant" ? "assistant" : "user"
            const content = typeof m.content === "string" ? m.content : ""
            if (!content.trim()) return null
            const blocks = role === "assistant" ? parseAgentBlocks(content).filter((b) => b.kind !== "step" && b.kind !== "text") : undefined
            return { id: String(m.id ?? `db_${Math.random().toString(16).slice(2)}`), role, text: content, blocks }
          })
          .filter(Boolean) as ChatMessage[]
        setInitialChatMessages(chat)
      }
    })()
  }, [projectId])

  const refreshShotlist = useMemo(() => {
    return async () => {
      if (!projectId) return
      setShotlistLoading(true)
      try {
        const res = await fetch(`/api/tvc/projects/${encodeURIComponent(projectId)}/shotlist`, { method: "GET", cache: "no-store" })
        const json = (await res.json().catch(() => null)) as any
        if (!res.ok || !json?.ok) throw new Error(json?.error?.message ?? `HTTP ${res.status}`)
        const list = Array.isArray(json.data.shots) ? (json.data.shots as any[]) : []
        setShots(
          list.map((s) => ({
            id: String(s.id ?? ""),
            sequence: Number(s.sequence ?? 0) || 0,
            storyboardText: String(s.storyboardText ?? ""),
            shotCut: Boolean(s.shotCut),
            scriptContent: s.scriptContent ?? null,
            frames: (s.frames ?? {}) as any,
            videoInfo: (s.videoInfo ?? {}) as any
          }))
        )
      } catch {
        setShots([])
      } finally {
        setShotlistLoading(false)
      }
    }
  }, [projectId])

  useEffect(() => {
    void refreshShotlist()
  }, [refreshShotlist])

  const refreshProject = useMemo(() => {
    return async () => {
      if (!projectId) return
      try {
        const res = await fetch(`/api/tvc/projects/${encodeURIComponent(projectId)}`, { method: "GET", cache: "no-store" })
        const json = (await res.json().catch(() => null)) as any
        if (!res.ok || !json?.ok) return
        const proj = json.data.project as any
        setFinalVideoUrl(typeof proj.finalVideoUrl === "string" && proj.finalVideoUrl.trim() ? proj.finalVideoUrl.trim() : null)
      } catch {}
    }
  }, [projectId])

  const createNewProject = useMemo(() => {
    const saveCachedId = (id: string) => {
      try {
        window.localStorage.setItem("last_tvc_project_id", id)
      } catch {}
    }

    return async () => {
      if (isCreatingProject) return
      setProjectError(null)
      setIsCreatingProject(true)
      setAgentStepByCanvasId({})
      setInitialChatMessages(null)
      setShots([])
      setSelectedShotId(null)
      setFinalVideoUrl(null)
      setAssetUrlByKey({})
      setActiveDock("edit")
      setActiveStep("step-0")
      setActiveTab("shotlist")
      try {
        const res = await fetch("/api/tvc/projects", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ title: "TVC 项目", styleId: selectedStyleId, durationSec, brief })
        })
        const json = (await res.json().catch(() => null)) as any
        if (!res.ok || !json?.ok) throw new Error(json?.error?.message ?? `HTTP ${res.status}`)
        const proj = json.data.project as any
        const id = String(proj.id ?? "").trim()
        if (!id) throw new Error("项目创建失败：缺少 id")
        setProjectId(id)
        saveCachedId(id)
      } catch (e) {
        const anyErr = e as { message?: string }
        setProjectError(anyErr?.message ?? "项目创建失败")
      } finally {
        setIsCreatingProject(false)
      }
    }
  }, [brief, durationSec, isCreatingProject, selectedStyleId])

  const assembleVideo = useMemo(() => {
    return async () => {
      if (!projectId) return
      if (isAssemblingVideo) return
      const clips = displayShots
        .filter((s) => s && s.videoInfo && typeof s.videoInfo === "object" && String((s.videoInfo as any).url ?? "").trim())
        .slice()
        .sort((a, b) => (Number(a.sequence ?? 0) || 0) - (Number(b.sequence ?? 0) || 0))
        .map((s) => {
          const url = String((s.videoInfo as any).url ?? "").trim()
          const d = Number((s.videoInfo as any).durationSeconds ?? (s.scriptContent as any)?.["时长"] ?? 0)
          const duration = Number.isFinite(d) && d > 0 ? Math.min(60, Math.max(1, Math.trunc(d))) : 4
          return { url, start_time: 0, end_time: duration }
        })
      if (clips.length <= 0) {
        setProjectError("没有可用的视频片段，请先生成分镜视频")
        return
      }
      setProjectError(null)
      setIsAssemblingVideo(true)
      try {
        const res = await fetch(`/api/tvc/projects/${encodeURIComponent(projectId)}/videos/edit`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ storyId: projectId, video_config_list: clips, audio_config_list: [] })
        })
        const json = (await res.json().catch(() => null)) as any
        if (!res.ok || !json?.ok) throw new Error(json?.error?.message ?? `HTTP ${res.status}`)
        await refreshProject()
      } catch (e) {
        const anyErr = e as { message?: string }
        setProjectError(anyErr?.message ?? "成片合成失败")
      } finally {
        setIsAssemblingVideo(false)
      }
    }
  }, [displayShots, isAssemblingVideo, projectId, refreshProject])

  const generateShotlist = useMemo(() => {
    const waitJob = async (jobId: string) => {
      const start = Date.now()
      while (true) {
        const res = await fetch(`/api/jobs/${encodeURIComponent(jobId)}`, { method: "GET", cache: "no-store" })
        const json = (await res.json().catch(() => null)) as any
        if (!res.ok || !json?.ok) throw new Error(json?.error?.message ?? `HTTP ${res.status}`)
        const status = String(json.data.status ?? "")
        if (status === "done" || status === "error") return json.data
        if (Date.now() - start > 10 * 60 * 1000) throw new Error("生成超时")
        await new Promise((r) => setTimeout(r, 1200))
      }
    }

    return async () => {
      if (!projectId) return
      setProjectError(null)
      setIsGeneratingShotlist(true)
      try {
        await fetch(`/api/tvc/projects/${encodeURIComponent(projectId)}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ brief, durationSec, styleId: selectedStyleId })
        })
        const res = await fetch(`/api/tvc/projects/${encodeURIComponent(projectId)}/generate-shotlist`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ brief, styleId: selectedStyleId, durationSec })
        })
        const json = (await res.json().catch(() => null)) as any
        if (!res.ok || !json?.ok) throw new Error(json?.error?.message ?? `HTTP ${res.status}`)
        const jobId = String(json.data.jobId ?? "").trim()
        await waitJob(jobId)
        await refreshShotlist()
      } catch (e) {
        const anyErr = e as { message?: string }
        setProjectError(anyErr?.message ?? "生成失败")
      } finally {
        setIsGeneratingShotlist(false)
      }
    }
  }, [brief, durationSec, projectId, refreshShotlist, selectedStyleId])

  const showBoard = activeDock === "board"
  const showEdit = activeDock === "edit"

  return (
    <div className={styles.shell}>
      {projectError ? <div className={styles.toast}>{projectError}</div> : null}
      <div className={styles.workspace} aria-label="TVC 一键成片工作台">
        <div className={styles.dock} aria-label="快捷入口">
          <Link className={styles.dockLink} href="/" aria-label="返回首页" title="返回首页">
            <ArrowLeft size={18} />
          </Link>
          <button
            type="button"
            className={styles.dockButton}
            aria-label="新建 TVC 项目"
            title="新建项目"
            disabled={isCreatingProject}
            onClick={() => {
              void createNewProject()
            }}
          >
            <Plus size={18} />
          </button>
          <div className={styles.dockSpacer} aria-hidden="true" />
          <button
            type="button"
            className={`${styles.dockButton} ${activeDock === "edit" ? styles.dockButtonActive : ""}`}
            aria-label="进入编辑视图"
            title="Edit"
            onClick={() => {
              setActiveDock("edit")
            }}
          >
            <ListChecks size={18} />
          </button>
          <button
            type="button"
            className={`${styles.dockButton} ${activeDock === "board" ? styles.dockButtonActive : ""}`}
            aria-label="打开 Style & Vibe"
            title="Style & Vibe"
            onClick={() => {
              setActiveDock("board")
            }}
          >
            <LayoutGrid size={18} />
          </button>
        </div>

        <div className={styles.content}>
          <section className={styles.mainPanel} aria-label="主画布">
            {showBoard ? (
              <div className={`${styles.panel} ${styles.boardPanel}`}>
                <StyleVibePanel
                  activeStep={activeStep}
                  onStepChange={(id) => {
                    setActiveStep(id)
                    sendTelemetry("tvc_step_changed", { step: id })
                    if (id === "step-1" || id === "step-3") setActiveTab("shotlist")
                    if (id === "step-2" || id === "step-4") setActiveTab("image")
                    if (id === "step-5") setActiveTab("video")
                  }}
                  selectedStyleId={selectedStyleId}
                  onSelectStyle={(id) => {
                    setSelectedStyleId(id)
                    sendTelemetry("tvc_style_selected", { styleId: id, styleName: styleNameById[id] ?? null })
                  }}
                  onNeedMoreStyles={() => {
                    setChatFocusToken((v) => v + 1)
                    sendTelemetry("tvc_need_more_styles_clicked", {})
                  }}
                  brief={brief}
                  setBrief={setBrief}
                  durationSec={durationSec}
                  setDurationSec={setDurationSec}
                  onGenerateShotlist={() => {
                    sendTelemetry("tvc_generate_shotlist_clicked", {
                      durationSec,
                      styleId: selectedStyleId,
                      hasProject: Boolean(projectId)
                    })
                    void generateShotlist()
                  }}
                  isGeneratingShotlist={isGeneratingShotlist}
                  agentStepByCanvasId={agentStepByCanvasId}
                />
              </div>
            ) : showEdit ? (
              <div className={styles.centerPanel} aria-label="预览与时间线">
                <div className={styles.panel}>
                  <TvcPreviewPanel
                    activeTab={activeTab}
                    onTabChange={(tab) => {
                      setActiveTab(tab)
                      sendTelemetry("tvc_tab_changed", { tab })
                    }}
                    selectedStyleName={selectedStyleName}
                    shots={displayShots}
                    isShotlistLoading={shotlistLoading || isGeneratingShotlist}
                    images={previewImages}
                    videos={previewVideos}
                    activeShot={activeShot}
                    finalVideoUrl={finalVideoUrl}
                    onAssembleVideo={assembleVideo}
                    assemblingVideo={isAssemblingVideo}
                  />
                </div>
                <div className={styles.panel}>
                  <TvcTimelinePanel shots={displayShots} selectedShotId={selectedShotId} onSelectShot={setSelectedShotId} />
                </div>
              </div>
            ) : null}
          </section>

          <aside className={`${styles.panel} ${styles.rightPanel}`} aria-label="对话助手">
            <TvcChatPanel
              selectedStyleName={selectedStyleName}
              projectId={projectId}
              initialMessages={initialChatMessages ?? undefined}
              focusToken={chatFocusToken}
              onUserMessage={(text: string) => sendTelemetry("tvc_chat_submitted", { textLen: text.trim().length })}
              onAgentStep={(id, step) => {
                setAgentStepByCanvasId((prev) => ({ ...prev, [id]: step }))
              }}
            />
          </aside>

          {null}
        </div>
      </div>
    </div>
  )
}
