export type SplitPromptFramesResult = {
  first: string
  last: string
  split: boolean
}

const firstMarkerRegex = /首\s*帧/u
const lastMarkerRegex = /尾\s*帧/u

function findMarker(text: string, marker: "first" | "last"): { start: number; end: number } | null {
  const regex = marker === "first" ? /首\s*帧\s*[:：]/u : /尾\s*帧\s*[:：]/u
  const m = regex.exec(text)
  if (!m || m.index == null) return null
  return { start: m.index, end: m.index + m[0].length }
}

function stripLeadingMarker(text: string, marker: "first" | "last"): string {
  const regex = marker === "first" ? /^\s*首\s*帧\s*[:：]\s*/u : /^\s*尾\s*帧\s*[:：]\s*/u
  return text.replace(regex, "").trim()
}

function looksLikeCombined(text: string): boolean {
  return firstMarkerRegex.test(text) && lastMarkerRegex.test(text)
}

function splitFromSingleText(text: string): SplitPromptFramesResult {
  const raw = text.trim()
  const firstMarker = findMarker(raw, "first")
  const lastMarker = findMarker(raw, "last")
  if (!firstMarker && !lastMarker) return { first: raw, last: "", split: false }

  if (firstMarker && lastMarker && lastMarker.start > firstMarker.end) {
    const firstPart = raw.slice(firstMarker.end, lastMarker.start).trim()
    const lastPart = raw.slice(lastMarker.end).trim()
    return { first: firstPart, last: lastPart, split: true }
  }

  if (firstMarker && !lastMarker) return { first: stripLeadingMarker(raw, "first"), last: "", split: true }
  if (!firstMarker && lastMarker) return { first: "", last: stripLeadingMarker(raw, "last"), split: true }

  return { first: raw, last: "", split: false }
}

export function splitPromptFrames(firstPrompt: string | null | undefined, lastPrompt: string | null | undefined): SplitPromptFramesResult {
  const firstRaw = (firstPrompt ?? "").trim()
  const lastRaw = (lastPrompt ?? "").trim()

  const firstCombined = looksLikeCombined(firstRaw)
  const lastCombined = looksLikeCombined(lastRaw)

  if (firstCombined) {
    const split = splitFromSingleText(firstRaw)
    const nextFirst = stripLeadingMarker(split.first, "first")
    const nextLast = stripLeadingMarker(split.last || lastRaw, "last")
    return { first: nextFirst, last: nextLast, split: split.split }
  }

  if (lastCombined) {
    const split = splitFromSingleText(lastRaw)
    const nextFirst = stripLeadingMarker(split.first || firstRaw, "first")
    const nextLast = stripLeadingMarker(split.last, "last")
    return { first: nextFirst, last: nextLast, split: split.split }
  }

  const nextFirst = stripLeadingMarker(firstRaw, "first")
  const nextLast = stripLeadingMarker(lastRaw, "last")
  return { first: nextFirst, last: nextLast, split: false }
}
