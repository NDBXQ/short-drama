type Field = { name: string; value: string }

type Section = { sectionName: string; fields: Field[] }

export type RenderableStepContent = {
  sections?: Section[]
  images?: Array<Record<string, string>>
  storyboards?: Array<Record<string, string>>
  videoClips?: Array<Record<string, string>>
}

export type RenderableStep = {
  id: string
  title: string
  content: RenderableStepContent | null
}

function escapeText(text: string): string {
  return (text ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function escapeAttr(text: string): string {
  return escapeText(text).replace(/"/g, "&quot;").replace(/'/g, "&apos;")
}

function renderField(name: string, value: string): string {
  const n = escapeAttr(name)
  const v = escapeText(value)
  return `<field name="${n}">${v}</field>`
}

function renderRecordItem(record: Record<string, string>): string {
  const parts: string[] = []
  for (const [k, v] of Object.entries(record)) {
    const key = String(k ?? "").trim()
    const val = String(v ?? "")
    if (!key) continue
    if (!val.trim()) continue
    parts.push(renderField(key, val))
  }
  return `<item>\n${parts.join("\n")}\n</item>`
}

function renderSections(sections: Section[]): string {
  const items = sections
    .map((s) => {
      const fields: string[] = []
      fields.push(renderField("section_name", s.sectionName))
      for (const f of s.fields) fields.push(renderField(f.name, f.value))
      return `<item>\n${fields.join("\n")}\n</item>`
    })
    .join("\n")
  return `<sections>\n${items}\n</sections>`
}

function renderListContainer(tag: string, records: Array<Record<string, string>>): string {
  const items = records.map((r) => renderRecordItem(r)).join("\n")
  return `<${tag}>\n${items}\n</${tag}>`
}

export function renderAgentStepXml(step: RenderableStep): string {
  const id = escapeAttr(step.id)
  const title = escapeText(step.title)
  if (!step.content) {
    return `<step id="${id}">\n<title>${title}</title>\n</step>`
  }

  const blocks: string[] = []
  if (step.content.sections?.length) blocks.push(renderSections(step.content.sections))
  if (step.content.images?.length) blocks.push(renderListContainer("images", step.content.images))
  if (step.content.storyboards?.length) blocks.push(renderListContainer("storyboards", step.content.storyboards))
  if (step.content.videoClips?.length) blocks.push(renderListContainer("video_clips", step.content.videoClips))

  return `<step id="${id}">\n<title>${title}</title>\n<content>\n${blocks.join("\n")}\n</content>\n</step>`
}

export function renderAgentResponseXml(input: { text: string; actions: Array<{ command: string; text: string }> }): string {
  const lines = [String(input.text ?? "").trim(), "", ...input.actions.map((a) => a.text)].filter((l) => l !== undefined)
  const body = escapeText(lines.join("\n").trim())
  return `<response>\n${body}\n</response>`
}
