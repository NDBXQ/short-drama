import { ensureTvcSchema } from "@/server/db/ensureTvcSchema"
import { ServiceError } from "@/server/services/errors"
import { tvcAgentSteps, tvcChatMessages, tvcStories } from "@/shared/schema"
import { desc, eq } from "drizzle-orm"
import { getDb } from "coze-coding-dev-sdk"
import type { StoryContext } from "./vibeCreatingTypes"

export async function loadStoryContext(params: { storyId: string; userId: string }): Promise<StoryContext> {
  const { storyId, userId } = params
  await ensureTvcSchema()
  const db = await getDb({ tvcStories, tvcAgentSteps, tvcChatMessages })

  const [story] = await db
    .select({ id: tvcStories.id, userId: tvcStories.userId, metadata: tvcStories.metadata })
    .from(tvcStories)
    .where(eq(tvcStories.id, storyId))
    .limit(1)

  if (!story || story.userId !== userId) throw new ServiceError("NOT_FOUND", "项目不存在")

  const recentMessages = await db
    .select({ role: tvcChatMessages.role, content: tvcChatMessages.content })
    .from(tvcChatMessages)
    .where(eq(tvcChatMessages.storyId, storyId))
    .orderBy(desc(tvcChatMessages.createdAt))
    .limit(40)

  const steps = await db
    .select({ stepId: tvcAgentSteps.stepId, rawXml: tvcAgentSteps.rawXml, updatedAt: tvcAgentSteps.updatedAt })
    .from(tvcAgentSteps)
    .where(eq(tvcAgentSteps.storyId, storyId))
    .orderBy(desc(tvcAgentSteps.updatedAt))

  const stepsById: Record<string, { stepId: string; rawXml: string; updatedAt: Date }> = {}
  for (const s of steps) {
    if (!stepsById[s.stepId]) stepsById[s.stepId] = s
  }

  return {
    storyId,
    userId,
    recentMessages: recentMessages.reverse() as any,
    stepsById,
    metadata: (story.metadata ?? {}) as Record<string, unknown>
  }
}

