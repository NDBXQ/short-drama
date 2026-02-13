import "server-only"

import { asc, eq } from "drizzle-orm"
import { getDb } from "coze-coding-dev-sdk"
import { readEnv } from "@/shared/env"
import { callCozeRunEndpoint } from "@/features/coze/runEndpointClient"
import { stories, storyOutlines } from "@/shared/schema/story"

function pickObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function extractScriptBody(data: unknown): unknown | null {
  const obj = pickObject(data)
  if (obj && "script_body" in obj) return (obj as any).script_body ?? null
  const nested = obj ? pickObject((obj as any).data) : null
  if (nested && "script_body" in nested) return (nested as any).script_body ?? null
  return null
}

function normalizeOutlineJson(value: unknown): unknown | null {
  const obj = pickObject(value)
  if (!obj) return null
  const nested = pickObject((obj as any).outline_json)
  return nested ?? obj
}

function readTotalEpisodesFromOutlineJson(value: unknown): number | null {
  const obj = pickObject(value)
  if (!obj) return null
  const meta = pickObject((obj as any).outline_meta)
  const raw = meta ? (meta as any).total_episodes : null
  const n = Number(raw)
  if (!Number.isFinite(n)) return null
  const base = Math.trunc(n)
  return base > 0 ? base : null
}

function overridePlanningTotalEpisodes(planning: unknown, totalEpisodes: number | null): unknown {
  if (!totalEpisodes || totalEpisodes <= 0) return planning
  const root = pickObject(planning)
  if (!root) return planning

  const nested = pickObject((root as any).planning_result)
  const isWrapped = Boolean(nested)
  const inner = (nested ?? root) as Record<string, unknown>

  const pm = pickObject((inner as any).parameter_module) ?? {}
  const nextInner = {
    ...inner,
    parameter_module: {
      ...pm,
      total_episodes: totalEpisodes
    }
  }

  if (isWrapped) return { ...root, planning_result: nextInner }
  return nextInner
}

function overrideOutlineTotalEpisodes(outlineJson: unknown, totalEpisodes: number | null): unknown {
  if (!totalEpisodes || totalEpisodes <= 0) return outlineJson
  const root = pickObject(outlineJson)
  if (!root) return outlineJson
  const meta = pickObject((root as any).outline_meta) ?? {}
  return {
    ...root,
    outline_meta: {
      ...meta,
      total_episodes: totalEpisodes
    }
  }
}

function readEpisodeNumbersFromOutlineJson(outlineJson: unknown): number[] {
  const root = pickObject(outlineJson)
  if (!root) return []
  const six = pickObject((root as any).six_stage_outline)
  if (!six) return []

  const numbers: number[] = []
  for (const stage of Object.values(six)) {
    const stageObj = pickObject(stage) ?? {}
    const episodesRaw = (stageObj as any).episodes
    if (!Array.isArray(episodesRaw)) continue
    for (const ep of episodesRaw) {
      const epObj = pickObject(ep)
      const n = Number(epObj ? (epObj as any).episode : NaN)
      if (Number.isFinite(n)) numbers.push(Math.trunc(n))
    }
  }

  const unique = Array.from(new Set(numbers)).filter((n) => n > 0)
  unique.sort((a, b) => a - b)
  return unique
}

function filterScriptBodyByAllowedEpisodes(scriptBody: unknown, allowedEpisodes: ReadonlyArray<number>): unknown {
  if (!allowedEpisodes.length) return scriptBody
  const body = pickObject(scriptBody)
  if (!body) return scriptBody

  const episodesRaw = (body as any).episodes
  if (!Array.isArray(episodesRaw)) return scriptBody

  const allowed = new Set(allowedEpisodes)
  const filtered = (episodesRaw as Array<unknown>).filter((e) => {
    const ep = pickObject(e)
    const n = Number(ep ? (ep as any).episode ?? (ep as any).episode_num ?? (ep as any).sequence : NaN)
    return Number.isFinite(n) && allowed.has(Math.trunc(n))
  })

  const nextEpisodes = filtered.length > 0 ? filtered : (episodesRaw as Array<unknown>).slice(0, allowedEpisodes.length)
  return { ...body, episodes: nextEpisodes }
}

