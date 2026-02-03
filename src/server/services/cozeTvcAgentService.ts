import { readEnv, readEnvInt } from "@/features/coze/env"
import { makeApiOk } from "@/shared/api"
import { logger } from "@/shared/logger"
import { ServiceError } from "@/server/services/errors"

export type TvcAgentStreamData =
  | { type: "start" }
  | { type: "delta"; text: string }
  | { type: "result"; raw: string; stepXml?: string | null; responseText?: string | null }
  | { type: "error"; code: string; message: string }

function extractTag(raw: string, tagName: string): string | null {
  const re = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i")
  const m = raw.match(re)
  if (!m) return null
  const v = m[0]?.trim()
  return v ? v : null
}

function extractResponseText(raw: string): string | null {
  const re = /<response[^>]*>([\s\S]*?)<\/response>/i
  const m = raw.match(re)
  const v = m?.[1]?.trim() ?? ""
  return v ? v : null
}

export class CozeTvcAgentService {
  static async createStream(params: {
    traceId: string
    userId: string
    prompt: string
    sessionId: string
  }): Promise<ReadableStream<Uint8Array>> {
    const { traceId, userId, prompt, sessionId } = params
    const url = readEnv("COZE_TVC_AGENT_URL") ?? "https://hgks7kcs38.coze.site/stream_run"
    const token = readEnv("COZE_TVC_AGENT_TOKEN")
    const projectId = readEnvInt("COZE_TVC_AGENT_PROJECT_ID") ?? 7600663963751432246
    const timeoutMs = readEnvInt("COZE_TVC_AGENT_REQUEST_TIMEOUT_MS") ?? readEnvInt("REQUEST_TIMEOUT_MS") ?? 120_000

    if (!token) {
      throw new ServiceError("COZE_NOT_CONFIGURED", "Coze TVC 智能体未配置，请设置 COZE_TVC_AGENT_TOKEN")
    }

    const encoder = new TextEncoder()
    const controllerAbort = new AbortController()
    const timer = setTimeout(() => controllerAbort.abort(), timeoutMs)
    let closed = false
    const startAt = Date.now()

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (data: TvcAgentStreamData) => {
          if (closed) return
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(makeApiOk(traceId, data))}\n\n`))
        }

        const sendErr = (code: string, message: string) => {
          send({ type: "error", code, message })
        }

        send({ type: "start" })
        logger.info({
          event: "tvc_agent_stream_start",
          module: "tvc_agent",
          traceId,
          message: "开始请求 TVC 智能体流",
          userId,
          projectId
        })

        try {
          const resp = await fetch(url, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              authorization: `Bearer ${token}`
            },
            body: JSON.stringify({
              content: {
                query: {
                  prompt: [
                    {
                      type: "text",
                      content: { text: prompt }
                    }
                  ]
                }
              },
              type: "query",
              session_id: sessionId,
              project_id: projectId
            }),
            signal: controllerAbort.signal
          })

          const contentType = resp.headers.get("content-type") ?? ""
          if (!resp.ok) {
            const txt = await resp.text().catch(() => "")
            sendErr("COZE_REQUEST_FAILED", `TVC 智能体请求失败：HTTP ${resp.status}`)
            logger.error({
              event: "tvc_agent_stream_upstream_failed",
              module: "tvc_agent",
              traceId,
              message: "TVC 智能体上游请求失败",
              status: resp.status,
              contentType,
              bodySnippet: txt.slice(0, 500)
            })
            closed = true
            controller.close()
            return
          }

          const body = resp.body
          if (!body) {
            sendErr("COZE_RESPONSE_INVALID", "TVC 智能体回包为空")
            closed = true
            controller.close()
            return
          }

          const reader = body.getReader()
          const decoder = new TextDecoder()
          let buffer = ""
          let fullAnswer = ""

          while (!closed) {
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

                let payload: unknown
                try {
                  payload = JSON.parse(dataPart)
                } catch {
                  continue
                }

                if (!payload || typeof payload !== "object") continue
                const anyPayload = payload as Record<string, unknown>

                if (anyPayload["type"] === "error") {
                  const content = anyPayload["content"]
                  const err =
                    content && typeof content === "object" ? (content as Record<string, unknown>)["error"] : undefined
                  const msg =
                    err && typeof err === "object"
                      ? String((err as Record<string, unknown>)["error_msg"] ?? "TVC 智能体返回错误")
                      : "TVC 智能体返回错误"
                  sendErr("COZE_REQUEST_FAILED", msg)
                  closed = true
                  controller.close()
                  return
                }

                const content = anyPayload["content"]
                if (content && typeof content === "object" && (content as Record<string, unknown>)["error"]) {
                  const err = (content as Record<string, unknown>)["error"]
                  const msg =
                    err && typeof err === "object"
                      ? String((err as Record<string, unknown>)["error_msg"] ?? "TVC 智能体返回错误")
                      : "TVC 智能体返回错误"
                  sendErr("COZE_REQUEST_FAILED", msg)
                  closed = true
                  controller.close()
                  return
                }

                if (anyPayload["type"] === "answer") {
                  const ans =
                    content && typeof content === "object" ? (content as Record<string, unknown>)["answer"] : ""
                  if (typeof ans === "string" && ans) {
                    fullAnswer += ans
                    if (ans.includes("<")) send({ type: "delta", text: ans })
                  }
                }
              }
            }
          }

          const raw = fullAnswer.trim()
          const stepXml = extractTag(raw, "step")
          const responseText = extractResponseText(raw)

          send({ type: "result", raw, stepXml, responseText })
          logger.info({
            event: "tvc_agent_stream_success",
            module: "tvc_agent",
            traceId,
            message: "TVC 智能体流式响应完成",
            userId,
            durationMs: Date.now() - startAt
          })
          closed = true
          controller.close()
        } catch (err) {
          const anyErr = err as { name?: string; message?: string }
          if (anyErr?.name === "AbortError") {
            sendErr("COZE_TIMEOUT", "TVC 智能体请求超时")
          } else {
            sendErr("COZE_STREAM_FAILED", anyErr?.message ?? "TVC 智能体请求失败")
          }
          logger.error({
            event: "tvc_agent_stream_failed",
            module: "tvc_agent",
            traceId,
            message: "TVC 智能体流式处理失败",
            errorName: anyErr?.name,
            errorMessage: anyErr?.message
          })
          closed = true
          controller.close()
        } finally {
          clearTimeout(timer)
        }
      },
      cancel() {
        closed = true
        clearTimeout(timer)
        controllerAbort.abort()
      }
    })

    return stream
  }
}
