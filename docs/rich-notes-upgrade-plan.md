# Rich Notes Upgrade Plan (Non‑Destructive)

## Problem (as understood)
You have a to‑do app where each task has a notes field. Today, notes support a UX where each *visible row* (a line) shows a hover timestamp indicating when **that row** last changed.

### Current architecture (legacy notes)
- Notes are **not** stored as a single text blob.
- They are stored as individual rows:
  - `note_rows` represents visual lines (ordered by `ordinal`)
  - `note_row_versions` stores per-line version history
  - `note_rows.activeVersionId` points to the current version
- Sync:
  - Frontend sends full text
  - Backend splits by `\n`
  - A diff (equal/replace/insert/delete) is computed against existing `note_rows`
  - Only changed lines generate new versions; unchanged lines keep their timestamps

## Goal
Preserve the existing hover timestamp behavior (row-level “last changed”) **while adding rich formatting**:
- Bulleted lists and indentation (tabs)
- Images (inline, as their own “row”)
- Private per-user notes (multi-tenant)
- Clean, simple UX:
  - Typing `- ` converts to a bullet list item
  - Tab / Shift+Tab indents/outdents list items
  - Copy/paste an image inserts it inline in the note

## Constraints / preferences
- Avoid *destructive* changes to existing schema.
- It’s OK to **add** columns and **add** new tables.
- Avoid keeping two editable copies in sync (risk > benefit).
- Using Supabase free tier; prefer solutions that don’t require paid storage unless necessary.

---

## Options considered (and why we chose the final one)

### A) Keep legacy line-row system; store Markdown per line
**Pros:** minimal change; keeps row timestamps  
**Cons:** “rows” are too sensitive to wrapping/multi-line structures; images still require a storage story.

### B) Block-based rich notes with per-block versioning (recommended)
**Pros:** stable “row” semantics (a row is a block: paragraph/list item/image); best UX; timestamps remain meaningful; images become first-class rows.  
**Cons:** larger rewrite, but contained to a new subsystem.

### C) Two parallel writable copies (legacy + rich)
**Rejected:** even if compute cost is small, correctness and edge cases are high-risk (round-tripping images/structure, diverging version histories, conflict resolution).

**Decision:** Build a **new Rich Notes subsystem** with its own tables and versioning. After upgrade, **Rich Notes becomes the source of truth**, with an optional derived plaintext cache for export/rollback display.

---

# Final architecture

## 1) Task-level routing (cleanest approach)
Instead of a routing table, add fields to `tasks` so every task declares which notes system it uses.

### Add columns to `tasks` (non-destructive)
- `notes_mode` (enum/text): `'legacy' | 'rich'` (default `'legacy'`)
- `rich_note_id` (nullable FK to `rich_notes.id`)
- optional: `notes_upgraded_at` (timestamp)

**Why this is clean**
- No extra join to determine mode
- No “missing routing row” edge case
- Keeps all “what does this task use?” state in one place

> Legacy tables remain intact and can be retained indefinitely for rollback/inspection.

---

## 2) New tables for Rich Notes

### `rich_notes`
One row per task (when upgraded).
- `id` (PK)
- `task_id` (unique FK → `tasks.id`, on delete cascade)
- `user_id` (Clerk user id) for multi-tenancy / RLS checks
- timestamps

### `rich_note_blocks`
One DB row equals one **visual row** in the editor.
- `id` (PK)
- `rich_note_id` (FK)
- `block_uid` (UUID/text, client-generated, stable per block)
- `sort_key` (int/bigint) – ordering
- `type` (`paragraph | list_item | image` …)
- `active_version_id` (FK → `rich_note_block_versions.id`)
- timestamps

**Indexes**
- `(rich_note_id, sort_key)`
- unique `(rich_note_id, block_uid)`

### `rich_note_block_versions`
Per-block version history.
- `id` (PK)
- `block_id` (FK)
- `data` (jsonb snapshot of the block’s content)
- `created_at`

**Hover timestamp**
- Use the latest version timestamp for that block (or maintain `updated_at` on `rich_note_blocks` when a new active version is created).

### `rich_note_attachments`
Image metadata; actual bytes in Supabase Storage.
- `id` (PK)
- `user_id`
- `bucket`, `path` (storage location)
- `mime`, `size`, `width`, `height`
- optional: `sha256` (dedupe)
- timestamps

**Image blocks** reference `attachment_id`.

### Optional: `rich_notes_plaintext_cache`
Derived representation for export/search/rollback display.
- `rich_note_id` (PK/FK)
- `text`
- `updated_at`

