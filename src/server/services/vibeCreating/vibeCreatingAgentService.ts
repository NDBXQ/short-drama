import { readEnvInt } from "@/features/coze/env"
import { makeApiOk } from "@/shared/api"
import { logger } from "@/shared/logger"
import { ServiceError } from "@/server/services/errors"
import { and, eq } from "drizzle-orm"
import { getDb } from "coze-coding-dev-sdk"
import { tvcAgentSteps, tvcChatMessages, tvcStories } from "@/shared/schema"
import { normalizeContinueAction, parseUserIntent } from "./vibeCreatingIntent"
import { getVibeSessionState, setVibeSessionState, type VibeSessionState } from "./vibeCreatingState"
import { loadStoryContext } from "./vibeCreatingContext"
import { executeStep } from "./vibeCreatingStepExecutor"
import { clampStep, extractFirstTag, extractResponseText } from "./vibeCreatingUtils"
import type { TvcAgentStreamData } from "./vibeCreatingTypes"
import { streamArkChat } from "./vibeCreatingArkChat"
import { getVibeLlmConfig } from "./vibeCreatingConfig"
import { VIBE_CREATING_DIRECT_SYSTEM_PROMPT } from "./vibeCreatingSystemPrompt"

export class VibeCreatingAgentService {
  static async createStream(params: {
    traceId: string
    userId: string
    prompt: string
    sessionId: string
    projectId: string | null
  }): Promise<ReadableStream<Uint8Array>> {
    const { traceId, userId, prompt, sessionId, projectId } = params

    const timeoutMs =
      readEnvInt("VIBE_TVC_AGENT_TIMEOUT_MS") ?? readEnvInt("REQUEST_TIMEOUT_MS") ?? readEnvInt("COZE_TVC_AGENT_REQUEST_TIMEOUT_MS") ?? 120_000

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

        const sleep = async (ms: number) => {
          await new Promise<void>((resolve) => setTimeout(resolve, ms))
        }

        const wrapResponse = (text: string): string => {
          const t = String(text ?? "").trimEnd()
          return `<response>\n${t}\n</response>`
        }

        const sendTypewriter = async (text: string) => {
          const rawText = String(text ?? "")
          if (!rawText.trim()) return
          const chunkSize = 14
          let acc = ""
          for (let i = 0; i < rawText.length; i += chunkSize) {
            if (closed || controllerAbort.signal.aborted) return
            const chunk = rawText.slice(i, i + chunkSize)
            if (chunk) {
              acc += chunk
              send({ type: "delta", text: wrapResponse(acc) })
            }
            await sleep(12)
          }
        }

        const sendErr = (code: string, message: string) => {
          send({ type: "error", code, message })
        }

        send({ type: "start" })
        logger.info({
          event: "vibe_agent_stream_start",
          module: "tvc_agent",
          traceId,
          message: "开始请求 Vibe Creating 智能体流",
          userId,
          projectId
        })

        try {
          const mode = "direct"
          if (mode === "direct") {
            send({ type: "delta", text: wrapResponse("正在准备对话上下文...") })
            const story = projectId ? await loadStoryContext({ storyId: projectId, userId }) : null
            const llm = getVibeLlmConfig()
            const system = VIBE_CREATING_DIRECT_SYSTEM_PROMPT
            const historyText =
              story && story.recentMessages.length
                ? story.recentMessages
                    .slice(-20)
                    .map((m) => `${m.role === "assistant" ? "assistant" : "user"}: ${String(m.content ?? "")}`)
                    .join("\n")
                : ""
            const stepsText =
              story && Object.keys(story.stepsById).length
                ? Object.values(story.stepsById)
                    .slice(0, 6)
                    .map((s) => `STEP ${s.stepId}:\n${s.rawXml}`)
                    .join("\n\n")
                : ""
            const user = [
              historyText ? `历史对话（供参考）：\n${historyText}` : "",
              stepsText ? `已有步骤输出（供参考）：\n${stepsText}` : "",
              `用户输入：\n${prompt}`,
              `请严格按输出规范，只输出允许的标签内容。`
            ]
              .filter(Boolean)
              .join("\n\n")

            let accumulated = ""
            let lastSnapshot = ""
            let lastStepXmlSnapshot = ""
            let lastFlushAt = 0
            let lastUiPingAt = Date.now()
            const extractPartialResponseBody = (raw: string): string => {
              const start = raw.lastIndexOf("<response")
              if (start < 0) return ""
              const gt = raw.indexOf(">", start)
              if (gt < 0) return ""
              let body = raw.slice(gt + 1)
              const end = body.lastIndexOf("</response>")
              if (end >= 0) body = body.slice(0, end)
              return body.trimEnd()
            }
            const extractLastCompleteStepXml = (raw: string): string => {
              const start = raw.lastIndexOf("<step")
              if (start < 0) return ""
              const end = raw.indexOf("</step>", start)
              if (end < 0) return ""
              return raw.slice(start, end + "</step>".length)
            }

            send({ type: "delta", text: wrapResponse("正在思考...") })
            const heartbeat = setInterval(() => {
              if (closed || controllerAbort.signal.aborted) return
              const now = Date.now()
              if (now - lastUiPingAt < 1200) return
              lastUiPingAt = now
              if (!lastSnapshot) send({ type: "delta", text: wrapResponse("正在思考...") })
            }, 500)

            let full = ""
            try {
              full = await streamArkChat({
                apiKey: llm.apiKey,
                baseUrl: llm.baseUrl,
                model: llm.model,
                temperature: llm.temperature,
                topP: llm.topP,
                maxCompletionTokens: llm.maxCompletionTokens,
                thinking: llm.thinking,
                system,
                user,
                abortSignal: controllerAbort.signal,
                onDelta: (piece) => {
                  accumulated += piece
                  const now = Date.now()
                  if (now - lastFlushAt < 60) return
                  lastFlushAt = now

                  const stepXml = extractLastCompleteStepXml(accumulated)
                  const body = extractPartialResponseBody(accumulated)
                  const nextBody = body || lastSnapshot || "正在思考..."

                  const hasStepUpdate = Boolean(stepXml) && stepXml !== lastStepXmlSnapshot
                  const hasBodyUpdate = Boolean(body) && body !== lastSnapshot
                  if (!hasStepUpdate && !hasBodyUpdate) return

                  if (hasStepUpdate) lastStepXmlSnapshot = stepXml
                  if (hasBodyUpdate) lastSnapshot = body
                  lastUiPingAt = now

                  const snapshot = stepXml ? `${stepXml}\n\n${wrapResponse(nextBody)}` : wrapResponse(nextBody)
                  send({ type: "delta", text: snapshot })
                }
              })
            } finally {
              clearInterval(heartbeat)
            }

            const raw = full.trim()
            const stepXml = extractFirstTag(raw, "step")
            const responseText = extractResponseText(raw)
            if (responseText) await sendTypewriter(responseText)
            send({ type: "result", raw, stepXml, responseText })

            logger.info({
              event: "vibe_agent_stream_success",
              module: "tvc_agent",
              traceId,
              message: "Vibe Creating direct 模式完成",
              userId,
              durationMs: Date.now() - startAt
            })
            closed = true
            controller.close()
            return
          }

          const story = projectId ? await loadStoryContext({ storyId: projectId, userId }) : null
          const intent = parseUserIntent(prompt)
          const normalized = normalizeContinueAction(intent, story ? getVibeSessionState(story.metadata, sessionId) : null)

          const current = story ? getVibeSessionState(story.metadata, sessionId) : null
          const sessionState: VibeSessionState =
            current ?? { currentStep: 0, productImages: [], createdAt: Date.now(), updatedAt: Date.now() }

          const nextStep = clampStep(
            normalized.type === "jump"
              ? normalized.step
              : normalized.type === "continue"
                ? sessionState.currentStep + 1
                : sessionState.currentStep
          )
          const guardedStep = nextStep > sessionState.currentStep + 1 ? sessionState.currentStep + 1 : nextStep

          const nextStateBase: VibeSessionState = { ...sessionState, currentStep: guardedStep }
          const stepTitle =
            guardedStep === 0
              ? "收集产品图 + 需求澄清"
              : guardedStep === 1
                ? "剧本创作"
                : guardedStep === 2
                  ? "参考图生成"
                  : guardedStep === 3
                    ? "分镜头脚本创作"
                    : guardedStep === 4
                      ? "首帧图生成"
                      : "分镜视频生成"
          send({ type: "delta", text: wrapResponse(`正在处理：${stepTitle}`) })

          const exec = await executeStep({
            traceId,
            story,
            sessionState: nextStateBase,
            intent: normalized,
            userText: prompt,
            abortSignal: controllerAbort.signal,
            sendDelta: (t) => {
              if (t) send({ type: "delta", text: wrapResponse(t) })
            }
          })

          const stepXml = extractFirstTag(exec.raw, "step")
          const responseText = extractResponseText(exec.raw)

          if (responseText) await sendTypewriter(responseText)
          send({ type: "result", raw: exec.raw, stepXml, responseText })

          if (story) {
            const nextMeta = setVibeSessionState(story.metadata, sessionId, exec.nextState)
            const db = await getDb({ tvcStories, tvcAgentSteps, tvcChatMessages })
            await db
              .update(tvcStories)
              .set({ metadata: nextMeta as any, updatedAt: new Date() })
              .where(and(eq(tvcStories.id, story.storyId), eq(tvcStories.userId, userId)))
          }

          logger.info({
            event: "vibe_agent_stream_success",
            module: "tvc_agent",
            traceId,
            message: "Vibe Creating 智能体流式响应完成",
            userId,
            durationMs: Date.now() - startAt
          })
          closed = true
          controller.close()
        } catch (err) {
          const anyErr = err as { name?: string; message?: string }
          if (anyErr?.name === "AbortError") {
            sendErr("VIBE_TIMEOUT", "Vibe Creating 请求超时")
          } else if (err instanceof ServiceError) {
            sendErr(err.code, err.message)
          } else {
            sendErr("VIBE_STREAM_FAILED", anyErr?.message ?? "Vibe Creating 请求失败")
          }
          logger.error({
            event: "vibe_agent_stream_failed",
            module: "tvc_agent",
            traceId,
            message: "Vibe Creating 智能体流式处理失败",
            errorName: (err as any)?.name,
            errorMessage: (err as any)?.message
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
