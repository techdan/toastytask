# Toodle Mobile App Reference

This document equips mobile engineers (and AI agents) with the context and interfaces needed to build an Android UI that talks to the existing Toodle backend. It pairs a product-level overview with a comprehensive catalog of every server endpoint exposed under `/api`.

---

## 1. Product & Feature Overview

### App Summary
- **ToastyTask** is a personal task manager inspired by Toodledo that mixes deterministic importance scoring with a manual heat tuning model.
- The web app is built with **Next.js 15**, **React 19**, **TypeScript (strict)**, **Tailwind v4**, and **Drizzle ORM** on PostgreSQL.
- Authentication is handled by **Clerk**; every task, project, and settings row is scoped to a Clerk `userId`.

### Core User Experience
- **Buckets:** Tasks live in Todo, Watch, or Later buckets to reflect near-term vs. long-tail focus.
- **Importance v1:** Deterministic score (2–12) computed from priority, due date, and star level (compatibility with Toodledo).
- **Heat v3/v4:** Point-based score (0–145) combining importance, recent touches, and manual heat adjustments (heat/cool buttons).
- **Projects:** Optional grouping with color coding; archiving hides inactive projects.
- **Notes:** Per-task, per-line notes with version history; API presents the flattened text lines for mobile simplicity.
- **Recurrence:** Daily/weekly/monthly repeats advance the due date on completion instead of closing the task.
- **Settings:** Per-user defaults for new tasks and knobs for the heat/automation engines.

### Mobile Feature Targets
1. **Home buckets view** mirroring Todo/Watch/Later tabs with heat-sorted lists.
2. **Task detail sheet** exposing core metadata, manual heat, notes editing, recurrence, and project assignment.
3. **Heat tuning gestures** for “Heat”, “Cool”, and star cycling.
4. **Notes editing** that treats the note text as a single multi-line field (the server handles line/version management).
5. **Project browser** with creation/edit and archived filtering.
6. **Settings sync** so defaults stay aligned between web and mobile.

Refer back to `docs/requirements.md` for deeper UX and automation rules when designing mobile flows.

---

## 2. Integration Basics

### Base URLs
- **Local development:** `http://localhost:3000`
- **Production:** Determined by deployment (e.g., Vercel). Replace the host while keeping `/api/...` paths intact.

### Authentication (Clerk)
- All API routes are protected by `middleware.ts` via Clerk.
- Mobile clients should authenticate with Clerk (React Native SDK or straight REST) and attach a **session token** on every request:
  - Header: `Authorization: Bearer <Clerk session token>`
  - Clerk also honors `Cookie`-based auth, but bearer tokens are recommended for native apps.
- When a session is invalid or missing you receive `401 {"error":"Unauthorized"}`.

### Authorization & Ownership
- Beyond authentication, all endpoints verify **resource ownership** before allowing access.
- Task endpoints verify that the task belongs to the authenticated user; returns `404` if not found or not owned.
- Project endpoints verify that the project belongs to the authenticated user.
- Settings endpoints automatically scope to the authenticated user.
- This prevents authenticated users from accessing other users' data by guessing IDs.

### Request & Response Conventions
- Content type: `application/json`
- Datetimes are ISO 8601 strings in UTC (e.g., `"2025-10-30T01:37:52.123Z"`). Integers occasionally appear from database drivers; treat as Unix ms timestamps.
- IDs are numeric except Clerk `userId` (string) and project colors (`#rrggbb`).
- Error responses follow `{ "error": string }` with 4xx/5xx status codes.

### Enumerations
- `priority`: `"low" | "medium" | "high" | "top"`
- `bucket`: `"todo" | "watch" | "later"`
- `repeatType`: `"none" | "daily" | "weekly" | "monthly"`
- `starLevel`: `0 | 1 | 2 | 3` (0 none, 1 blue, 2 yellow, 3 orange)

---

## 3. Domain Models

### Task Object
| Field | Type | Notes |
| --- | --- | --- |
| `id` | number | Primary key |
| `title` | string | Required |
| `projectId` | number \| null | Optional association |
| `userId` | string | Clerk user id |
| `priority` | enum | See above |
| `bucket` | enum | Todo/Watch/Later |
| `starLevel` | 0–3 | Replaces deprecated boolean `star` |
| `dueAt` | string \| null | ISO datetime |
| `repeatType` | enum | Drives recurrence on completion |
| `heat` | number | 0–145 points (always recalculated server-side) |
| `heatCalculatedAt` | string \| null | Timestamp of the last heat recompute |
| `heatAdjustment` | number | Manual +/- adjustment capped ±45 |
| `lastHeatTouchedAt` | string \| null | Last heat/cool interaction |
| `lastTouchedAt` | string \| null | Any touch (heat, star, notes) |
| `importanceV1` | number | 2–12 |
| `completedAt` / `archivedAt` / `deletedAt` | string \| null | Soft-state markers |
| `createdAt`, `updatedAt` | string | Audit fields |
| `notes` | Array\<NoteRow\> | Injected by API list/detail responses |
| `notesCount` | number | Derived |
| `notesLastModified` | string \| null | Derived |

