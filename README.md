# Toasty Task

Toasty Task is a task manager that automatically surfaces the work that matters
most. It combines deadline-aware importance scoring with a heat model so tasks
rise and fall naturally as priorities change.

The application is inspired by Toodledo and is built as a responsive,
multi-tenant web app with Clerk authentication and PostgreSQL persistence.

## Features

- Automatic importance scoring based on priority, due date, and star level
- Heat and cool controls for adjusting task order without rewriting due dates
- Projects, search, recurring tasks, completion history, and versioned notes
- Responsive desktop and mobile task views
- Per-user task data and settings through Clerk authentication
- PostgreSQL storage with Drizzle ORM migrations and Supabase deployment support
- Light, dark, and custom theme support

## Tech Stack

- [Next.js](https://nextjs.org/) App Router with React and TypeScript
- [Tailwind CSS](https://tailwindcss.com/) and [shadcn/ui](https://ui.shadcn.com/)
- [TanStack Query](https://tanstack.com/query) for client-side server state
- [Drizzle ORM](https://orm.drizzle.team/) with PostgreSQL
- [Clerk](https://clerk.com/) for authentication
- [Supabase](https://supabase.com/) PostgreSQL for production hosting

## Getting Started

### Prerequisites

- Node.js 20 or newer
- npm
- A PostgreSQL database
- A Clerk application

### Install

```bash
git clone https://github.com/techdan/toodle.git
cd toodle
npm install
```

Create `.env.local` from the example configuration and provide your local
values:

```bash
cp .env.example .env.local
```

At minimum, configure:

```env
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/toodle
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
CLERK_SECRET_KEY=your_clerk_secret_key
```

Initialize the local PostgreSQL database:

```bash
npm run pg:create
npm run pg:migrate
npm run pg:verify
```

Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Common Commands

```bash
npm run dev          # Start the development server with Turbopack
npm run build        # Create a production build
npm run lint         # Run ESLint
npm run db:generate  # Generate Drizzle migrations
npm run db:migrate   # Apply Drizzle migrations
npm run db:studio    # Open Drizzle Studio
npm run pg:test      # Test the PostgreSQL connection
```

## Documentation

- [Heat algorithm](docs/current-heat-algorithm.md)
- [Importance algorithm](docs/current-importance-algorithm.md)
- [Database layer](lib/db/README.md)
- [Supabase setup](SUPABASE_SETUP.md)
- [Production deployment workflow](PRODUCTION_DEPLOYMENT_WORKFLOW.md)
- [Agent workflow and architecture notes](AGENTS.md)

## Issue Tracking

This repository uses [beads](https://github.com/steveyegge/beads) for local,
dependency-aware issue tracking. See [AGENTS.md](AGENTS.md) for the project
workflow.