function buildSixStageOutlineJsonFromOutlines(input: {
  storyTitle: string | null
  outlines: Array<{ sequence: number; outlineText: string; originalText: string }>
}): Record<string, unknown> {
  const normalizeLine = (line: string) => line.replace(/[\u200B-\u200D\uFEFF]/g, "").trim()
  const isEpisodeLine = (l: string) => /^第\s*\d+\s*集/u.test(l)

  const parse = (originalText: string) => {
    const lines = originalText.replaceAll("\r\n", "\n").split("\n").map(normalizeLine).filter(Boolean)
    const pick = (key: string) => {
      const line = lines.find((l) => l.startsWith(`${key}：`) || l.startsWith(`${key}:`))
      if (!line) return ""
      return line.replace(/^.*[:：]\s*/u, "").trim()
    }
    const scriptName = pick("剧名")
    const theme = pick("主题")
    const coreConflict = pick("核心冲突")

    const stageRaw = pick("阶段")
    const stageGoal = pick("阶段目标")
    const stageRangeMatch = stageRaw.match(/（([^）]+)）/u)
    const episodeRange = stageRangeMatch?.[1]?.trim() ?? ""
    const stageName = stageRaw.replace(/（[^）]+）/u, "").trim()

    const episodeIdx = lines.findIndex((l) => isEpisodeLine(l))
    const episodeNum = (() => {
      if (episodeIdx < 0) return null
      const m = lines[episodeIdx]?.match(/\d+/u)
      if (!m?.[0]) return null
      const n = Number(m[0])
      return Number.isFinite(n) ? Math.trunc(n) : null
    })()
    const corePlot = episodeIdx >= 0 ? lines.slice(episodeIdx + 1).join("\n").trim() : ""
    return { scriptName, theme, coreConflict, stageName, episodeRange, stageGoal, episodeNum, corePlot }
  }

  const parsed = input.outlines.map((o) => {
    const base = parse(o.originalText || "")
    const fallbackPlot = (o.originalText || o.outlineText || "").trim()
    return {
      sequence: o.sequence,
      ...base,
      episodeNum: base.episodeNum ?? o.sequence,
      corePlot: base.corePlot || fallbackPlot
    }
  })

  const metaFrom = parsed.find((p) => p.scriptName || p.theme || p.coreConflict) ?? null
  const outline_meta = {
    script_name: metaFrom?.scriptName || input.storyTitle || "",
    total_episodes: Math.max(...parsed.map((p) => p.episodeNum ?? p.sequence), 0),
    theme: metaFrom?.theme || "",
    core_conflict: metaFrom?.coreConflict || ""
  }

  const stageKeyFromName = (name: string) => {
    const n = name.trim()
    if (!n) return ""
    const map: Array<[string, string]> = [
      ["起", "qi"],
      ["困", "kun"],
      ["升", "sheng"],
      ["反", "fan"],
      ["合", "he"],
      ["结", "jie"]
    ]
    for (const [ch, key] of map) {
      if (n.includes(ch)) return key
    }
    return ""
  }

  const six_stage_outline: Record<string, unknown> = {}
  const stageOrder: string[] = []
  for (const item of parsed) {
    const name = item.stageName || "阶段"
    const key = stageKeyFromName(name) || (() => {
      const slug = `stage_${stageOrder.length + 1}`
      return slug
    })()

    if (!six_stage_outline[key]) {
      stageOrder.push(key)
      six_stage_outline[key] = {
        stage_name: name,
        episode_range: item.episodeRange || "",
        core_goal: item.stageGoal || "",
        episodes: [] as Array<{ episode: number; core_plot: string }>
      }
    }
    const stageObj = six_stage_outline[key] as any
    const list = Array.isArray(stageObj.episodes) ? stageObj.episodes : []
    stageObj.episodes = list
    list.push({ episode: item.episodeNum ?? item.sequence, core_plot: item.corePlot })
  }

  return { outline_meta, six_stage_outline }
}

