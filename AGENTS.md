# AGENTS.md

This file provides guidance to AI agents working with this codebase.

## General Rules

- Do not add to git without my permission
- Clean up temporary or backup files after they are no longer necessary. Double check for cleanup after finishing any task
- Be verbose as you carry out tasks. Provide output describing your understanding of the current task and how you are approaching it.
- **CRITICAL**: Always use `bd` (beads) commands for task tracking and progress management. NEVER use TodoWrite or other task tracking tools. Use `bd create`, `bd update`, `bd close` etc. See [AGENTS.md](AGENTS.md) for full workflow.


## Tech Stack

### Core Technologies

- **Framework**: Next.js 15 (App Router)
- **React**: Version 19
- **TypeScript**: Strict mode enabled
- **Database**: PostgreSQL (Supabase hosted for production, local for dev)
- **ORM**: Drizzle ORM with migrations
- **Styling**: Tailwind CSS v4
- **UI Components**: shadcn/ui (New York style)
- **State Management**: TanStack Query (React Query v5)
- **Authentication**: Clerk

### Directory Structure

- `app/` - Next.js App Router pages and layouts
  - `layout.tsx` - Root layout with Geist fonts (sans and mono)
  - `page.tsx` - Home page
  - `globals.css` - Global styles with Tailwind v4 and custom theme
- `lib/` - Utility functions and business logic
  - `utils.ts` - Contains `cn()` helper for merging Tailwind classes
  - `db/` - Database schema, connection, repositories
  - `queries/` - TanStack Query hooks
  - `scoring/` - Importance and heat calculation engines
- `components/` - React components
  - `ui/` - shadcn/ui components
  - Other feature-specific components
- `public/` - Static assets

### Path Aliases

Use `@/*` imports mapped to the root directory:
```typescript
import { cn } from "@/lib/utils"
import Button from "@/components/ui/button"
```

### Styling System

- **Tailwind CSS v4** with PostCSS integration
- **shadcn/ui** configured with:
  - Style: "new-york"
  - Base color: neutral
  - CSS variables enabled
  - Icon library: lucide-react
  - Component aliases: `@/components`, `@/components/ui`
- **Custom theme** using CSS custom properties (OKLCH color space)
- **Dark mode** via `.dark` class with custom variant
- **Animations** via `tw-animate-css` package

The design system uses CSS variables for theming. Light and dark color schemes are defined in [app/globals.css](app/globals.css).

### Authentication (Clerk)