### NoteRow Object
| Field | Type | Notes |
| --- | --- | --- |
| `id` | number | Row id |
| `taskId` | number | Owning task |
| `ordinal` | number | Line ordering |
| `activeVersionId` | number \| null | Pointer to latest version |
| `currentText` | string | Present only in API responses |
| `createdAt`, `updatedAt` | string | Audit fields |

### Project Object
| Field | Type | Notes |
| --- | --- | --- |
| `id` | number | Primary key |
| `name` | string | Required |
| `colorHex` | string | `#6b7280` default |
| `archived` | boolean | Controls nav visibility |
| `userId` | string | Clerk id |
| `createdAt`, `updatedAt` | string | Audit fields |

### Settings Object
Fields mirror `lib/db/schema.ts`. Important groups:
- **Defaults:** `defaultPriority`, `defaultBucket`, `defaultDueDate`
- **Heat decay:** `heatDecayHalfLifeTodo`, `heatDecayHalfLifeWatch`, `heatDecayHalfLifeLater`
- **Automation thresholds:** `escalationThreshold`, `deEscalationThresholdTodoWatch`, `deEscalationThresholdWatchLater`, `retirementThreshold`, `retirementDays`
- **Snooze presets:** `snoozeTodoDays`, `snoozeWatchDays`, `snoozeLaterDays`
- **UI:** `groupingMode`, `sortMode`
- `updatedAt` tracks last change.

---

## 4. Endpoint Reference

Unless noted, every endpoint requires Clerk authentication and returns JSON.

### 4.1 Tasks Collection

#### `GET /api/tasks`
- **Purpose:** Fetch active tasks, optionally filtered by project or completion.
- **Query params:**
  - `projectId` (optional): Number, `"null"` for unassigned.
  - `includeCompleted` (optional): `"true"` to include completed tasks.
- **Behavior highlights:**
  - Server recalculates `importanceV1` and `heat` for every task on the fly. If stored heat is stale it writes the fresh value back to the DB.
  - Notes are eagerly joined and flattened into `notes`, `notesCount`, `notesLastModified`.
  - Results sorted by importance, then due date, then recency.
- **Response:**
  ```json
  {
    "tasks": [Task, ...]
  }
  ```

#### `POST /api/tasks`
- **Purpose:** Create a new task.
- **Request body:**
  ```json
  {
    "title": "string (required)",
    "priority": "low|medium|high|top",
    "bucket": "todo|watch|later",
    "starLevel": 0,
    "dueAt": "2025-11-01T17:00:00.000Z",
    "projectId": 12,
    "repeatType": "none"
  }
  ```
  - `priority`, `bucket`, `starLevel`, `repeatType` default to user settings when omitted.
- **Behavior highlights:** Server computes `importanceV1`, the point-based `heat`, and stamps `heatCalculatedAt`.
- **Response:** `{ "task": Task }` with all derived fields populated.

### 4.2 Task Detail

#### `PATCH /api/tasks/{id}`
- **Purpose:** Partial update of any task field.
- **Body:** Any subset of mutable fields (`title`, `priority`, `bucket`, `starLevel`, `dueAt`, `projectId`, `repeatType`, `completedAt`, etc.).
- **Normalization:** Date strings/numbers are converted to `Date` instances. Heat/importance are recalculated if priority, star, or due date change.
- **Response:** `{ "task": Task }` (fresh copy after recalculation).

#### `DELETE /api/tasks/{id}`
- **Purpose:** Soft-delete a task (sets `deletedAt`).
- **Response:** `{ "success": true }`

### 4.3 Task Completion

#### `POST /api/tasks/{id}/complete`
- **Purpose:** Mark a task complete (or advance recurring due dates).
- **Behavior:** If `repeatType != "none"`, the due date advances (daily/weekly/monthly) and task remains active. Otherwise `completedAt` is set.
- **Response:** `{ "task": Task }`

#### `DELETE /api/tasks/{id}/complete`
- **Purpose:** Undo completion (`completedAt` set to null).
- **Response:** `{ "task": Task }`

### 4.4 Heat & Cool Controls

Both endpoints accept optional context from the client to avoid refetching the entire task list; if omitted, the server computes context internally.

#### `POST /api/tasks/{id}/heat`
- **Body:**
  ```json
  {
    "increment": 3,               // optional manual boost (1..5 points)
    "visibleTasks": [
      { "id": 42, "heat": 120.4 }, // optional context to position the task
      ...
    ]
  }
  ```
- **Behavior:** Applies asymmetric decay, resolves a target heat that moves the task up one position, clamps to `HEAT_CONFIG.MAX_FINAL_SCORE`, and persists the resulting `heatAdjustment`.
- **Response:**
  ```json
  {
    "task": Task,
    "heatDelta": 4.2,
    "adjustmentDelta": 3.5,
    "heatBreakdown": {
      "importancePoints": 80,
      "recencyPoints": 4,
      "adjustmentPoints": 25,
      "totalHeat": 109,
      "baseImportanceNormalized": 0.84,
      "recencyNormalized": 0.8,
      "heatAdjustment": 25,
      "daysSinceLastTouch": 0.3,
      "decayInfo": { "originalAdjustment": 20, "decayedAdjustment": 18.5, "daysSinceHeatTouch": 2 }
    },
    "baselineHeat": 104.8,
    "boost": 5,
    "targetHeat": 109.8
  }
  ```
  - `heatBreakdown` follows `HeatV3Breakdown` in `lib/scoring/heat-v3.ts`.

