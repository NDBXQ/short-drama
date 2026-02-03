export type VibeUserIntent =
  | { type: "start" }
  | { type: "continue" }
  | { type: "modify" }
  | { type: "jump"; step: number }
  | { type: "message" }

function normalizeUserText(prompt: string): string {
  const raw = (prompt ?? "").trim()
  if (!raw) return ""
  const firstLineEnd = raw.indexOf("\n")
  const firstLine = firstLineEnd >= 0 ? raw.slice(0, firstLineEnd) : raw
  if (firstLine.startsWith("当前风格锁：") && firstLineEnd >= 0) return raw.slice(firstLineEnd + 1).trim()
  return raw
}

export function parseUserIntent(prompt: string): VibeUserIntent {
  const text = normalizeUserText(prompt)
  const compact = text.replace(/\s+/g, "").toLowerCase()

  const jumpMatch = text.match(/回到步骤\s*(\d)/) ?? text.match(/步骤\s*(\d)/)
  if (jumpMatch?.[1]) return { type: "jump", step: Number(jumpMatch[1]) }

  const continueWords = ["继续", "下一步", "next", "满意", "ok", "好的", "可以"]
  if (continueWords.some((w) => compact === w || compact.includes(w))) return { type: "continue" }

  const modifyWords = ["修改", "调整", "改一下", "重新", "再改一版", "不行", "不满意", "还要再改"]
  if (modifyWords.some((w) => compact.includes(w))) return { type: "modify" }

  const startWords = ["开始创作", "创作", "创建", "制作", "写个剧本", "帮我"]
  if (startWords.some((w) => compact.includes(w.replace(/\s+/g, "")))) return { type: "start" }

  return { type: "message" }
}

export function normalizeContinueAction(intent: VibeUserIntent, state: { currentStep: number } | null): VibeUserIntent {
  if (intent.type === "start") {
    if (!state) return { type: "jump", step: 0 }
    return { type: "jump", step: 0 }
  }
  if (intent.type === "jump") return { type: "jump", step: intent.step }
  if (intent.type === "continue") return { type: "continue" }
  if (intent.type === "modify") return { type: "modify" }
  return { type: "message" }
}

