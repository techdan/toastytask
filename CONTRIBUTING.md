# Contributing to Toasty Task

Thanks for contributing to Toasty Task. This project welcomes focused bug
fixes, documentation improvements, tests, and feature proposals.

## Getting Started

1. Install Node.js 20 or newer, npm, PostgreSQL, and create a Clerk application.
2. Clone the repository and install dependencies:

   ```bash
   git clone https://github.com/techdan/toastytask.git
   cd toastytask
   npm install
   ```

3. Copy `.env.example` to `.env.local` and provide local credentials.
4. Initialize the local database:

   ```bash
   npm run pg:create
   npm run pg:migrate
   npm run pg:verify
   ```

5. Start the development server:

   ```bash
   npm run dev
   ```

## Before Opening a Pull Request

Run the relevant checks:

```bash
npm run lint
npm run build
```

Keep pull requests focused. Explain the user-visible behavior, testing
performed, and any database migration impact.

## Issues

Use GitHub Issues for public bug reports and feature requests. Do not include
credentials, private task data, database dumps, or screenshots containing
personal information.

For vulnerabilities or sensitive reports, follow [SECURITY.md](SECURITY.md).
