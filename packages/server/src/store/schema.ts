import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, primaryKey, sqliteTable, text, unique, uniqueIndex } from "drizzle-orm/sqlite-core";

// Column names follow §3c; application rows always carry user_id.
export const users = sqliteTable("users", {
  userId: text("user_id").primaryKey(),
  createdAt: text("created_at").notNull(),
});
const owner = () => text("user_id").notNull().references(() => users.userId);
const timestamps = () => ({ createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull() });

export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(), userId: owner(), title: text("title"), ...timestamps(),
}, (t) => [unique().on(t.userId, t.id), index("conversations_user_updated").on(t.userId, t.updatedAt),
  check("conversation_title", sql`${t.title} IS NULL OR length(${t.title}) BETWEEN 1 AND 200`)]);

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(), userId: owner(), conversationId: text("conversation_id").notNull(),
  role: text("role", { enum: ["user", "assistant", "system"] }).notNull(), content: text("content").notNull(),
  safetyTier: integer("safety_tier"), modelId: text("model_id"), createdAt: text("created_at").notNull(),
}, (t) => [unique().on(t.userId, t.id),
  foreignKey({ columns: [t.userId, t.conversationId], foreignColumns: [conversations.userId, conversations.id] }).onDelete("cascade"),
  index("messages_user_conversation_created").on(t.userId, t.conversationId, t.createdAt),
  check("message_role", sql`${t.role} IN ('user','assistant','system')`),
  check("message_content", sql`length(${t.content}) > 0`),
  check("message_tier", sql`${t.safetyTier} IS NULL OR ${t.safetyTier} BETWEEN 0 AND 2`)]);

