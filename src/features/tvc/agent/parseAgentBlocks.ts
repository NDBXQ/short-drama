import type { TvcAgentBlock, TvcAgentField, TvcAgentResponse, TvcAgentSectionItem, TvcAgentStep, TvcAgentStepContent } from "./types"

function normalizeText(v: string): string {
  return v.replace(/\r\n/g, "\n").trim()
}

function safeParseXml(xml: string): Document | null {
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(xml, "application/xml")
    if (doc.getElementsByTagName("parsererror").length > 0) return null
    return doc
  } catch {
    return null
  }
}

function textOf(el: Element | null | undefined): string {
  const t = el?.textContent ?? ""
  return normalizeText(t)
}

function directChild(el: Element, tag: string): Element | null {
  for (const n of Array.from(el.children)) {
    if (n.tagName === tag) return n
  }
  return null
}

function directChildren(el: Element, tag: string): Element[] {
  const out: Element[] = []
  for (const n of Array.from(el.children)) {
    if (n.tagName === tag) out.push(n)
  }
  return out
}

function parseFieldsContainer(container: Element): TvcAgentField[] {
  const out: TvcAgentField[] = []
  const fieldEls = directChildren(container, "field")
  for (const f of fieldEls) {
    const name = (f.getAttribute("name") ?? "").trim()
    if (!name) continue
    const value = textOf(f)
    out.push({ name, value })
  }
  return out
}

function parseItemAsRecord(item: Element): Record<string, string> {
  const fieldsWrap = directChild(item, "fields")
  const record: Record<string, string> = {}
  if (fieldsWrap) {
    for (const it of directChildren(fieldsWrap, "item")) {
      for (const f of parseFieldsContainer(it)) {
        record[f.name] = f.value
      }
    }
    return record
  }
  for (const f of parseFieldsContainer(item)) {
    record[f.name] = f.value
  }
  return record
}

function parseImages(imagesEl: Element): Array<Record<string, string>> {
  const out: Array<Record<string, string>> = []
  const candidates = [...Array.from(imagesEl.children)].filter((n) => n.tagName === "item" || n.tagName === "image")
  for (const item of candidates) out.push(parseItemAsRecord(item))
  return out
}

function parseSections(sectionsEl: Element): TvcAgentSectionItem[] {
  const out: TvcAgentSectionItem[] = []
  const candidates = [...Array.from(sectionsEl.children)].filter((n) => n.tagName === "item" || n.tagName === "section")
  for (const item of candidates) {
    const record = parseItemAsRecord(item)
    const fields = Object.entries(record).map(([name, value]) => ({ name, value }))
    const sectionName =
      normalizeText(record["section_name"] ?? "") ||
      normalizeText(record["序号"] ?? "") ||
      normalizeText(item.getAttribute("id") ?? "") ||
      "未命名"
    out.push({ sectionName, fields })
  }
  return out
}

function parseListOfRecords(containerEl: Element): Array<Record<string, string>> {
  const out: Array<Record<string, string>> = []
  const candidates = [...Array.from(containerEl.children)].filter((n) => n.tagName === "item" || n.tagName === "video_clip")
  for (const item of candidates) out.push(parseItemAsRecord(item))
  return out
}

export function parseStepXml(stepXml: string): TvcAgentStep | null {
  const doc = safeParseXml(stepXml)
  if (!doc) return null
  const step = doc.getElementsByTagName("step")[0]
  if (!step) return null

  const id = (step.getAttribute("id") ?? "").trim()
  const title = textOf(directChild(step, "title"))
  const content: TvcAgentStepContent = {}

  const contentEl = directChild(step, "content")
  const baseEl = contentEl ?? step

  const promptEl = contentEl ? directChild(contentEl, "prompt") : null
  const prompt = promptEl ? textOf(promptEl) : ""
  if (prompt) content.prompt = prompt

  const imagesEl = directChild(baseEl, "images")
  if (imagesEl) content.images = parseImages(imagesEl)

  const sectionsEl = directChild(baseEl, "sections")
  if (sectionsEl) content.sections = parseSections(sectionsEl)

  const storyboardsEl = directChild(baseEl, "storyboards")
  if (storyboardsEl) content.storyboards = parseListOfRecords(storyboardsEl)

  const videoClipsEl = directChild(baseEl, "video_clips")
  if (videoClipsEl) content.videoClips = parseListOfRecords(videoClipsEl)

  return { id, title, content }
}

export function parseResponseXml(responseXml: string): TvcAgentResponse | null {
  const doc = safeParseXml(responseXml)
  if (!doc) return null
  const root = doc.getElementsByTagName("response")[0]
  if (!root) return null
  const text = normalizeText(root.textContent ?? "")

  const actions: Array<{ command: string; text: string }> = []
  for (const line of text.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed.includes("👉")) continue
    const m = trimmed.match(/输入"([^"]+)"/)
    if (!m) continue
    const command = (m[1] ?? "").trim()
    if (!command) continue
    actions.push({ command, text: trimmed })
  }

  return { text, actions }
}

export function parseAgentBlocks(rawText: string): TvcAgentBlock[] {
  const raw = rawText ?? ""
  const blocks: TvcAgentBlock[] = []
  let i = 0

  while (i < raw.length) {
    const nextStep = raw.indexOf("<step", i)
    const nextResp = raw.indexOf("<response", i)
    const next = [nextStep, nextResp].filter((n) => n >= 0).sort((a, b) => a - b)[0]
    if (next === undefined) break

    if (next > i) {
      const text = raw.slice(i, next)
      if (text.trim()) blocks.push({ kind: "text", text })
    }

    if (next === nextStep) {
      const end = raw.indexOf("</step>", nextStep)
      if (end < 0) {
        const tail = raw.slice(nextStep)
        if (tail.trim()) blocks.push({ kind: "text", text: tail })
        return blocks
      }
      const xml = raw.slice(nextStep, end + "</step>".length)
      blocks.push({ kind: "step", raw: xml, step: parseStepXml(xml) })
      i = end + "</step>".length
      continue
    }

    if (next === nextResp) {
      const end = raw.indexOf("</response>", nextResp)
      if (end < 0) {
        const tail = raw.slice(nextResp)
        if (tail.trim()) blocks.push({ kind: "text", text: tail })
        return blocks
      }
      const xml = raw.slice(nextResp, end + "</response>".length)
      blocks.push({ kind: "response", raw: xml, response: parseResponseXml(xml) })
      i = end + "</response>".length
      continue
    }
  }

  const rest = raw.slice(i)
  if (rest.trim()) blocks.push({ kind: "text", text: rest })
  return blocks
}
