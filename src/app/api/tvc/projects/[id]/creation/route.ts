import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { and, eq, desc } from "drizzle-orm"
import { getDb } from "coze-coding-dev-sdk"
import { tvcAgentSteps, tvcChatMessages, tvcStories } from "@/shared/schema"
import { getSessionFromRequest } from "@/shared/session"
import { getTraceId } from "@/shared/trace"
import { makeApiErr, makeApiOk } from "@/shared/api"
import { ensureTvcSchema } from "@/server/db/ensureTvcSchema"
import { parseStepXmlLite } from "@/server/tvc/parseStepXmlLite"

export const runtime = "nodejs"

function normalizeStepId(raw: string): string {
  const id = raw.trim()
  if (id === "step-0" || id === "0") return "step-0"
  if (id === "step-1" || id === "1") return "step-1"
  if (id === "step-2" || id === "2") return "step-2"
  if (id === "step-3" || id === "3") return "step-3"
  if (id === "step-4" || id === "4") return "step-4"
  if (id === "step-5" || id === "5") return "step-5"
  return id
}

const paramsSchema = z.object({
  id: z.string().trim().min(1).max(200)
})

const postSchema = z.object({
  steps: z
    .array(
      z.object({
        stepId: z.string().trim().min(1).max(50),
        title: z.string().trim().max(200).optional(),
        rawXml: z.string().trim().min(1).max(500_000),
        content: z.record(z.string(), z.unknown()).optional()
      })
    )
    .optional(),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(200_000)
      })
    )
    .optional()
})

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const traceId = getTraceId(req.headers)
  const session = await getSessionFromRequest(req)
  const userId = session?.userId
  if (!userId) return NextResponse.json(makeApiErr(traceId, "AUTH_REQUIRED", "未登录或登录已过期"), { status: 401 })

  await ensureTvcSchema()

  const rawParams = await ctx.params
  const parsedParams = paramsSchema.safeParse(rawParams)
  if (!parsedParams.success) return NextResponse.json(makeApiErr(traceId, "VALIDATION_FAILED", "参数格式不正确"), { status: 400 })

  const storyId = parsedParams.data.id
  const db = await getDb({ tvcStories, tvcAgentSteps, tvcChatMessages })
  const [story] = await db.select({ id: tvcStories.id, userId: tvcStories.userId }).from(tvcStories).where(eq(tvcStories.id, storyId)).limit(1)
  if (!story || story.userId !== userId) return NextResponse.json(makeApiErr(traceId, "NOT_FOUND", "项目不存在"), { status: 404 })

  const steps = await db
    .select({
      id: tvcAgentSteps.id,
      stepId: tvcAgentSteps.stepId,
      title: tvcAgentSteps.title,
      rawXml: tvcAgentSteps.rawXml,
      content: tvcAgentSteps.content,
      updatedAt: tvcAgentSteps.updatedAt
    })
    .from(tvcAgentSteps)
    .where(eq(tvcAgentSteps.storyId, storyId))
    .orderBy(desc(tvcAgentSteps.updatedAt))

  const enrichedSteps = await Promise.all(
    steps.map(async (s) => {
      const contentObj = (s.content ?? {}) as Record<string, unknown>
      const shouldBackfill = Object.keys(contentObj).length === 0 && Boolean(s.rawXml?.trim())
      if (!shouldBackfill) return { stepId: s.stepId, title: s.title, rawXml: s.rawXml, content: s.content, updatedAt: s.updatedAt }

      const parsed = parseStepXmlLite(s.rawXml)
      const parsedContent = (parsed?.content ?? {}) as Record<string, unknown>
      const normalized = { ...parsedContent, _schemaVersion: 1 }
      await db
        .update(tvcAgentSteps)
        .set({ content: normalized as any, updatedAt: new Date() })
        .where(and(eq(tvcAgentSteps.id, s.id), eq(tvcAgentSteps.storyId, storyId)))
      return { stepId: s.stepId, title: s.title, rawXml: s.rawXml, content: normalized, updatedAt: s.updatedAt }
    })
  )

  const messages = await db
    .select({ id: tvcChatMessages.id, role: tvcChatMessages.role, content: tvcChatMessages.content, createdAt: tvcChatMessages.createdAt })
    .from(tvcChatMessages)
    .where(eq(tvcChatMessages.storyId, storyId))
    .orderBy(tvcChatMessages.createdAt)

  return NextResponse.json(makeApiOk(traceId, { steps: enrichedSteps, messages }), { status: 200 })
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const traceId = getTraceId(req.headers)
  const session = await getSessionFromRequest(req)
  const userId = session?.userId
  if (!userId) return NextResponse.json(makeApiErr(traceId, "AUTH_REQUIRED", "未登录或登录已过期"), { status: 401 })

  await ensureTvcSchema()

  const rawParams = await ctx.params
  const parsedParams = paramsSchema.safeParse(rawParams)
  if (!parsedParams.success) return NextResponse.json(makeApiErr(traceId, "VALIDATION_FAILED", "参数格式不正确"), { status: 400 })

  const body = await req.json().catch(() => null)
  const parsedBody = postSchema.safeParse(body)
  if (!parsedBody.success) return NextResponse.json(makeApiErr(traceId, "VALIDATION_FAILED", "参数格式不正确"), { status: 400 })

  const storyId = parsedParams.data.id
  const db = await getDb({ tvcStories, tvcAgentSteps, tvcChatMessages })
  const [story] = await db.select({ id: tvcStories.id, userId: tvcStories.userId }).from(tvcStories).where(eq(tvcStories.id, storyId)).limit(1)
  if (!story || story.userId !== userId) return NextResponse.json(makeApiErr(traceId, "NOT_FOUND", "项目不存在"), { status: 404 })

  const steps = parsedBody.data.steps ?? []
  for (const s of steps) {
    const normalizedStepId = normalizeStepId(s.stepId)
    const rawContent = (s.content ?? {}) as Record<string, unknown>
    const shouldParse = Object.keys(rawContent).length === 0 && Boolean(s.rawXml?.trim())
    const parsed = shouldParse ? parseStepXmlLite(s.rawXml) : null
    const contentToStore = Object.keys(rawContent).length > 0 ? rawContent : ((parsed?.content ?? {}) as Record<string, unknown>)
    const normalizedContent = { ...contentToStore, _schemaVersion: 1 }
    await db
      .insert(tvcAgentSteps)
      .values({
        storyId,
        stepId: normalizedStepId,
        title: s.title ?? null,
        rawXml: s.rawXml,
        content: normalizedContent as any,
        updatedAt: new Date()
      })
      .onConflictDoUpdate({
        target: [tvcAgentSteps.storyId, tvcAgentSteps.stepId],
        set: {
          title: s.title ?? null,
          rawXml: s.rawXml,
          content: normalizedContent as any,
          updatedAt: new Date()
        }
      })
  }

  const messages = parsedBody.data.messages ?? []
  if (messages.length > 0) {
    await db.insert(tvcChatMessages).values(
      messages.map((m) => ({
        storyId,
        role: m.role,
        content: m.content
      }))
    )
  }

  return NextResponse.json(makeApiOk(traceId, { ok: true }), { status: 200 })
}
