# Mobile Task Edit: Detail View + API Mapping

This document specifies the mobile Task Detail screen for viewing and editing a single task. It defines the on‑screen rows, their behaviors, and the exact mapping to API responses (fetch) and requests (save), matching the current server routes in this repo.

## Layout (top → bottom)

- Top Row: `[]` checkbox + task title (editable). Right edge shows a badge that toggles between Heat and Importance on tap, and a multi‑level star control.
- Notes Row: Multi‑line text area.
- Priority Row: Segmented control or picker.
- Due Date Row: Date picker (optional clear to null).
- Project Row: Dropdown (fetches projects).
- Repeat Row: Dropdown of repeat options.

Notes on the top row:
- Heat/Importance badge: Tapping toggles which metric is displayed; this does not change server state.
- Star control: Cycles through levels on tap (off → blue → yellow → orange → off).

## Field → API mapping

- Title (task text)
  - Fetch: `task.title` (GET /api/tasks)
  - Update: `PATCH /api/tasks/:id` with `{ title: string }`

- Completed (checkbox)
  - Fetch: `task.completedAt` (null = not completed)
  - Update: Complete → `POST /api/tasks/:id/complete`; Uncomplete → `DELETE /api/tasks/:id/complete`

- Heat/Importance badge (right side, read‑only toggle)
  - Heat fetch: `task.heat` (server recalculated on GET /api/tasks)
  - Importance display: calculated on client from base fields (importance is not persisted nor returned by API responses). Use `calculateImportanceV1(task)` on the client.
  - No update call when toggling the display.

- Star (multi‑level; “tri‑state” UI plus off)
  - Values: `starLevel` integer 0..3 → 0=off, 1=blue, 2=yellow, 3=orange
  - Fetch: `task.starLevel`
  - Update: `POST /api/tasks/:id/star` (cycles to next level and updates heat server‑side)

- Due Date
  - Value: `dueAt` (nullable)
  - Fetch: `task.dueAt` (Date in response)
  - Update: `PATCH /api/tasks/:id` with `{ dueAt: string | number | null }` (send ISO 8601 string or `null` to clear). Server coerces to Date and recalculates heat.

- Notes (multi‑line text)
  - Fetch: `task.notes` array (attached by server in GET /api/tasks)
    - Shape: `{ id, currentText, updatedAt }[]` plus `notesCount`, `notesLastModified`
  - Update: Notes editing endpoints are not yet exposed under `/api/notes` in this repo. Mobile can display and, if needed, stage edits locally for a future endpoint (out of scope of current API). Task save (PATCH) does not accept notes content.
  - Display behavior: Plain text is rendered; any `http://` or `https://` URLs are auto‑linked and open in a new browser tab/window (`target="_blank"`, `rel="noopener noreferrer"`). Tapping a link does not enter edit mode.

- Priority
  - Values: `"low" | "medium" | "high" | "top"`
  - Fetch: `task.priority`
  - Update: `PATCH /api/tasks/:id` with `{ priority }`

- Project
  - Values: project selection by `projectId` (number) or `null` for “No project”
  - Fetch: `task.projectId`
  - Update: `PATCH /api/tasks/:id` with `{ projectId: number | null }`
  - Populate dropdown: `GET /api/projects` (see example below)

- Repeat
  - Values: `"none" | "daily" | "weekly" | "monthly"` (maps to `repeatType`)
  - Fetch: `task.repeatType`
  - Update: `PATCH /api/tasks/:id` with `{ repeatType }`
  - Behavior: Completing a task with `repeatType !== "none"` advances `dueAt` instead of setting `completedAt` (server logic).

Optional (not surfaced as a row here, but part of the model):
- Bucket: `bucket` ("todo" | "watch" | "later"). Not required on this screen.

## Fetching a task for the detail screen

- Use `GET /api/tasks` (returns `{ tasks: Task[] }`) and select by `id` from the client cache (TanStack Query) to hydrate the detail view. The server attaches notes and recalculates heat on the fly.

Example response item (abbreviated):

```json
{
  "id": 123,
  "title": "Update onboarding flow",
  "priority": "high",
  "starLevel": 2,
  "projectId": 7,
  "repeatType": "none",
  "dueAt": null,
  "heat": 63.2,
  "heatAdjustment": 5,
  "lastTouchedAt": "2025-11-08T15:04:05.000Z",
  "lastHeatTouchedAt": null,
  "createdAt": "2025-11-01T12:00:00.000Z",
  "updatedAt": "2025-11-08T15:04:05.000Z",
  "notes": [
    { "id": 10, "currentText": "Draft copy ready", "updatedAt": "2025-11-07T10:00:00.000Z" }
  ],
  "notesCount": 1,
  "notesLastModified": "2025-11-07T10:00:00.000Z"
}
```

## Saving changes (Save button)

- Endpoint: `PATCH /api/tasks/:id`
- Send only changed fields. Server recalculates heat using fresh importance and returns the updated task.

Example requests:

- Edit title and priority
```http
PATCH /api/tasks/123
Content-Type: application/json

{ "title": "Update onboarding UX", "priority": "top" }
```

- Move to a project and set repeat
```http
PATCH /api/tasks/123
Content-Type: application/json

{ "projectId": 7, "repeatType": "weekly" }
```

- Clear project
```http
PATCH /api/tasks/123
Content-Type: application/json

{ "projectId": null }
```

- Set due date
```http
PATCH /api/tasks/123
Content-Type: application/json

{ "dueAt": "2025-11-15T23:59:00.000Z" }
```

- Clear due date
```http
PATCH /api/tasks/123
Content-Type: application/json

{ "dueAt": null }
```

Completion toggle (checkbox):
- Complete: `POST /api/tasks/123/complete`
- Uncomplete: `DELETE /api/tasks/123/complete`

Star toggle (top row control):
- Cycle level: `POST /api/tasks/123/star` (server responds with `{ task, oldStarLevel, newStarLevel, starPoints }`)

## Projects dropdown (data source)

- Endpoint: `GET /api/projects`
- Optional query: `?includeArchived=true` to include archived projects.
- Response shape: `{ projects: { id, name, colorHex, sortOrder, archived, createdAt, updatedAt }[] }`

Example:
```http
GET /api/projects
```

```json
{
  "projects": [
    { "id": 7, "name": "App", "colorHex": "#6b7280", "sortOrder": 1, "archived": false },
    { "id": 9, "name": "Marketing", "colorHex": "#f59e0b", "sortOrder": 2, "archived": false }
  ]
}
```

## Interaction semantics (touches)

- Any edit via PATCH, completion toggle, project change, priority change, or star cycle updates `lastTouchedAt`.
- Heat/Cool actions update `lastHeatTouchedAt` and `lastTouchedAt`.
- The “untouched” status is when both `lastTouchedAt` and `lastHeatTouchedAt` are null (see mobile-styles-heat-importance-priority.md for list behavior).

## Display specifics (top row)

- Heat badge: color per docs/mobile-styles-heat-importance-priority.md (Heat chips 0–145 scale). Value from `task.heat`.
- Importance badge (on toggle): score 2–14 computed locally; colors per the same doc.
- Star: visual levels map to `starLevel` 0..3. Tapping cycles via `/api/tasks/:id/star`.

## Notes

- The prior duplicate Priority row is fixed; the second row is Due Date as specified here.