export const diaryEntries = sqliteTable("diary_entries", {
  id: text("id").primaryKey(), userId: owner(),
  origin: text("origin", { enum: ["manual", "excerpt", "ai_draft", "support_note"] }).notNull(),
  title: text("title"), content: text("content").notNull(),
  accessLevel: text("access_level", { enum: ["private", "ai_eligible"] }).notNull().default("private"),
  includeInHandoff: integer("include_in_handoff", { mode: "boolean" }).notNull(),
  tags: text("tags_json", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
  mood: integer("mood"), ...timestamps(),
}, (t) => [unique().on(t.userId, t.id), index("diary_user_updated").on(t.userId, t.updatedAt),
  index("diary_user_access").on(t.userId, t.accessLevel),
  check("diary_origin", sql`${t.origin} IN ('manual','excerpt','ai_draft','support_note')`),
  check("diary_access", sql`${t.accessLevel} IN ('private','ai_eligible')`),
  check("diary_content", sql`length(${t.content}) > 0`),
  check("diary_title", sql`${t.title} IS NULL OR length(${t.title}) <= 200`),
  check("diary_mood", sql`${t.mood} IS NULL OR ${t.mood} BETWEEN 1 AND 5`),
  check("diary_handoff", sql`${t.includeInHandoff} IN (0,1)`),
  check("diary_tags", sql`json_valid(${t.tags}) AND json_type(${t.tags}) = 'array'`)]);

export const memories = sqliteTable("memories", {
  id: text("id").primaryKey(), userId: owner(), content: text("content").notNull(),
  origin: text("origin", { enum: ["user", "ai_proposal"] }).notNull(),
  status: text("status", { enum: ["proposed", "approved", "rejected"] }).notNull(),
  accessLevel: text("access_level", { enum: ["private", "ai_eligible"] }).notNull().default("private"), ...timestamps(),
}, (t) => [unique().on(t.userId, t.id), index("memories_user_access_status").on(t.userId, t.accessLevel, t.status),
  check("memory_content", sql`length(${t.content}) > 0`),
  check("memory_origin", sql`${t.origin} IN ('user','ai_proposal')`),
  check("memory_status", sql`${t.status} IN ('proposed','approved','rejected')`),
  check("memory_user_approved", sql`${t.origin} != 'user' OR ${t.status} = 'approved'`),
  check("memory_access", sql`${t.accessLevel} IN ('private','ai_eligible')`)]);

export const devices = sqliteTable("devices", {
  id: text("id").primaryKey(), userId: owner(), label: text("label").notNull(),
  platform: text("platform", { enum: ["ios", "android", "web", "desktop"] }).notNull(),
  tokenHash: text("token_hash"), createdAt: text("created_at").notNull(),
  lastSeenAt: text("last_seen_at"), revokedAt: text("revoked_at"),
}, (t) => [index("devices_user").on(t.userId), unique().on(t.tokenHash),
  check("device_label", sql`length(${t.label}) BETWEEN 1 AND 100`),
  check("device_platform", sql`${t.platform} IN ('ios','android','web','desktop')`)]);

export const settings = sqliteTable("settings", {
  userId: owner().primaryKey(), useMemoriesDefault: integer("use_memories_default", { mode: "boolean" }).notNull().default(true),
  diaryDefaultAccessLevel: text("diary_default_access_level", { enum: ["private", "ai_eligible"] }).notNull().default("private"),
  updatedAt: text("updated_at").notNull(),
}, (t) => [check("settings_memories", sql`${t.useMemoriesDefault} IN (0,1)`),
  check("settings_access", sql`${t.diaryDefaultAccessLevel} IN ('private','ai_eligible')`)]);

// Polymorphic references retain §3c's shape. Migration triggers validate
// same-user endpoints on insert/update. Owner deletion removes links;
// source deletion retains content-free IDs for D16/D33.
export const provenance = sqliteTable("provenance", {
  userId: owner(), derivedType: text("derived_type", { enum: ["memory", "diary_entry"] }).notNull(),
  derivedId: text("derived_id").notNull(), sourceType: text("source_type", { enum: ["message", "diary_entry", "manual"] }).notNull(),
  sourceId: text("source_id"),
}, (t) => [uniqueIndex("provenance_link").on(t.userId, t.derivedType, t.derivedId, t.sourceType, sql`coalesce(${t.sourceId}, '')`),
  index("provenance_user_source").on(t.userId, t.sourceType, t.sourceId),
  check("provenance_derived", sql`${t.derivedType} IN ('memory','diary_entry')`),
  check("provenance_source", sql`(${t.sourceType} = 'manual' AND ${t.sourceId} IS NULL) OR (${t.sourceType} IN ('message','diary_entry') AND ${t.sourceId} IS NOT NULL)`)]);

export const messageContext = sqliteTable("message_context", {
  userId: owner(), messageId: text("message_id").notNull(),
  sourceType: text("source_type", { enum: ["diary_entry", "memory"] }).notNull(), sourceId: text("source_id").notNull(),
}, (t) => [primaryKey({ columns: [t.userId, t.messageId, t.sourceType, t.sourceId] }),
  foreignKey({ columns: [t.userId, t.messageId], foreignColumns: [messages.userId, messages.id] }).onDelete("cascade"),
  index("context_user_source").on(t.userId, t.sourceType, t.sourceId),
  check("context_source", sql`${t.sourceType} IN ('diary_entry','memory')`)]);

export const tombstones = sqliteTable("tombstones", {
  id: text("id").primaryKey(), userId: owner(), entityType: text("entity_type", { enum: ["conversation", "message", "diary_entry", "memory"] }).notNull(),
  entityId: text("entity_id").notNull(), reason: text("reason", { enum: ["user_deleted", "access_revoked", "expired"] }).notNull(),
  deletedAt: text("deleted_at").notNull(),
}, (t) => [index("tombstones_user_entity").on(t.userId, t.entityType, t.entityId),
  check("tombstone_type", sql`${t.entityType} IN ('conversation','message','diary_entry','memory')`),
  check("tombstone_reason", sql`${t.reason} IN ('user_deleted','access_revoked','expired')`)]);