- **Provider**: Clerk (clerk.com)
- **Environment Variables**:
  - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` - Public key for client-side
  - `CLERK_SECRET_KEY` - Secret key for server-side
- **Setup**:
  - ClerkProvider wraps the app in root layout
  - Middleware protects routes requiring authentication
  - User context available via `useUser()` hook
  - Sign-in/sign-up pages at `/sign-in` and `/sign-up`
- **User Association**:
  - Database tables include `userId` (from Clerk) for multi-tenancy
  - Row-level filtering ensures users only see their own data

### Database Configuration

- **Type**: PostgreSQL (configurable via `DATABASE_TYPE` env var)
- **Development**: Local PostgreSQL at `DATABASE_URL`
- **Production**: Supabase PostgreSQL at `PROD_DATABASE_URL`
- **ORM**: Drizzle with type-safe schema and migrations
- **Connection**: Pooled connections for production

### Development Commands

- **Development server**: `npm run dev` (uses Turbopack)
- **Production build**: `npm run build` (uses Turbopack)
- **Start production server**: `npm start`
- **Linting**: `npm run lint` (ESLint with Next.js config)
- **Database**:
  - `npm run db:generate` - Generate migrations
  - `npm run db:push` - Push schema to database
  - `npm run db:studio` - Open Drizzle Studio GUI

The dev server runs on http://localhost:3000 with hot module replacement.

## Issue Tracking with bd (beads)

**IMPORTANT**: This project uses **bd (beads)** for ALL issue tracking. Do NOT use markdown TODOs, task lists, or other tracking methods.

### Why bd?

- Dependency-aware: Track blockers and relationships between issues
- Git-friendly: Auto-syncs to JSONL for version control
- Agent-optimized: JSON output, ready work detection, discovered-from links
- Prevents duplicate tracking systems and confusion

### Quick Start

**Check for ready work:**
```bash
bd ready --json
```

**Create new issues:**
```bash
bd create "Issue title" -t bug|feature|task -p 0-4 --json
bd create "Issue title" -p 1 --deps discovered-from:bd-123 --json
```

**Claim and update:**
```bash
bd update bd-42 --status in_progress --json
bd update bd-42 --priority 1 --json
```

**Complete work:**
```bash
bd close bd-42 --reason "Completed" --json
```

### Issue Types

- `bug` - Something broken
- `feature` - New functionality
- `task` - Work item (tests, docs, refactoring)
- `epic` - Large feature with subtasks
- `chore` - Maintenance (dependencies, tooling)

### Priorities

- `0` - Critical (security, data loss, broken builds)
- `1` - High (major features, important bugs)
- `2` - Medium (default, nice-to-have)
- `3` - Low (polish, optimization)
- `4` - Backlog (future ideas)

### Workflow for AI Agents

1. **Check ready work**: `bd ready` shows unblocked issues
2. **Claim your task**: `bd update <id> --status in_progress`
3. **Work on it**: Implement, test, document
4. **Discover new work?** Create linked issue:
   - `bd create "Found bug" -p 1 --deps discovered-from:<parent-id>`
5. **Complete**: `bd close <id> --reason "Done"`

### Bug Fix Tracking

**IMPORTANT**: All bug fixes should be tracked under the Bug Fix Tracker epic (toodle-136).

When the user asks you to:
- "Add a task" for a bug fix
- "Log a task" for a bug fix
- Report any bug or issue

Always:
1. Create the bug with priority 1 and type `bug`
2. Link it to the Bug Fix Tracker epic using `--deps blocks:toodle-136`
3. Use `--json` flag for programmatic output

**Example:**
```bash
bd create "Fix null pointer in task list" -t bug -p 1 --deps blocks:toodle-136 --json
```

This ensures all bugs are:
- Priority 1 (high visibility)
- Tracked under one epic for monitoring
- Easy to find and triage

### Auto-Sync

bd automatically syncs with git:
- Exports to `.beads/issues.jsonl` after changes (5s debounce)
- Imports from JSONL when newer (e.g., after `git pull`)
- No manual export/import needed!

### MCP Server (Recommended)

If using Claude or MCP-compatible clients, install the beads MCP server:

```bash
pip install beads-mcp
```

Add to MCP config (e.g., `~/.config/claude/config.json`):
```json
{
  "beads": {
    "command": "beads-mcp",
    "args": []
  }
}
```

Then use `mcp__beads__*` functions instead of CLI commands.

### Important Rules

- ✅ Use bd for ALL task tracking
- ✅ Always use `--json` flag for programmatic use
- ✅ Link discovered work with `discovered-from` dependencies
- ✅ Check `bd ready` before asking "what should I work on?"
- ❌ Do NOT create markdown TODO lists
- ❌ Do NOT use external issue trackers
- ❌ Do NOT duplicate tracking systems

For more details, see README.md and QUICKSTART.md.

## Git Rules (from gist.github.com/steipete/d3b9db3fa8eb1d1a692b7656217d8655)

- Delete unused or obsolete files when your changes make them irrelevant (refactors, feature removals, etc.), and revert files only when the change is yours or explicitly requested. If a git operation leaves you unsure about other agents' in-flight work, stop and coordinate instead of deleting.
- **Before attempting to delete a file to resolve a local type/lint failure, stop and ask the user.** Other agents are often editing adjacent files; deleting their work to silence an error is never acceptable without explicit approval.
- NEVER edit `.env` or any environment variable files—only the user may change them.
- Coordinate with other agents before removing their in-progress edits—don't revert or delete work you didn't author unless everyone agrees.
- Moving/renaming and restoring files is allowed.
- ABSOLUTELY NEVER run destructive git operations (e.g., `git reset --hard`, `rm`, `git checkout`/`git restore` to an older commit) unless the user gives an explicit, written instruction in this conversation. Treat these commands as catastrophic; if you are even slightly unsure, stop and ask before touching them. *(When working within Cursor or Codex Web, these git limitations do not apply; use the tooling's capabilities as needed.)*
- Never use `git restore` (or similar commands) to revert files you didn't author—coordinate with other agents instead so their in-progress work stays intact.
- Always double-check git status before any commit
- Keep commits atomic: commit only the files you touched and list each path explicitly. For tracked files run `git commit -m "<scoped message>" -- path/to/file1 path/to/file2`. For brand-new files, use the one-liner `git restore --staged :/ && git add "path/to/file1" "path/to/file2" && git commit -m "<scoped message>" -- path/to/file1 path/to/file2`.
- Quote any git paths containing brackets or parentheses (e.g., `src/app/[candidate]/**`) when staging or committing so the shell does not treat them as globs or subshells.
- When running `git rebase`, avoid opening editors—export `GIT_EDITOR=:` and `GIT_SEQUENCE_EDITOR=:` (or pass `--no-edit`) so the default messages are used automatically.
- Never amend commits unless you have explicit written approval in the task thread.
