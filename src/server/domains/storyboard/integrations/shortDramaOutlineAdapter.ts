import "server-only"

export type ShortDramaOutlineRequestBody = {
  planning_result: unknown
  world_setting: unknown
  character_setting: unknown
}

function safeJsonParse(text: string): unknown | null {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

export function buildShortDramaOutlineRequestBody(input: {
  input_type: string
  story_text: string
}): ShortDramaOutlineRequestBody {
  if (input.input_type === "brief") {
    const parsed = safeJsonParse(input.story_text)
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const anyParsed = parsed as Record<string, unknown>
      if ("planning_result" in anyParsed || "world_setting" in anyParsed || "character_setting" in anyParsed) {
        return {
          planning_result: anyParsed["planning_result"],
          world_setting: anyParsed["world_setting"],
          character_setting: anyParsed["character_setting"]
        }
      }
    }
  }

  return { planning_result: input.story_text, world_setting: "", character_setting: "" }
}

type OutlineItem = { outline: string; original: string }

type EpisodeItem = {
  episode?: unknown
  core_plot?: unknown
}

type Stage = {
  stage_name?: unknown
  episode_range?: unknown
  core_goal?: unknown
  episodes?: unknown
}

function formatEpisodeOriginalText(input: {
  scriptName: string | null
  theme: string | null
  coreConflict: string | null
  stageName: string | null
  episodeRange: string | null
  stageGoal: string | null
  episode: number | null
  corePlot: string | null
}): string {
  const lines: string[] = []
  if (input.scriptName) lines.push(`剧名：${input.scriptName}`)
  if (input.theme) lines.push(`主题：${input.theme}`)
  if (input.coreConflict) lines.push(`核心冲突：${input.coreConflict}`)
  if (input.stageName || input.episodeRange) {
    const suffix = input.episodeRange ? `（${input.episodeRange}）` : ""
    lines.push(`阶段：${input.stageName ?? ""}${suffix}`.trim())
  }
  if (input.stageGoal) lines.push(`阶段目标：${input.stageGoal}`)
  if (input.episode) lines.push(`第${input.episode}集`)
  if (input.corePlot) lines.push(input.corePlot)
  return lines.join("\n")
}

export function adaptShortDramaOutlineToOutlineList(payload: unknown): OutlineItem[] {
  if (!payload || typeof payload !== "object") return []
  const anyPayload = payload as Record<string, unknown>
  const outlineJson = anyPayload["outline_json"]
  if (!outlineJson || typeof outlineJson !== "object") return []

  const anyOutlineJson = outlineJson as Record<string, unknown>
  const metaRaw = anyOutlineJson["outline_meta"]
  const meta = metaRaw && typeof metaRaw === "object" ? (metaRaw as Record<string, unknown>) : null
  const scriptName = typeof meta?.["script_name"] === "string" ? String(meta?.["script_name"]) : null
  const theme = typeof meta?.["theme"] === "string" ? String(meta?.["theme"]) : null
  const coreConflict = typeof meta?.["core_conflict"] === "string" ? String(meta?.["core_conflict"]) : null

  const sixStageOutline = anyOutlineJson["six_stage_outline"]
  if (!sixStageOutline || typeof sixStageOutline !== "object") return []
  const stages = sixStageOutline as Record<string, unknown>

  const episodesFlat: Array<{
    stageName: string | null
    episodeRange: string | null
    stageGoal: string | null
    episode: number | null
    corePlot: string | null
  }> = []

  for (const key of Object.keys(stages)) {
    const stageRaw = stages[key]
    if (!stageRaw || typeof stageRaw !== "object") continue
    const stage = stageRaw as Stage
    const stageName = typeof stage.stage_name === "string" ? stage.stage_name : null
    const episodeRange = typeof stage.episode_range === "string" ? stage.episode_range : null
    const stageGoal = typeof stage.core_goal === "string" ? stage.core_goal : null
    const episodes = Array.isArray(stage.episodes) ? (stage.episodes as EpisodeItem[]) : []
    for (const ep of episodes) {
      const episodeNum = typeof ep?.episode === "number" && Number.isFinite(ep.episode) ? Math.trunc(ep.episode) : null
      const corePlot = typeof ep?.core_plot === "string" ? ep.core_plot : null
      episodesFlat.push({ stageName: stageName ?? key, episodeRange, stageGoal, episode: episodeNum, corePlot })
    }
  }

  episodesFlat.sort((a, b) => {
    const ea = a.episode ?? Number.MAX_SAFE_INTEGER
    const eb = b.episode ?? Number.MAX_SAFE_INTEGER
    return ea - eb
  })

  const list: OutlineItem[] = []
  for (const ep of episodesFlat) {
    const epNum = ep.episode
    const outline =
      epNum
        ? `第${epNum}集 ${ep.stageName ?? "剧情"}`
        : ep.stageName ?? scriptName ?? "大纲"
    const original = formatEpisodeOriginalText({
      scriptName,
      theme,
      coreConflict,
      stageName: ep.stageName,
      episodeRange: ep.episodeRange,
      stageGoal: ep.stageGoal,
      episode: epNum,
      corePlot: ep.corePlot
    })
    list.push({ outline, original })
  }

  return list
}

