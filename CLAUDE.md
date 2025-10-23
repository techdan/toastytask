# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Note**: This project uses [bd (beads)](https://github.com/steveyegge/beads) for issue tracking. Use `bd` commands instead of markdown TODOs. See [AGENTS.md](AGENTS.md) for workflow details.

## Project Overview

Toodle is a task management application inspired by Toodledo, featuring automatic importance scoring and a heat model for intelligent task prioritization. See [docs/requirements.md](docs/requirements.md) for detailed functional specifications.

For tech stack, architecture, and development commands, see [AGENTS.md](AGENTS.md).

### Key Paths

- Tech stack & architecture: [AGENTS.md](AGENTS.md)
- Requirements: [docs/requirements.md](docs/requirements.md)
- Database schema: [lib/db/schema.ts](lib/db/schema.ts)
- Scoring algorithms: [lib/scoring/](lib/scoring/)

### Development Commands

- `npm run dev` - Start development server (http://localhost:3000)
- `npm run build` - Production build
- `npm run lint` - Run linting
- `npm run db:push` - Push schema changes to database
- `npm run db:studio` - Open Drizzle Studio GUI

### Path Aliases

Use `@/*` imports mapped to the root directory:
```typescript
import { cn } from "@/lib/utils"
import Button from "@/components/ui/button"
```

## Adding shadcn/ui Components

When adding shadcn/ui components, they will be installed to `@/components/ui` with the New York style preset. Use the `cn()` utility from `@/lib/utils` for conditional class merging.
- always use descriptive variable names

