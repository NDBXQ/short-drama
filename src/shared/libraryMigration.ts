import { getDb } from "coze-coding-dev-sdk"
import { publicResources, sharedResources } from "@/shared/schema"
import { logger } from "@/shared/logger"
import { sql } from "drizzle-orm"

export async function ensureSmoothLibraryMigration(userId: string, traceId: string): Promise<{
  assignedCount: number
  movedSeedCount: number
  demoInsertedCount: number
}> {
  const start = Date.now()
  const db = await getDb({ publicResources, sharedResources })

  const pending = await db.execute(sql`
    SELECT 1
    FROM ${publicResources} pr
    WHERE pr.user_id IS NULL
    LIMIT 1
  `)
  const hasPending = Array.isArray((pending as any)?.rows) ? (pending as any).rows.length > 0 : Boolean((pending as any)?.rowCount)

  let movedSeedCount = 0
  let assignedCount = 0

  if (hasPending) {
    const movedSeed = await db.execute(sql`
      INSERT INTO ${sharedResources} (
        id,
        type,
        source,
        name,
        description,
        preview_url,
        preview_storage_key,
        original_url,
        original_storage_key,
        tags,
        applicable_scenes,
        created_at
      )
      SELECT
        pr.id,
        pr.type,
        'seed',
        pr.name,
        pr.description,
        pr.preview_url,
        pr.preview_storage_key,
        pr.original_url,
        pr.original_storage_key,
        pr.tags,
        pr.applicable_scenes,
        pr.created_at
      FROM ${publicResources} pr
      WHERE pr.user_id IS NULL AND pr.source = 'seed'
      ON CONFLICT (id) DO NOTHING
    `)
    movedSeedCount = Number((movedSeed as any)?.rowCount ?? 0)

    await db.execute(sql`
      DELETE FROM ${publicResources} pr
      WHERE pr.user_id IS NULL AND pr.source = 'seed'
    `)

    const assigned = await db.execute(sql`
      UPDATE ${publicResources} pr
      SET user_id = ${userId}
      WHERE pr.user_id IS NULL
    `)
    assignedCount = Number((assigned as any)?.rowCount ?? 0)

    logger.info({
      event: "library_smooth_migration_applied",
      module: "library",
      traceId,
      message: "资源库平滑迁移已执行",
      userId,
      movedSeedCount,
      assignedCount
    })
  }

  const sharedAny = await db.execute(sql`
    SELECT 1
    FROM ${sharedResources} sr
    LIMIT 1
  `)
  const sharedHasAny = Array.isArray((sharedAny as any)?.rows) ? (sharedAny as any).rows.length > 0 : Boolean((sharedAny as any)?.rowCount)

  let demoInsertedCount = 0
  if (!sharedHasAny) {
    const inserted = await db.execute(sql`
      INSERT INTO ${sharedResources} (
        id,
        type,
        source,
        name,
        description,
        preview_url,
        preview_storage_key,
        original_url,
        original_storage_key,
        tags,
        applicable_scenes,
        created_at
      )
      SELECT
        gen_random_uuid(),
        pr.type,
        'seed',
        pr.name,
        pr.description,
        pr.preview_url,
        pr.preview_storage_key,
        pr.original_url,
        pr.original_storage_key,
        pr.tags,
        pr.applicable_scenes,
        pr.created_at
      FROM ${publicResources} pr
      WHERE pr.user_id = ${userId}
      ORDER BY pr.created_at DESC
      LIMIT 12
    `)
    demoInsertedCount = Number((inserted as any)?.rowCount ?? 0)
    if (demoInsertedCount > 0) {
      logger.info({
        event: "library_shared_demo_seeded",
        module: "library",
        traceId,
        message: "共享资源库已自动填充演示数据",
        userId,
        demoInsertedCount
      })
    }
  }

  if (hasPending || demoInsertedCount > 0) {
    logger.info({
      event: "library_smooth_migration_done",
      module: "library",
      traceId,
      message: "资源库平滑迁移完成",
      userId,
      assignedCount,
      movedSeedCount,
      demoInsertedCount,
      durationMs: Date.now() - start
    })
  }

  return { assignedCount, movedSeedCount, demoInsertedCount }
}

