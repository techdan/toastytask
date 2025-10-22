# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Note**: This project uses [bd (beads)](https://github.com/steveyegge/beads) for issue tracking. Use `bd` commands instead of markdown TODOs. See [AGENTS.md](AGENTS.md) for workflow details.

## Project Overview

Toodle is a Next.js 15 application built with React 19, TypeScript, and Tailwind CSS v4. It uses the Next.js App Router architecture and is configured with shadcn/ui component library (New York style).

## General Rules

- Be verbose as you carry out tasks. Provide output describing your understanding of the current task and how you are approaching it.
- **CRITICAL**: Always use `bd` (beads) commands for task tracking and progress management. NEVER use TodoWrite or other task tracking tools. Use `bd create`, `bd update`, `bd close` etc. See [AGENTS.md](AGENTS.md) for full workflow.

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