import { logger } from "@/shared/logger"
import { readEnvInt } from "@/features/coze/env"

type CallCozeRunEndpointInput = {
  traceId: string
  url: string
  token: string
  body: unknown
  module: string
  timeoutMs?: number
}

export class CozeRunEndpointError extends Error {
  status?: number
  bodySnippet?: string
  errorCode?: string
  requestId?: string
  cozeMessage?: string

  constructor(message: string, input?: { status?: number; bodySnippet?: string; errorCode?: string; requestId?: string; cozeMessage?: string }) {
    super(message)
    this.name = "CozeRunEndpointError"
    this.status = input?.status
    this.bodySnippet = input?.bodySnippet
    this.errorCode = input?.errorCode
    this.requestId = input?.requestId
    this.cozeMessage = input?.cozeMessage
  }
}

function truncateForLog(text: string, limit: number): string {
  if (text.length <= limit) return text
  return `${text.slice(0, limit)}...`
}

function pickString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function pickRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function normalizeCozeErrorPayload(payload: unknown): { message?: string; code?: string; requestId?: string } {
  const root = pickRecord(payload)
  if (!root) return {}

  const directMessage = pickString(root["message"]) ?? pickString(root["msg"]) ?? pickString(root["error_message"])
  const directCode = pickString(root["code"]) ?? pickString(root["error_code"]) ?? pickString(root["err_code"])
  const directRequestId = pickString(root["request_id"]) ?? pickString(root["requestId"]) ?? pickString(root["req_id"])

  const errorObj = pickRecord(root["error"])
  const errorMessage =
    pickString(errorObj?.["message"]) ??
    pickString(errorObj?.["msg"]) ??
    pickString(errorObj?.["error_message"]) ??
    pickString(errorObj?.["detail"])
  const errorCode = pickString(errorObj?.["code"]) ?? pickString(errorObj?.["error_code"]) ?? pickString(errorObj?.["err_code"])
  const errorRequestId = pickString(errorObj?.["request_id"]) ?? pickString(errorObj?.["requestId"]) ?? pickString(errorObj?.["req_id"])

  const dataObj = pickRecord(root["data"])
  const dataError = pickRecord(dataObj?.["error"])
  const dataMessage =
    pickString(dataObj?.["message"]) ??
    pickString(dataObj?.["msg"]) ??
    pickString(dataError?.["message"]) ??
    pickString(dataError?.["msg"]) ??
    pickString(dataError?.["error_message"])
  const dataCode = pickString(dataObj?.["code"]) ?? pickString(dataError?.["code"]) ?? pickString(dataError?.["error_code"])
  const dataRequestId = pickString(dataObj?.["request_id"]) ?? pickString(dataError?.["request_id"]) ?? pickString(dataObj?.["requestId"])

  const normalizedMessage = errorMessage ?? dataMessage ?? directMessage
  const normalizedCode = errorCode ?? dataCode ?? directCode
  const normalizedRequestId = errorRequestId ?? dataRequestId ?? directRequestId

  return { message: normalizedMessage ?? undefined, code: normalizedCode ?? undefined, requestId: normalizedRequestId ?? undefined }
}

function buildDisplayMessage(base: string, input: { status?: number; code?: string; requestId?: string; cozeMessage?: string; bodySnippet?: string }): string {
  const pieces: string[] = [base]
  if (typeof input.status === "number" && Number.isFinite(input.status)) pieces.push(`HTTP ${input.status}`)
  if (typeof input.code === "string" && input.code.trim()) pieces.push(`code=${input.code.trim()}`)
  if (typeof input.requestId === "string" && input.requestId.trim()) pieces.push(`requestId=${input.requestId.trim()}`)
  if (typeof input.cozeMessage === "string" && input.cozeMessage.trim()) pieces.push(input.cozeMessage.trim())
  const joined = pieces.join(" | ")
  if (joined.length <= 520) return joined
  return `${joined.slice(0, 520)}...`
}

