import type { TvcAgentStep, TvcAgentStepContent, TvcAgentSectionItem } from "@/features/tvc/agent/types"

function stripXmlTags(v: string): string {
  return (v ?? "")
    .replace(/<[^>]+>/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function extractContainer(stepXml: string, tag: string): string | null {
  const start = stepXml.indexOf(`<${tag}`)
  if (start < 0) return null
  const end = stepXml.indexOf(`</${tag}>`, start)
  if (end < 0) return null
  return stepXml.slice(start, end + (`</${tag}>`.length))
}

function getClosedTagText(xml: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i")
  const m = xml.match(re)
  if (!m) return ""
  return stripXmlTags(m[1] ?? "")
}

function parseFieldsFromXml(xml: string): Array<{ name: string; value: string }> {
  const out: Array<{ name: string; value: string }> = []
  const re = /<field\b[^>]*\bname=["']([^"']+)["'][^>]*>([\s\S]*?)<\/field>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(xml))) {
    const name = (m[1] ?? "").trim()
    const value = stripXmlTags(m[2] ?? "")
    if (!name || !value) continue
    out.push({ name, value })
  }
  return out
}

function parseRecordFromItemXml(itemXml: string): Record<string, string> {
  const record: Record<string, string> = {}
  const fieldsWrap = itemXml.match(/<fields\b[^>]*>([\s\S]*?)<\/fields>/i)
  if (fieldsWrap?.[1]) {
    const items = fieldsWrap[1]
    const reItem = /<item\b[^>]*>([\s\S]*?)<\/item>/gi
    let m: RegExpExecArray | null
    while ((m = reItem.exec(items))) {
      for (const f of parseFieldsFromXml(m[1] ?? "")) record[f.name] = f.value
    }
    if (Object.keys(record).length > 0) return record
  }
  for (const f of parseFieldsFromXml(itemXml)) record[f.name] = f.value
  return record
}

function parseListContainer(stepXml: string, containerTag: string, itemTags: string[]): Array<Record<string, string>> {
  const container = extractContainer(stepXml, containerTag)
  if (!container) return []
  const tags = itemTags.join("|")
  const re = new RegExp(`<(${tags})\\b[\\s\\S]*?<\\/\\1>`, "gi")
  const out: Array<Record<string, string>> = []
  let m: RegExpExecArray | null
  while ((m = re.exec(container))) {
    const record = parseRecordFromItemXml(m[0])
    if (Object.keys(record).length > 0) out.push(record)
  }
  return out
}

function parseSections(stepXml: string): TvcAgentSectionItem[] {
  const container = extractContainer(stepXml, "sections")
  if (!container) return []
  const re = /<(item|section)\b[\s\S]*?<\/\1>/gi
  const out: TvcAgentSectionItem[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(container))) {
    const itemXml = m[0]
    const record = parseRecordFromItemXml(itemXml)
    const sectionName = (record["section_name"] ?? record["序号"] ?? "").trim() || "未命名"
    const fields = Object.entries(record)
      .filter(([, v]) => String(v ?? "").trim())
      .map(([name, value]) => ({ name, value }))
    out.push({ sectionName, fields })
  }
  return out
}

export function parseStepXmlLite(stepXml: string): TvcAgentStep | null {
  const stepMatch = stepXml.match(/<step\b[^>]*\bid=["']([^"']+)["'][^>]*>/i)
  const id = (stepMatch?.[1] ?? "").trim()
  if (!id) return null
  const title = getClosedTagText(stepXml, "title")
  const prompt = getClosedTagText(stepXml, "prompt")

  const content: TvcAgentStepContent = {}
  if (prompt) content.prompt = prompt

  const images = parseListContainer(stepXml, "images", ["item", "image"])
  if (images.length) content.images = images

  const sections = parseSections(stepXml)
  if (sections.length) content.sections = sections

  const storyboards = parseListContainer(stepXml, "storyboards", ["item", "video_clip", "storyboard"])
  if (storyboards.length) content.storyboards = storyboards

  const videoClips = parseListContainer(stepXml, "video_clips", ["item", "video_clip"])
  if (videoClips.length) content.videoClips = videoClips

  return { id, title, content }
}

