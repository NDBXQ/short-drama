import { logger } from "@/shared/logger"
import { enqueueStoryboardTextJob, fetchStoryboards } from "../../../api/generation"
import type { StoryboardItem } from "../../../types"
import type { EpisodeProgressState, AutoGenerateStage } from "../useAutoGenerateState"
import { waitJobDone } from "@/shared/jobs/waitJob"

async function runTasksWithConcurrency(tasks: Array<() => Promise<void>>, limit: number) {
  const normalizedLimit = Math.max(1, Math.floor(limit))
  let cursor = 0
  const workers = Array.from({ length: Math.min(normalizedLimit, tasks.length) }, async () => {
    while (cursor < tasks.length) {
      const current = cursor
      cursor += 1
      await tasks[current]?.()
    }
  })
  await Promise.all(workers)
}

interface TextFlowParams {
  filteredPayloads: Array<{ outlineId: string; outline: string; original: string }>
  storyId: string
  activeEpisodeId: string
  setTextBatchMeta: (meta: { total: number; failed: number }) => void
  setEpisodeProgressById: (updater: (prev: Record<string, EpisodeProgressState>) => Record<string, EpisodeProgressState>) => void
  setGenerationStage: (stage: AutoGenerateStage) => void
  setGenerationEpisodeId: (id: string) => void
  setItems: (items: StoryboardItem[]) => void
  reloadShots: (outlineId: string) => Promise<void>
}

export async function runStoryboardTextFlow({
  filteredPayloads,
  storyId,
  activeEpisodeId,
  setTextBatchMeta,
  setEpisodeProgressById,
  setGenerationStage,
  setGenerationEpisodeId,
  setItems,
  reloadShots
}: TextFlowParams) {
  const start = performance.now()
  const traceId = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : "client"
  logger.info({
    event: "storyboard_text_batch_start",
    module: "video",
    traceId,
    message: "开始并发生成分镜文本",
    total: filteredPayloads.length
  })

  setGenerationStage("storyboard_text")
  setEpisodeProgressById(() => {
    const next: Record<string, EpisodeProgressState> = {}
    for (const p of filteredPayloads) {
      if (!p?.outlineId) continue
      next[p.outlineId] = { textStatus: "pending" }
    }
    return next
  })

  const jobIdByOutlineId = new Map<string, string>()
  for (const p of filteredPayloads) {
    const outId = p?.outlineId
    if (!outId) continue
    const { jobId } = await enqueueStoryboardTextJob({ outlineId: outId, outline: p.outline, original: p.original, traceId })
    jobIdByOutlineId.set(outId, jobId)
  }

  const doneByOutlineId = new Map<string, boolean>()
  const failedByOutlineId = new Map<string, boolean>()

  await runTasksWithConcurrency(
    filteredPayloads
      .map((p) => p?.outlineId)
      .filter((v): v is string => Boolean(v))
      .map((outlineId) => async () => {
        const jobId = jobIdByOutlineId.get(outlineId)
        if (!jobId) {
          failedByOutlineId.set(outlineId, true)
          setEpisodeProgressById((prev) => ({ ...prev, [outlineId]: { ...prev[outlineId], textStatus: "error" } }))
          return
        }
        try {
          const job = await waitJobDone({ jobId, minIntervalMs: 800, maxIntervalMs: 2200, timeoutMs: 12 * 60_000, traceId })
          if (job.status === "done") {
            doneByOutlineId.set(outlineId, true)
            setEpisodeProgressById((prev) => ({ ...prev, [outlineId]: { ...prev[outlineId], textStatus: "success" } }))
          } else {
            failedByOutlineId.set(outlineId, true)
            setEpisodeProgressById((prev) => ({ ...prev, [outlineId]: { ...prev[outlineId], textStatus: "error" } }))
          }
        } catch {
          failedByOutlineId.set(outlineId, true)
          setEpisodeProgressById((prev) => ({ ...prev, [outlineId]: { ...prev[outlineId], textStatus: "error" } }))
        }
      }),
    2
  )

  const durationMs = Math.round(performance.now() - start)
  const failed = filteredPayloads
    .map((p) => p?.outlineId)
    .filter((v): v is string => Boolean(v))
    .filter((outlineId) => failedByOutlineId.get(outlineId) === true).length
  setTextBatchMeta({ total: filteredPayloads.length, failed })

  logger.info({
    event: "storyboard_text_batch_done",
    module: "video",
    traceId,
    message: "并发生成分镜文本完成",
    durationMs,
    total: filteredPayloads.length,
    failed
  })

  if (failed === filteredPayloads.length) {
    throw new Error("所有分镜文本生成失败")
  }

  setGenerationStage("reloading")
  const outlineIds = filteredPayloads.map((p) => p.outlineId)
  const preferredEpisodeId = outlineIds.includes(activeEpisodeId)
    ? activeEpisodeId
    : outlineIds[0] ?? activeEpisodeId

  setGenerationEpisodeId(preferredEpisodeId)
  await reloadShots(preferredEpisodeId)

  const itemsByOutlineId = new Map<string, StoryboardItem[]>()
  const outlineIdByStoryboardId = new Map<string, string>()

  for (const outlineId of outlineIds) {
    const list = await fetchStoryboards(storyId, outlineId)
    itemsByOutlineId.set(outlineId, list)
    for (const it of list) outlineIdByStoryboardId.set(it.id, outlineId)
  }

  const displayItems = itemsByOutlineId.get(preferredEpisodeId) ?? []
  if (displayItems.length > 0) setItems(displayItems)

  return {
    outlineIds,
    preferredEpisodeId,
    itemsByOutlineId,
    outlineIdByStoryboardId
  }
}
