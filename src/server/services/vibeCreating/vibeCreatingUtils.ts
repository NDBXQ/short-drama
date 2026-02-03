export function extractFirstTag(raw: string, tag: string): string | null {
  const start = raw.indexOf(`<${tag}`)
  if (start < 0) return null
  const end = raw.indexOf(`</${tag}>`, start)
  if (end < 0) return null
  return raw.slice(start, end + (`</${tag}>`.length))
}

export function extractResponseText(raw: string): string | null {
  const re = /<response[^>]*>([\s\S]*?)<\/response>/i
  const m = raw.match(re)
  const v = m?.[1]?.trim() ?? ""
  return v ? v : null
}

export function extractUrls(text: string): string[] {
  const out: string[] = []
  const re = /\bhttps?:\/\/[^\s<>"']+/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const url = (m[0] ?? "").trim()
    if (!url) continue
    out.push(url)
  }
  return Array.from(new Set(out))
}

export function pickUrl(record: Record<string, unknown>): string {
  const candidates = [record.url, record.URL, record.href, record.video_url, record.videoUrl, record.last_frame_url]
  for (const v of candidates) {
    if (typeof v === "string" && v.trim().startsWith("http")) return v.trim()
  }
  return ""
}

export function pickSequence(record: Record<string, unknown>, fallback: number): number {
  const candidates = [record.sequence, record.shot, record["序号"], record["镜头"], record.index]
  for (const v of candidates) {
    const n = Number(v)
    if (Number.isFinite(n) && n > 0) return Math.trunc(n)
  }
  const title = typeof record.title === "string" ? record.title : typeof record.description === "string" ? record.description : ""
  if (title) {
    const m = title.match(/(?:shot|镜头)\s*(\d+)/i)
    const n = m?.[1] ? Number(m[1]) : NaN
    if (Number.isFinite(n) && n > 0) return Math.trunc(n)
  }
  return fallback
}

export function shouldUseMock(readEnv: (k: string) => string | undefined): boolean {
  return (readEnv("VIBE_MOCK_MODE") ?? "").trim() === "1"
}

export function clampStep(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(5, Math.trunc(n)))
}

export function buildDefaultTitles(step: number): string {
  if (step === 0) return "收集产品图 + 需求澄清"
  if (step === 1) return "剧本创作"
  if (step === 2) return "参考图生成"
  if (step === 3) return "分镜头脚本创作"
  if (step === 4) return "首帧图生成"
  return "分镜视频生成"
}

