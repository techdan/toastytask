# Toasty Task

![Toasty Task logo](public/logo/toasty-task-logo-lightbg-gemini.png)

Toasty Task is a task manager that automatically surfaces the work that matters
most. It combines deadline-aware importance scoring with a heat model so tasks
rise and fall naturally as priorities change.

The application is inspired by Toodledo and is built as a responsive,
multi-tenant web app with Clerk authentication and PostgreSQL persistence.

## Hosted App

The hosted application is available at
[homeandmatter.com/tasks](https://www.homeandmatter.com/tasks). Sign-in is
required because task data is private to each account.

## Screenshot

![Toasty Task desktop task list with heat-based sorting](public/screenshots/toasty-task-desktop.png)

The screenshot uses synthetic sample data.

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
git clone https://github.com/techdan/toastytask.git
cd toastytask
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
- [Roadmap](docs/roadmap.md)
- [Database layer](lib/db/README.md)
- [Supabase setup](SUPABASE_SETUP.md)
- [Production deployment workflow](PRODUCTION_DEPLOYMENT_WORKFLOW.md)
- [Agent workflow and architecture notes](AGENTS.md)

## Project Status

Toasty Task is under active development. The web application is functional and
the repository includes ongoing work for responsive design, mobile clients,
performance improvements, and maintainability.

The hosted application is available for evaluation with a signed-in account.
Reference images from other task managers are intentionally excluded from this
repository.

## Issue Tracking

This repository uses [beads](https://github.com/steveyegge/beads) for local,
dependency-aware issue tracking. See [AGENTS.md](AGENTS.md) for the project
workflow.

Public bug reports and feature requests should use
[GitHub Issues](https://github.com/techdan/toastytask/issues).

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup,
testing, and pull request guidance. For security reports, follow
[SECURITY.md](SECURITY.md).

## License

Toasty Task is available under the [MIT License](LICENSE).
