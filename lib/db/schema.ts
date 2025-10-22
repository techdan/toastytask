import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, real, index } from "drizzle-orm/sqlite-core";

// Projects table
export const projects = sqliteTable("projects", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  colorHex: text("color_hex").notNull().default("#6b7280"), // neutral-500
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

// Tasks table
export const tasks = sqliteTable("tasks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  projectId: integer("project_id").references(() => projects.id),

  // Core fields for Phase 1
  priority: text("priority", { enum: ["low", "medium", "high", "top"] })
    .notNull()
    .default("medium"),
  star: integer("star", { mode: "boolean" }).notNull().default(false),
  dueAt: integer("due_at", { mode: "timestamp" }),

  // Bucket (Phase 2)
  bucket: text("bucket", { enum: ["todo", "watch", "later"] })
    .notNull()
    .default("todo"),

  // Recurrence (Phase 7)
  repeatType: text("repeat_type", { enum: ["none", "daily", "weekly", "monthly"] })
    .notNull()
    .default("none"),

  // Heat model fields (Phase 3)
  heat: real("heat").notNull().default(0.0),
  touchCount: integer("touch_count").notNull().default(0),
  lastTouchedAt: integer("last_touched_at", { mode: "timestamp" }),
  nextSurfaceAt: integer("next_surface_at", { mode: "timestamp" }),

  // Calculated fields
  importanceV1: integer("importance_v1").notNull().default(0),

  // Notes metadata (populated by API, not stored in DB)
  // These are added in memory when fetching tasks
  // notesCount?: number;
  // notesLastModified?: Date;

  // Status fields
  completedAt: integer("completed_at", { mode: "timestamp" }),
  archivedAt: integer("archived_at", { mode: "timestamp" }),
  deletedAt: integer("deleted_at", { mode: "timestamp" }),

  // Timestamps
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
}, (table) => ({
  // Index for filtering tasks by project and excluding deleted ones
  projectIdDeletedAtIdx: index("tasks_project_id_deleted_at_idx").on(table.projectId, table.deletedAt),
  // Index for sorting tasks by heat within each bucket
  bucketHeatIdx: index("tasks_bucket_heat_idx").on(table.bucket, table.heat),
}));

// Settings table (single row for user preferences)
export const settings = sqliteTable("settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),

  // Default values for new tasks
  defaultPriority: text("default_priority", {
    enum: ["low", "medium", "high", "top"],
  })
    .notNull()
    .default("medium"),
  defaultBucket: text("default_bucket", { enum: ["todo", "watch", "later"] })
    .notNull()
    .default("todo"),
  defaultDueDate: text("default_due_date", {
    enum: ["none", "today", "tomorrow", "next_week"],
  })
    .notNull()
    .default("today"),

  // Heat model settings (Phase 3)
  heatDecayHalfLifeTodo: integer("heat_decay_half_life_todo")
    .notNull()
    .default(48), // hours
  heatDecayHalfLifeWatch: integer("heat_decay_half_life_watch")
    .notNull()
    .default(168), // 7 days
  heatDecayHalfLifeLater: integer("heat_decay_half_life_later")
    .notNull()
    .default(720), // 30 days
  activityNormalizationConstant: integer("activity_normalization_constant")
    .notNull()
    .default(20),
  newTaskHeatBoost: real("new_task_heat_boost").notNull().default(0.7),
  newTaskHeatHalfLife: integer("new_task_heat_half_life")
    .notNull()
    .default(24), // hours

  // Automation settings (Phase 4)
  escalationThreshold: real("escalation_threshold").notNull().default(0.75),
  deEscalationThresholdTodoWatch: real("de_escalation_threshold_todo_watch")
    .notNull()
    .default(0.25),
  deEscalationThresholdWatchLater: real("de_escalation_threshold_watch_later")
    .notNull()
    .default(0.15),
  retirementThreshold: real("retirement_threshold").notNull().default(0.05),
  retirementDays: integer("retirement_days").notNull().default(90),
  reviewCadenceWatch: integer("review_cadence_watch").notNull().default(7), // days
  reviewCadenceLater: integer("review_cadence_later").notNull().default(30), // days

  // Snooze presets (Phase 3)
  snoozeTodoDays: integer("snooze_todo_days").notNull().default(1),
  snoozeWatchDays: integer("snooze_watch_days").notNull().default(7),
  snoozeLaterDays: integer("snooze_later_days").notNull().default(30),

  // UI preferences
  groupingMode: text("grouping_mode", {
    enum: ["ungrouped", "importance", "heat"],
  })
    .notNull()
    .default("ungrouped"),

  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

// Note tables for per-line versioned notes
export const noteRows = sqliteTable("note_rows", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  taskId: integer("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  ordinal: integer("ordinal").notNull(), // Order of lines in the note
  activeVersionId: integer("active_version_id"), // Points to current version
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
}, (table) => ({
  // Index for fetching notes efficiently in order for a given task
  taskIdOrdinalIdx: index("note_rows_task_id_ordinal_idx").on(table.taskId, table.ordinal),
}));

export const noteRowVersions = sqliteTable("note_row_versions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  noteRowId: integer("note_row_id")
    .notNull()
    .references(() => noteRows.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

// Type exports for use in application code
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;

export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;

export type Settings = typeof settings.$inferSelect;
export type NewSettings = typeof settings.$inferInsert;

export type NoteRow = typeof noteRows.$inferSelect;
export type NewNoteRow = typeof noteRows.$inferInsert;

export type NoteRowVersion = typeof noteRowVersions.$inferSelect;
export type NewNoteRowVersion = typeof noteRowVersions.$inferInsert;