#### `POST /api/tasks/{id}/cool`
- **Body:**
  ```json
  {
    "decrement": -6,           // optional manual drop (-1..-10)
    "visibleTasks": [{ "id": 84, "heat": 112.1 }]
  }
  ```
- **Behavior:** Moves the task down three positions by default, applying faster decay (3-day half-life) to prior adjustments. Same response shape as `/heat`, but the delta values will be negative and the payload includes `drop` instead of `boost`.
- **Response Keys:** `task`, `heatDelta`, `adjustmentDelta`, `heatBreakdown`, `baselineHeat`, `drop`, `targetHeat`.

### 4.5 Star Cycling

#### `POST /api/tasks/{id}/star`
- **Purpose:** Rotate `starLevel` through 0 → 1 → 2 → 3 → 0.
- **Behavior:** Updates `starLevel`, recomputes `importanceV1`, recalculates `heat`, updates `lastTouchedAt`, and returns the fresh task.
- **Response:**
  ```json
  {
    "task": Task,
    "oldStarLevel": 1,
    "newStarLevel": 2,
    "starPoints": 2
  }
  ```

### 4.6 Notes

#### `GET /api/tasks/{id}/notes`
- **Purpose:** Fetch all note lines for a task.
- **Response:** `{ "notes": NoteRow[] }`
- **Security:** Verifies authentication and task ownership. Returns 404 if task doesn't exist or doesn't belong to the authenticated user.

#### `POST /api/tasks/{id}/notes`
- **Purpose:** Create/update the note text as a whole.
- **Body:**
  ```json
  { "text": "First line\nSecond line" }
  ```
- **Behavior:**
  - Splits text on newline characters.
  - Creates/updates individual note rows and versions only when text changes.
  - Blank/whitespace-only text deletes all note rows.
- **Response:** `{ "notes": NoteRow[] }` (post-update snapshot).

#### `PATCH /api/notes/{noteId}`
- **Purpose:** Update a single note line's text.
- **Body:** `{ "text": "Revised line" }`
- **Behavior:**
  - Creates a new version for the note row and advances `activeVersionId`.
  - If the text is unchanged (strict equality), returns existing note without side effects.
  - Touches the parent task, recomputes importance and heat.
- **Response:** `{ "note": NoteRow }` (with `currentText` reflecting the new version).

#### `DELETE /api/notes/{noteId}`
- **Purpose:** Delete a single note line.
- **Behavior:** Removes the row, compacts ordinals for remaining lines, touches the parent task, and recomputes heat.
- **Response:** `{ "success": true }`

### 4.7 Projects

#### `GET /api/projects`
- **Query params:** `includeArchived=true` to include archived projects.
- **Behavior:** Results sorted alphabetically by name.
- **Response:** `{ "projects": Project[] }`

#### `POST /api/projects`
- **Body:** `{ "name": "Inbox", "colorHex": "#F97316" }`
- **Response:** `{ "project": Project }`

#### `PATCH /api/projects/{id}`
- **Body:** Any subset of `name`, `colorHex`, `archived`.
- **Response:** `{ "project": Project }`

#### `DELETE /api/projects/{id}`
- **Behavior:** Hard delete. Will fail with `500` if tasks still reference the project (database foreign-key constraint).
- **Response:** `{ "success": true }`

### 4.8 Settings

#### `GET /api/settings`
- **Behavior:** Fetches the user’s settings; automatically seeds defaults if missing.
- **Response:** `{ "settings": Settings }`

#### `PATCH /api/settings`
- **Body:** Partial settings object with fields to override (e.g., `{ "defaultBucket": "watch" }`).
- **Response:** `{ "settings": Settings }`

---

## 5. Mobile Implementation Notes

- **Heat recalculation side effects:** Some GET routes recompute heat and write back to the database. Mobile clients should treat responses as authoritative and refresh cached lists after calling mutation endpoints.
- **Recurrence awareness:** After calling `/complete`, the same task id may remain active with a new `dueAt`. Make sure list views refresh to reflect the updated due date.
- **Project deletes:** Because deletes are hard, expose an archive option in mobile UI or warn users before deletion if tasks exist.
- **Notes editing UX:** Since the API expects a full-text blob, mobile editors can work with a single multi-line text area and rely on the backend to diff lines.
- **Clerk session management:** Renew tokens proactively; 401s mean the mobile client should re-authenticate and retry.
- **Version compatibility:** Heat v3/v4 logic lives in `lib/scoring`. If the mobile app wants to mirror calculations locally, reuse the constants from `lib/scoring/heat-config.ts` and `heat-algorithm-v3.md`.

This reference should give a mobile agent everything needed to build, sync, and test an Android client against the current Toodle backend.