function summarizeBodyForLog(body: unknown): { bodyType: string; bodyBytes?: number; topKeys?: string[] } {
  const bodyType = Array.isArray(body) ? "array" : body === null ? "null" : typeof body
  let bodyBytes: number | undefined
  let topKeys: string[] | undefined
  if (body && typeof body === "object" && !Array.isArray(body)) {
    topKeys = Object.keys(body as Record<string, unknown>).slice(0, 12)
  }
  try {
    const s = JSON.stringify(body)
    bodyBytes = Buffer.byteLength(s, "utf8")
  } catch {}
  return { bodyType, bodyBytes, topKeys }
}

function parseSsePayload(rawText: string): unknown[] {
  const items: unknown[] = []
  const blocks = rawText.split("\n\n")
  for (const block of blocks) {
    const lines = block.split("\n")
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith("data:")) continue
      const dataPart = trimmed.slice("data:".length).trim()
      if (!dataPart || dataPart === "[DONE]") continue
      try {
        items.push(JSON.parse(dataPart))
      } catch {}
    }
  }
  return items
}

function extractSseResult(items: unknown[]): { ok: true; data: unknown } | { ok: false; error: unknown } | null {
  if (items.length === 0) return null

  let errorPayload: unknown | undefined
  for (const item of items) {
    if (!item || typeof item !== "object") continue
    const anyItem = item as Record<string, unknown>
    const type = anyItem["type"]
    const content = anyItem["content"]

    if (type === "error") {
      const err =
        content && typeof content === "object" ? (content as Record<string, unknown>)["error"] : undefined
      errorPayload = err ?? item
      break
    }

    if (content && typeof content === "object") {
      const err = (content as Record<string, unknown>)["error"]
      if (err) {
        errorPayload = err
        break
      }
    }
  }

  if (errorPayload) return { ok: false, error: errorPayload }

  let answerText = ""
  for (const item of items) {
    if (!item || typeof item !== "object") continue
    const anyItem = item as Record<string, unknown>
    if (anyItem["type"] !== "answer") continue
    const content = anyItem["content"]
    if (!content || typeof content !== "object") continue
    const chunk = (content as Record<string, unknown>)["answer"]
    if (typeof chunk === "string") answerText += chunk
  }

  const trimmed = answerText.trim()
  if (trimmed) {
    try {
      return { ok: true, data: JSON.parse(trimmed) }
    } catch {
      return { ok: true, data: trimmed }
    }
  }

  const last = items[items.length - 1]
  return { ok: true, data: last }
}

