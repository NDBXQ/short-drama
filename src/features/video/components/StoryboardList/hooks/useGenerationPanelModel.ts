import { useMemo } from "react"
import type { GenerationStep, GenerationStepStatus } from "../GenerationPanel"

export function useGenerationPanelModel(params: {
  episodes: Array<{ id: string; name: string }>
  generationStage: string
  generationEpisodeId: string | null
  textBatchMeta: { total: number; failed: number } | null
  episodeProgressById: Record<string, any> | null
  scriptGenerateSummary: { done: number; total: number }
  scriptSummary: { done: number; failed: number; total: number } | null
  promptSummary: { done: number; failed: number; total: number } | null
  assetSummary: { done: number; failed: number; total: number } | null
}): { title: string; episodeBars: Array<{ id: string; label: string; percent: number; tone: GenerationStepStatus; meta: string }>; steps: GenerationStep[] } {
  const { episodes, generationStage, generationEpisodeId, textBatchMeta, episodeProgressById, scriptGenerateSummary, scriptSummary, promptSummary, assetSummary } = params

  const title = useMemo(() => {
    const episodeLabel =
      (textBatchMeta?.total ?? 0) > 1
        ? "全部剧集"
        : generationEpisodeId
          ? (episodes.find((e) => e.id === generationEpisodeId)?.name ?? "分镜")
          : "分镜"
    return `正在生成：${episodeLabel}`
  }, [episodes, generationEpisodeId, textBatchMeta?.total])

  const episodeBars = useMemo(() => {
    return episodes
      .map((ep) => {
        const st = episodeProgressById?.[ep.id]
        const textDone = st?.textStatus ? 1 : 0
        const scriptTotal = st?.script?.total ?? 0
        const scriptDone = (st?.script?.done ?? 0) + (st?.script?.failed ?? 0)
        const promptTotal = st?.prompts?.total ?? 0
        const promptDone = (st?.prompts?.done ?? 0) + (st?.prompts?.failed ?? 0)
        const assetTotal = st?.assets?.total ?? 0
        const assetDone = (st?.assets?.done ?? 0) + (st?.assets?.failed ?? 0)

        const scriptProgress = scriptTotal > 0 ? scriptDone / scriptTotal : 0
        const promptProgress = promptTotal > 0 ? promptDone / promptTotal : 0
        const assetsSkipped =
          assetTotal === 0 && (generationStage === "assets" || generationStage === "done") && (promptTotal > 0 || (promptSummary?.total ?? 0) > 0)
        const assetProgress = assetTotal > 0 ? assetDone / assetTotal : assetsSkipped ? 1 : 0
        const parts = [textDone, scriptProgress, promptProgress, assetProgress]
        const overall = parts.reduce((sum, v) => sum + v, 0) / parts.length

        const hasError =
          st?.textStatus === "error" || (st?.script?.failed ?? 0) > 0 || (st?.prompts?.failed ?? 0) > 0 || (st?.assets?.failed ?? 0) > 0
        const isComplete = overall >= 1
        const tone: GenerationStepStatus = hasError ? "error" : isComplete ? "success" : "running"

        const meta = [
          st?.textStatus === "success" ? "文本✓" : st?.textStatus === "error" ? "文本×" : "文本…",
          scriptTotal > 0 ? `脚本 ${scriptDone}/${scriptTotal}` : null,
          promptTotal > 0 ? `提示词 ${promptDone}/${promptTotal}` : null,
          assetTotal > 0 ? `参考图 ${assetDone}/${assetTotal}` : assetsSkipped ? "参考图跳过" : null
        ]
          .filter(Boolean)
          .join(" · ")

        return { id: ep.id, label: ep.name, percent: Math.round(overall * 100), tone, meta }
      })
      .filter((b) => Boolean(b.id))
  }, [episodeProgressById, episodes, generationStage, promptSummary?.total])

  const steps = useMemo((): GenerationStep[] => {
    const textMeta = textBatchMeta ? `${Math.max(0, textBatchMeta.total - textBatchMeta.failed)}/${textBatchMeta.total}` : ""
    const scriptMeta =
      scriptSummary ? `${scriptSummary.done + scriptSummary.failed}/${scriptSummary.total}` : scriptGenerateSummary.total > 0 ? `${scriptGenerateSummary.done}/${scriptGenerateSummary.total}` : ""
    const promptMeta = promptSummary ? `${promptSummary.done + promptSummary.failed}/${promptSummary.total}` : ""
    const assetMeta = assetSummary ? `${assetSummary.done + assetSummary.failed}/${assetSummary.total}` : ""
    const assetLabel = assetSummary ? "生成参考图" : generationStage === "assets" || generationStage === "done" ? "生成参考图（跳过）" : "生成参考图"

    const statusFor = (key: "text" | "script" | "assets"): GenerationStepStatus => {
      if (generationStage === "idle") return "pending"
      if (generationStage === "error") return "error"
      if (generationStage === "done") return "success"
      if (generationStage === "clearing") return key === "text" ? "pending" : "pending"
      if (generationStage === "storyboard_text") return key === "text" ? "running" : "pending"
      if (generationStage === "script") return key === "script" ? "running" : key === "text" ? "success" : "pending"
      if (generationStage === "assets") return key === "assets" ? "running" : "success"
      return "running"
    }

    return [
      { key: "clear", label: "清理旧分镜数据", status: generationStage === "clearing" ? "running" : generationStage === "idle" ? "pending" : "success" },
      { key: "text", label: "生成分镜文本", status: statusFor("text"), meta: textMeta },
      { key: "script", label: "生成分镜脚本", status: statusFor("script"), meta: scriptMeta },
      { key: "prompts", label: "生成提示词", status: statusFor("assets"), meta: promptMeta },
      { key: "assets", label: assetLabel, status: statusFor("assets"), meta: assetMeta }
    ]
  }, [assetSummary, generationStage, promptSummary, scriptGenerateSummary.done, scriptGenerateSummary.total, scriptSummary, textBatchMeta])

  return { title, episodeBars, steps }
}
