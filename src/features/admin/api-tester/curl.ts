import type { BodyKind, KeyValuePair, RequestDraft } from "./types"

const shellEscape = (v: string) => `'${v.replaceAll("'", `'\\''`)}'`

const normalizeHeaders = (pairs: KeyValuePair[]) => {
  const out: Array<{ k: string; v: string }> = []
  for (const p of pairs) {
    const k = (p.key ?? "").trim()
    const v = (p.value ?? "").trim()
    if (!k) continue
    out.push({ k, v })
  }
  return out
}

export function buildCurl(draft: RequestDraft): string {
  const method = (draft.method ?? "GET").toUpperCase()
  const url = (draft.url ?? "").trim() || "/"
  const headers = normalizeHeaders(draft.headers)

  const parts: string[] = ["curl"]
  parts.push("-i")
  parts.push("-X", method)

  for (const h of headers) {
    parts.push("-H", shellEscape(`${h.k}: ${h.v}`))
  }

  if (draft.bodyKind === "json" || draft.bodyKind === "text") {
    const body = (draft.bodyText ?? "").trim()
    if (body) parts.push("--data-raw", shellEscape(body))
  }

  if (draft.bodyKind === "form") {
    for (const f of draft.formFields) {
      const name = (f.name ?? "").trim()
      if (!name) continue
      if (f.type === "file") {
        parts.push("-F", shellEscape(`${name}=@${f.value || "FILE"}`))
      } else {
        parts.push("-F", shellEscape(`${name}=${f.value ?? ""}`))
      }
    }
  }

  parts.push(shellEscape(url))
  return parts.join(" ")
}

export function shouldDefaultContentType(bodyKind: BodyKind): string | null {
  if (bodyKind === "json") return "application/json"
  if (bodyKind === "text") return "text/plain"
  return null
}