This avoids trying to mirror legacy `note_rows` while still offering a “basic view” of rich notes.

---

## 3) Editor UX (clean and simple)
Use a structured rich text editor (e.g., TipTap/ProseMirror) configured for:
- **Markdown-like shortcuts**
  - typing `- ` at start creates a bullet list item
- **Indentation**
  - Tab / Shift+Tab indent/outdent list items (mapped to list nesting or an `indent` attribute)
- **Inline image paste**
  - paste/drag-drop inserts an `image` block immediately as a placeholder row
  - upload begins in background
  - placeholder updates to the finalized attachment reference

### Block identity is critical
Each editor block carries a stable `block_uid`. This makes saves simple and preserves timestamps:
- unchanged blocks keep their last-changed time
- changed blocks get a new version entry

---

## 4) Image storage strategy (private per user)
Store images in **Supabase Storage** (private bucket), and render via **signed URLs**:
- Upload: client → your API route → Supabase Storage (private bucket)
- View: API returns signed URLs for the image paths (short expiry), client uses them as `<img src=...>`

### Cost-control defaults (to stay free-tier friendly)
- client-side resize/compress (e.g., max dimension 1600px)
- convert to WebP where possible
- upload size cap (e.g., 5–10MB)
- optional dedupe by `sha256`

---

# Implementation details

## A) Read notes (single endpoint)
`GET /api/tasks/:id/notes`
1. Load task (`tasks.id`)
2. If `tasks.notes_mode == 'legacy'`:
   - existing behavior: return joined text + per-line timestamps as you do now
3. Else (`'rich'`):
   - load `rich_notes` by `tasks.rich_note_id`
   - load blocks ordered by `sort_key`
   - resolve signed URLs for image attachments referenced by blocks
   - return:
     - blocks (type, content/data, block_uid, last_changed)
     - any signed URLs needed for images

## B) Save notes (rich mode)
`POST /api/tasks/:id/notes`
- If legacy: keep your current newline diff system.
- If rich:
  1. Client sends block list with stable `block_uid`, `sort_key`, `type`, and `data`
  2. Server loads current blocks by `rich_note_id`
  3. For each incoming block:
     - if block doesn’t exist: insert block + version, set active version
     - if exists and `data` unchanged: do nothing (preserve timestamps)
     - if changed: insert a new `rich_note_block_versions` row and update `active_version_id`
  4. Handle deletions: blocks not present in incoming list are removed (or soft-deleted)
  5. Update plaintext cache (optional)

> The “diff” is now by `block_uid`, not by newline. This is the key to stable row timestamps.

---

# Upgrade flow (button per task)

## Upgrade to Rich Notes
1. Read legacy note lines:
   - `note_rows` ordered by `ordinal` → join to plaintext
2. Convert plaintext to blocks:
   - lines starting with `- ` become `list_item` blocks
   - leading spaces can map to indent level
   - blank lines separate paragraphs
3. Insert `rich_notes`, blocks, initial versions
4. Update task:
   - set `tasks.notes_mode = 'rich'`
   - set `tasks.rich_note_id = new_rich_notes.id`
   - set `tasks.notes_upgraded_at = now()`
5. Optionally write `rich_notes_plaintext_cache`

### What happens to legacy after upgrade?
- Legacy rows remain unchanged.
- You can keep them as an archive or for rollback display.

---

# Rollback / downgrade stance
Avoid allowing users to *edit* legacy after upgrading, because images and structure won’t round-trip.

Recommended UX:
- **Primary:** rich editor (source of truth)
- **Secondary:** “View as plain text” (from plaintext cache)
- Optional: “View legacy snapshot” (read-only)
- If you must support downgrade:
  - switch `notes_mode` back to `'legacy'`
  - show cached plaintext (and render images as placeholders like `[Image]`)
  - clearly warn that rich-only features won’t be editable in legacy

---

# Why this preserves your hover timestamp feature
Your current system tracks “last changed per visible line.”  
In the rich subsystem, we track “last changed per visible **block**.”
- Each block has independent version history.
- Only changed blocks create new versions.
- Unchanged blocks remain untouched and keep their timestamps.
- Images are blocks, so they have their own hover timestamp too.

---

# Suggested next steps
1. Add `notes_mode`, `rich_note_id`, `notes_upgraded_at` to `tasks`.
2. Add the new `rich_*` tables + indexes.
3. Build rich read/write endpoints behind the `notes_mode` switch.
4. Implement editor:
   - block_uid support
   - list shortcuts + tab indent
   - image paste upload with placeholder row
5. Add upgrade button + conversion routine.
6. Add plaintext cache generation (optional but recommended).