export async function callCozeRunEndpoint(input: CallCozeRunEndpointInput): Promise<{
  status: number
  data: unknown
  durationMs: number
}> {
  const timeoutFromEnv = readEnvInt("REQUEST_TIMEOUT_MS")
  const resolvedTimeoutMs = input.timeoutMs ?? timeoutFromEnv ?? 60_000
  const maxAttemptsFromEnv = readEnvInt("COZE_RUN_RETRY_MAX_ATTEMPTS")
  const resolvedMaxAttempts = (() => {
    const raw = typeof maxAttemptsFromEnv === "number" && Number.isFinite(maxAttemptsFromEnv) ? Math.trunc(maxAttemptsFromEnv) : 3
    return Math.max(1, Math.min(5, raw))
  })()
  const { traceId, url, token, body, module } = input
  const start = Date.now()

  let host = "unknown"
  let pathname = ""
  try {
    const u = new URL(url)
    host = u.host
    pathname = u.pathname
  } catch {}

  logger.info({
    event: "coze_run_request_start",
    module,
    traceId,
    message: "开始请求 Coze run endpoint",
    host,
    path: pathname,
    ...summarizeBodyForLog(body),
    timeoutMs: resolvedTimeoutMs
  })

  try {
    const shouldRetryStatus = (status: number) => status === 429 || status === 502 || status === 503 || status === 504
    const computeDelayMs = (attempt: number) => {
      const base = 450
      const cap = 2000
      const exp = Math.min(cap, Math.trunc(base * Math.pow(2, Math.max(0, attempt - 1))))
      const jitter = Math.trunc(Math.random() * 160)
      return Math.max(0, exp + jitter)
    }
    const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

    let lastError: unknown = null
    for (let attempt = 1; attempt <= resolvedMaxAttempts; attempt += 1) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), resolvedTimeoutMs)
      try {
        const resp = await fetch(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${token}`
          },
          body: JSON.stringify(body),
          signal: controller.signal
        })

        const durationMs = Date.now() - start
        const contentType = resp.headers.get("content-type") ?? ""
        const rawText = await resp.text()

        if (!resp.ok) {
          let parsed: unknown = rawText
          try {
            parsed = JSON.parse(rawText)
          } catch {
            parsed = rawText
          }

          const bodySnippet =
            typeof parsed === "string" ? truncateForLog(parsed, 1200) : truncateForLog(JSON.stringify(parsed), 1200)
          const normalized = normalizeCozeErrorPayload(parsed)
          const err = new CozeRunEndpointError(buildDisplayMessage("Coze run endpoint 请求失败", {
            status: resp.status,
            code: normalized.code,
            requestId: normalized.requestId,
            cozeMessage: normalized.message,
            bodySnippet
          }), {
            status: resp.status,
            bodySnippet,
            errorCode: normalized.code,
            requestId: normalized.requestId,
            cozeMessage: normalized.message
          })

          if (attempt < resolvedMaxAttempts && shouldRetryStatus(resp.status)) {
            lastError = err
            const waitMs = computeDelayMs(attempt)
            logger.warn({
              event: "coze_run_request_retry",
              module,
              traceId,
              message: "Coze run endpoint 将重试（非 2xx）",
              host,
              path: pathname,
              status: resp.status,
              durationMs,
              attempt,
              maxAttempts: resolvedMaxAttempts,
              waitMs,
              cozeErrorCode: normalized.code,
              cozeErrorMessage: normalized.message,
              cozeRequestId: normalized.requestId
            })
            await sleep(waitMs)
            continue
          }

          logger.error({
            event: "coze_run_request_failed",
            module,
            traceId,
            message: "Coze run endpoint 请求失败",
            host,
            path: pathname,
            status: resp.status,
            durationMs,
            bodySnippet,
            cozeErrorCode: normalized.code,
            cozeErrorMessage: normalized.message,
            cozeRequestId: normalized.requestId
          })

          throw err
        }

        if (contentType.includes("text/event-stream")) {
          const items = parseSsePayload(rawText)
          const extracted = extractSseResult(items)

          if (!extracted) {
            const bodySnippet = truncateForLog(rawText, 1200)
            const err = new CozeRunEndpointError("Coze SSE 回包解析失败", {
              status: resp.status,
              bodySnippet
            })
            lastError = err
            logger.error({
              event: "coze_run_request_failed",
              module,
              traceId,
              message: "Coze SSE 回包解析失败",
              host,
              path: pathname,
              status: resp.status,
              durationMs,
              bodySnippet
            })
            throw err
          }

          if (!extracted.ok) {
            const normalized = normalizeCozeErrorPayload(extracted.error)
            const bodySnippet = truncateForLog(JSON.stringify(extracted.error), 1200)
            const err = new CozeRunEndpointError(buildDisplayMessage("Coze run endpoint 返回错误", {
              status: resp.status,
              code: normalized.code,
              requestId: normalized.requestId,
              cozeMessage: normalized.message,
              bodySnippet
            }), {
              status: resp.status,
              bodySnippet,
              errorCode: normalized.code,
              requestId: normalized.requestId,
              cozeMessage: normalized.message
            })
            lastError = err
            logger.error({
              event: "coze_run_request_failed",
              module,
              traceId,
              message: "Coze SSE 返回错误",
              host,
              path: pathname,
              status: resp.status,
              durationMs,
              bodySnippet,
              cozeErrorCode: normalized.code,
              cozeErrorMessage: normalized.message,
              cozeRequestId: normalized.requestId
            })
            throw err
          }

          logger.info({
            event: "coze_run_request_success",
            module,
            traceId,
            message: "Coze run endpoint 请求成功",
            host,
            path: pathname,
            status: resp.status,
            durationMs,
            attempt,
            maxAttempts: resolvedMaxAttempts
          })

          return { status: resp.status, data: extracted.data, durationMs }
        }

        let parsed: unknown = rawText
        try {
          parsed = JSON.parse(rawText)
        } catch {
          parsed = rawText
        }

        logger.info({
          event: "coze_run_request_success",
          module,
          traceId,
          message: "Coze run endpoint 请求成功",
          host,
          path: pathname,
          status: resp.status,
          durationMs,
          attempt,
          maxAttempts: resolvedMaxAttempts
        })

        return { status: resp.status, data: parsed, durationMs }
      } catch (err) {
        const durationMs = Date.now() - start
        const anyErr = err as { name?: string; message?: string; stack?: string }
        const isAbort = anyErr?.name === "AbortError"

        if (attempt < resolvedMaxAttempts && !isAbort && !(err instanceof CozeRunEndpointError)) {
          lastError = err
          const waitMs = computeDelayMs(attempt)
          logger.warn({
            event: "coze_run_request_retry",
            module,
            traceId,
            message: "Coze run endpoint 将重试（请求异常）",
            host,
            path: pathname,
            durationMs,
            attempt,
            maxAttempts: resolvedMaxAttempts,
            waitMs,
            errorName: anyErr?.name,
            errorMessage: anyErr?.message
          })
          await sleep(waitMs)
          continue
        }

        logger.error({
          event: "coze_run_request_error",
          module,
          traceId,
          message: isAbort ? "Coze run endpoint 请求超时" : "Coze run endpoint 请求异常",
          host,
          path: pathname,
          durationMs,
          timeoutMs: resolvedTimeoutMs,
          attempt,
          maxAttempts: resolvedMaxAttempts,
          errorName: anyErr?.name,
          errorMessage: anyErr?.message,
          stack: anyErr?.stack
        })

        if (err instanceof CozeRunEndpointError) throw err
        throw new CozeRunEndpointError(isAbort ? "Coze run endpoint 请求超时" : "Coze run endpoint 请求异常")
      } finally {
        clearTimeout(timer)
      }
    }

    const durationMs = Date.now() - start
    logger.error({
      event: "coze_run_request_error",
      module,
      traceId,
      message: "Coze run endpoint 请求失败（达到最大重试次数）",
      host,
      path: pathname,
      durationMs,
      timeoutMs: resolvedTimeoutMs,
      maxAttempts: resolvedMaxAttempts
    })
    if (lastError instanceof CozeRunEndpointError) throw lastError
    throw new CozeRunEndpointError("Coze run endpoint 请求失败（达到最大重试次数）")
  } catch (err) {
    if (err instanceof CozeRunEndpointError) throw err
    const durationMs = Date.now() - start
    const anyErr = err as { name?: string; message?: string; stack?: string }
    const isAbort = anyErr?.name === "AbortError"

    logger.error({
      event: "coze_run_request_error",
      module,
      traceId,
      message: isAbort ? "Coze run endpoint 请求超时" : "Coze run endpoint 请求异常",
      host,
      path: pathname,
      durationMs,
      timeoutMs: resolvedTimeoutMs,
      errorName: anyErr?.name,
      errorMessage: anyErr?.message,
      stack: anyErr?.stack
    })

    throw new CozeRunEndpointError(isAbort ? "Coze run endpoint 请求超时" : "Coze run endpoint 请求异常")
  }
}
