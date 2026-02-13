import { sql } from "drizzle-orm"
import { boolean, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core"
import { createInsertSchema, createUpdateSchema } from "drizzle-zod"
import { z } from "zod"

export const users = pgTable("users", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  email: text("email"),
  isActive: boolean("is_active").notNull().default(true),
  metadata: text("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
  password: text("password").notNull()
})

export const userSecurity = pgTable("user_security", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  roleKey: text("role_key").notNull().default("user"),
  tokenVersion: integer("token_version").notNull().default(1),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  passwordUpdatedAt: timestamp("password_updated_at", { withTimezone: true }),
  failedLoginCount: integer("failed_login_count").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  disabledAt: timestamp("disabled_at", { withTimezone: true }),
  disabledReason: text("disabled_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
})

export const auditLogs = pgTable("audit_logs", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  actorUserId: text("actor_user_id"),
  action: text("action").notNull(),
  targetType: text("target_type").notNull().default("user"),
  targetId: text("target_id"),
  targetUserId: text("target_user_id"),
  before: jsonb("before").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  after: jsonb("after").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  ip: text("ip"),
  userAgent: text("user_agent"),
  traceId: text("trace_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
})

export const insertUserSchema = createInsertSchema(users, {
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().min(1).max(200).optional(),
  password: z.string().min(1)
})

export const updateUserSchema = createUpdateSchema(users, {
  name: z.string().trim().min(1).max(100).optional(),
  email: z.string().trim().min(1).max(200).optional(),
  password: z.string().min(1).optional()
})

export type User = typeof users.$inferSelect
export type InsertUser = typeof users.$inferInsert
export type UpdateUser = z.infer<typeof updateUserSchema>

export type UserSecurity = typeof userSecurity.$inferSelect
export type AuditLog = typeof auditLogs.$inferSelect
