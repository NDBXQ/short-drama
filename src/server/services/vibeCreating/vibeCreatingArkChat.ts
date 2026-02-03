import { ServiceError } from "@/server/services/errors"
import { safeJsonParse } from "./vibeCreatingJson"

export async function streamArkChat(params: {
  apiKey: string
  baseUrl: string
  model: string
  system: string
  user: string
  temperature: number
  topP?: number
  maxCompletionTokens?: number
  thinking?: "enabled" | "disabled"
  onDelta?: (t: string) => void
  abortSignal?: AbortSignal
}): Promise<string> {
  const url = `${params.baseUrl.replace(/\/$/, "")}/chat/completions`
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${params.apiKey}`
    },
    body: JSON.stringify({
      model: params.model,
      stream: true,
      temperature: params.temperature,
      ...(typeof params.topP === "number" ? { top_p: params.topP } : {}),
      ...(typeof params.maxCompletionTokens === "number" ? { max_completion_tokens: params.maxCompletionTokens } : {}),
      messages: [
        { role: "system", content: params.system },
        { role: "user", content: params.user }
      ],
      extra_body: { thinking: { type: params.thinking ?? "disabled" } }
    }),
    signal: params.abortSignal
  })

  if (!resp.ok || !resp.body) {
    const txt = await resp.text().catch(() => "")
    throw new ServiceError("ARK_REQUEST_FAILED", `火山方舟调用失败：HTTP ${resp.status} ${txt.slice(0, 200)}`)
  }

  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let full = ""

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    while (true) {
      const idx = buffer.indexOf("\n\n")
      if (idx < 0) break
      const block = buffer.slice(0, idx)
      buffer = buffer.slice(idx + 2)
      for (const line of block.split("\n")) {
        const trimmed = line.trim()
        if (!trimmed.startsWith("data:")) continue
        const dataPart = trimmed.slice("data:".length).trim()
        if (!dataPart || dataPart === "[DONE]") continue
        const parsed = safeJsonParse(dataPart)
        if (!parsed || typeof parsed !== "object") continue
        const anyParsed = parsed as Record<string, unknown>
        const choices = anyParsed["choices"]
        if (!Array.isArray(choices) || choices.length === 0) continue
        const first = choices[0] as any
        const delta = first?.delta?.content
        const piece = typeof delta === "string" ? delta : typeof first?.message?.content === "string" ? first.message.content : ""
        if (!piece) continue
        full += piece
        params.onDelta?.(piece)
      }
    }
  }

  return full
}
