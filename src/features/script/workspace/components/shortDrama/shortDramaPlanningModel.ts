export function cloneJson<T>(input: T): T {
  try {
    return JSON.parse(JSON.stringify(input)) as T
  } catch {
    return input
  }
}

export function toText(value: unknown): string {
  if (value == null) return ""
  if (typeof value === "string") return value
  if (typeof value === "number" && Number.isFinite(value)) return String(value)
  if (typeof value === "boolean") return value ? "true" : "false"
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export function sanitizeGenres(input: unknown, max = 50): string[] {
  const list = Array.isArray(input) ? input : []
  const out: string[] = []
  const seen = new Set<string>()
  for (let i = 0; i < list.length && out.length < max; i += 1) {
    const s = String(list[i] ?? "").trim()
    if (!s) continue
    if (seen.has(s)) continue
    seen.add(s)
    out.push(s)
  }
  return out
}

type UnwrapResult = {
  wrapper: "wrapped" | "plain"
  inner: any
  original: any
}

export function unwrapPlanningResult(value: unknown): UnwrapResult {
  const v = value as any
  if (v && typeof v === "object" && "planning_result" in v && (v as any).planning_result && typeof (v as any).planning_result === "object") {
    return { wrapper: "wrapped", inner: (v as any).planning_result, original: v }
  }
  return { wrapper: "plain", inner: v ?? {}, original: null }
}

export function unwrapWorldSetting(value: unknown): UnwrapResult {
  const v = value as any
  if (v && typeof v === "object" && "world_setting" in v && (v as any).world_setting && typeof (v as any).world_setting === "object") {
    return { wrapper: "wrapped", inner: (v as any).world_setting, original: v }
  }
  return { wrapper: "plain", inner: v ?? {}, original: null }
}

export function unwrapCharacterSettings(value: unknown): UnwrapResult {
  const v = value as any
  if (
    v &&
    typeof v === "object" &&
    "character_settings" in v &&
    (v as any).character_settings &&
    typeof (v as any).character_settings === "object"
  ) {
    return { wrapper: "wrapped", inner: (v as any).character_settings, original: v }
  }
  return { wrapper: "plain", inner: v ?? {}, original: null }
}