export async function runGenerateScriptBody(input: {
  traceId: string
  userId: string
  storyId: string
  planning_result?: unknown
  world_setting?: unknown
  character_settings?: unknown
  outline_json?: unknown
}): Promise<{ storyId: string; scriptBody: unknown; coze: unknown; durationMs: number; cozeStatus: number }> {
  const start = Date.now()
  const url = readEnv("SHORT_DRAMA_SCRIPT_BODY_API_URL")
  const token = readEnv("SHORT_DRAMA_SCRIPT_BODY_API_TOKEN")
  if (!url || !token) throw new Error("COZE_NOT_CONFIGURED")

  const db = await getDb({ stories, storyOutlines })
  const [row] = await db
    .select({ userId: stories.userId, title: stories.title, metadata: stories.metadata })
    .from(stories)
    .where(eq(stories.id, input.storyId))
    .limit(1)

  if (!row) throw new Error("STORY_NOT_FOUND")
  if (row.userId !== input.userId) throw new Error("FORBIDDEN")

  const metadata = (row.metadata ?? {}) as Record<string, unknown>
  const shortDrama = (metadata as any)?.shortDrama
  const shortDramaObj = pickObject(shortDrama) ?? {}

  const planning_result = input.planning_result ?? (shortDramaObj as any).planningResult ?? null
  const world_setting = input.world_setting ?? (shortDramaObj as any).worldSetting ?? null
  const character_settings = input.character_settings ?? (shortDramaObj as any).characterSetting ?? null

  const outlines = await db
    .select({
      sequence: storyOutlines.sequence,
      outlineText: storyOutlines.outlineText,
      originalText: storyOutlines.originalText
    })
    .from(storyOutlines)
    .where(eq(storyOutlines.storyId, input.storyId))
    .orderBy(asc(storyOutlines.sequence), asc(storyOutlines.createdAt))

  const outline_json = outlines.length
    ? buildSixStageOutlineJsonFromOutlines({
        storyTitle: typeof row.title === "string" ? row.title.trim() : null,
        outlines: outlines.map((o) => ({
          sequence: o.sequence,
          outlineText: o.outlineText,
          originalText: o.originalText
        }))
      })
    : normalizeOutlineJson(input.outline_json ?? (shortDramaObj as any).outlineJson ?? null)

  const totalEpisodes = outlines.length ? Math.max(...outlines.map((o) => o.sequence), 0) : readTotalEpisodesFromOutlineJson(outline_json)
  const outline_json_for_request = overrideOutlineTotalEpisodes(outline_json, totalEpisodes || null)
  const planning_result_for_request = overridePlanningTotalEpisodes(planning_result, totalEpisodes || null)

  const requestBody = {
    planning_result: planning_result_for_request,
    world_setting,
    character_settings,
    outline_json: outline_json_for_request
  }

  const coze = await callCozeRunEndpoint({
    traceId: input.traceId,
    url,
    token,
    body: requestBody,
    module: "coze_short_drama_script_body"
  })

  const allowedEpisodes = readEpisodeNumbersFromOutlineJson(outline_json_for_request)
  const rawScriptBody = extractScriptBody(coze.data) ?? coze.data
  const scriptBody = filterScriptBodyByAllowedEpisodes(rawScriptBody, allowedEpisodes)

  const nextShortDrama = {
    ...shortDramaObj,
    outlineJson: outline_json_for_request,
    scriptBody,
    scriptBodyGeneratedAt: Date.now()
  }
  const nextMetadata = { ...metadata, shortDrama: nextShortDrama }

  await db.update(stories).set({ metadata: nextMetadata, updatedAt: new Date() }).where(eq(stories.id, input.storyId))

  return { storyId: input.storyId, scriptBody, coze: coze.data, durationMs: Date.now() - start, cozeStatus: coze.status }
}
