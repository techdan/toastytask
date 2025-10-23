import { sql } from "drizzle-orm";
import {
  serial,
  pgTable,
  text,
  real,
  integer,
  boolean,
  timestamp,
  index
} from "drizzle-orm/pg-core";

// Projects table
export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  colorHex: text("color_hex").notNull().default("#6b7280"), // neutral-500
  archived: boolean("archived").notNull().default(false),
  userId: text("user_id"), // Clerk user ID for multi-tenancy (nullable for migration)
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
    .notNull()
    .default(sql`(NOW() AT TIME ZONE 'UTC')`),
}, (table) => ({
  // Index for filtering projects by user
  userIdIdx: index("projects_user_id_idx").on(table.userId),
}));

// Tasks table
export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  projectId: integer("project_id").references(() => projects.id),
  userId: text("user_id"), // Clerk user ID for multi-tenancy (nullable for migration)

  // Core fields for Phase 1
  priority: text("priority", { enum: ["low", "medium", "high", "top"] })
    .notNull()
    .default("medium"),
  star: boolean("star").notNull().default(false),
  dueAt: timestamp("due_at", { mode: "date", withTimezone: true }),

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
  lastTouchedAt: timestamp("last_touched_at", { mode: "date", withTimezone: true }),
  nextSurfaceAt: timestamp("next_surface_at", { mode: "date", withTimezone: true }),

  // Calculated fields
  importanceV1: integer("importance_v1").notNull().default(0),

  // Notes metadata (populated by API, not stored in DB)
  // These are added in memory when fetching tasks
  // notesCount?: number;
  // notesLastModified?: Date;

  // Status fields
  completedAt: timestamp("completed_at", { mode: "date", withTimezone: true }),
  archivedAt: timestamp("archived_at", { mode: "date", withTimezone: true }),
  deletedAt: timestamp("deleted_at", { mode: "date", withTimezone: true }),

  // Timestamps
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
    .notNull()
    .default(sql`(NOW() AT TIME ZONE 'UTC')`),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
    .notNull()
    .default(sql`(NOW() AT TIME ZONE 'UTC')`),
}, (table) => ({
  // Index for filtering tasks by user (critical for multi-tenancy)
  userIdIdx: index("tasks_user_id_idx").on(table.userId),
  // Composite index for user's active tasks
  userIdDeletedAtIdx: index("tasks_user_id_deleted_at_idx").on(table.userId, table.deletedAt),
  // Index for filtering tasks by project and excluding deleted ones
  projectIdDeletedAtIdx: index("tasks_project_id_deleted_at_idx").on(table.projectId, table.deletedAt),
  // Index for sorting tasks by heat within each bucket
  bucketHeatIdx: index("tasks_bucket_heat_idx").on(table.bucket, table.heat),
  // Index for sorting by due date (common in task views)
  dueAtIdx: index("tasks_due_at_idx").on(table.dueAt),
  // Index for filtering completed tasks
  completedAtIdx: index("tasks_completed_at_idx").on(table.completedAt),
  // Composite index for active tasks sorted by importance
  activeImportanceIdx: index("tasks_active_importance_idx").on(table.deletedAt, table.importanceV1),
}));

// Settings table (single row for user preferences)
export const settings = pgTable("settings", {
  id: serial("id").primaryKey(),
  userId: text("user_id"), // Clerk user ID for multi-tenancy (nullable for migration)

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

  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
    .notNull()
    .default(sql`(NOW() AT TIME ZONE 'UTC')`),
}, (table) => ({
  // Index for filtering settings by user
  userIdIdx: index("settings_user_id_idx").on(table.userId),
}));

// Note tables for per-line versioned notes
export const noteRows = pgTable("note_rows", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  ordinal: integer("ordinal").notNull(), // Order of lines in the note
  activeVersionId: integer("active_version_id"), // Points to current version
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
    .notNull()
    .default(sql`(NOW() AT TIME ZONE 'UTC')`),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
    .notNull()
    .default(sql`(NOW() AT TIME ZONE 'UTC')`),
}, (table) => ({
  // Index for fetching notes efficiently in order for a given task
  taskIdOrdinalIdx: index("note_rows_task_id_ordinal_idx").on(table.taskId, table.ordinal),
}));

export const noteRowVersions = pgTable("note_row_versions", {
  id: serial("id").primaryKey(),
  noteRowId: integer("note_row_id")
    .notNull()
    .references(() => noteRows.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
    .notNull()
    .default(sql`(NOW() AT TIME ZONE 'UTC')`),
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
