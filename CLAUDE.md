# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Task Tracking with Beads

**IMPORTANT: This project uses Beads for task tracking instead of markdown TODOs.**

- **Beads (bd) is installed in WSL Ubuntu** at `/home/danman/go/bin/bd`
- **Always run bd commands through WSL**: `wsl bash -c "cd /mnt/c/src/ClaudeCode/toodle && /home/danman/go/bin/bd <command>"`
- Beads does not work natively on Windows (Unix-specific dependencies)
- The project database is at `.beads/toodle.db` (accessed from WSL)
- Commands are auto-approved in `.claude/settings.json` - no permission prompts needed

### Common Beads Commands (via WSL)

```bash
# Find ready work
wsl bash -c "cd /mnt/c/src/ClaudeCode/toodle && /home/danman/go/bin/bd ready --json"

# Create new issue
wsl bash -c "cd /mnt/c/src/ClaudeCode/toodle && /home/danman/go/bin/bd create 'Task title' -t task -p 1 --json"

# Update issue status
wsl bash -c "cd /mnt/c/src/ClaudeCode/toodle && /home/danman/go/bin/bd update <id> --status in_progress --json"

# Complete work
wsl bash -c "cd /mnt/c/src/ClaudeCode/toodle && /home/danman/go/bin/bd close <id> --reason 'Done' --json"

# Show issue details
wsl bash -c "cd /mnt/c/src/ClaudeCode/toodle && /home/danman/go/bin/bd show <id> --json"
```

See the [Beads documentation](https://github.com/steveyegge/beads) for full command reference.

## Planning & Documentation Workflow

**IMPORTANT: All planning and feature tracking must be documented in structured formats.**

### Where to Document
1. **requirements.md** (`docs/requirements.md`)
   - Product requirements and specifications
   - Architecture decisions and patterns
   - Acceptance criteria and test plans
   - Update whenever features/architecture changes

2. **Beads Issue Tracker**
   - All tasks, bugs, and epics tracked in `.beads/toodle.db`
   - Use `bd create` for new work items
   - Use `bd update` to track progress
   - Never use markdown TODO comments in code

3. **Code Comments**
   - Implementation details and "why" explanations only
   - No TODO or FIXME comments (use Beads instead)

### Workflow
1. User request → Research & clarify requirements
2. Update `docs/requirements.md` with new/changed specs
3. Create Beads epic/tasks to track implementation
4. Implement with references to Beads issue IDs in commits
5. Update requirements.md when complete

**CRITICAL RULES:**
- **DO NOT use markdown TODO lists** for planning or tracking
- **DO NOT use TodoWrite tool** for implementation tasks (only for tracking current Beads task during work session)
- **ALL implementation work** must have a corresponding Beads task created BEFORE starting
- **If planning reveals multiple tasks**, create them ALL in Beads first, then implement one at a time
- **Fresh sessions must pick up from Beads**, not from ephemeral session state

## Project Overview

Toodle is a Next.js 15 application built with React 19, TypeScript, and Tailwind CSS v4. It uses the Next.js App Router architecture and is configured with shadcn/ui component library (New York style).

## Development Commands

- **Development server**: `npm run dev` (uses Turbopack)
- **Production build**: `npm run build` (uses Turbopack)
- **Start production server**: `npm start`
- **Linting**: `npm run lint` (ESLint with Next.js config)

The dev server runs on http://localhost:3000 with hot module replacement.

## Architecture

### Directory Structure

- `app/` - Next.js App Router pages and layouts
  - `layout.tsx` - Root layout with Geist fonts (sans and mono)
  - `page.tsx` - Home page
  - `globals.css` - Global styles with Tailwind v4 and custom theme
- `lib/` - Utility functions
  - `utils.ts` - Contains `cn()` helper for merging Tailwind classes
- `components/` - React components (will contain shadcn/ui components)
- `public/` - Static assets

### Path Aliases

Use `@/*` imports mapped to the root directory:
```typescript
import { cn } from "@/lib/utils"
import Button from "@/components/ui/button"
```

### Styling

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

### TypeScript Configuration

- Strict mode enabled
- Module resolution: bundler
- Path aliases configured via `@/*`
- Target: ES2017

## Adding shadcn/ui Components

When adding shadcn/ui components, they will be installed to `@/components/ui` with the New York style preset. Use the `cn()` utility from `@/lib/utils` for conditional class merging.
- always use descriptive variable names