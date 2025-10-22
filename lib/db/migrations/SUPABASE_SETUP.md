# Supabase Setup Guide

This guide will help you set up Supabase as your production PostgreSQL database for Toodle.

## Prerequisites

- A Supabase account (free tier works fine)
- A Supabase project created

## Step 1: Get Your PostgreSQL Connection String

1. Go to your [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project
3. Click the **Settings** gear icon (⚙️) in the sidebar
4. Click **Database** in the left menu
5. Scroll down to the **Connection string** section
6. You'll see two connection string options:

### Choose "Transaction mode" (Recommended)

This uses port **6543** and provides better connection pooling for serverless environments like Next.js:

```
postgresql://USER:PASSWORD@aws-0-us-west-1.pooler.supabase.com:6543/postgres
```

**Note:** The region (`aws-0-us-west-1`) will match your project's region.

### Important: Get Your Password

- Click the "Copy" button next to the connection string - it will automatically include your password
- OR: Click "Reset Database Password" if you don't remember it
- **Save this connection string securely!**

## Step 2: Update Your Environment Variables

1. Open your `.env.local` file
2. Find the `POSTGRES_DATABASE_URL` line (around line 17)
3. Replace the placeholder with your actual Supabase connection string:

```env
# Before:
POSTGRES_DATABASE_URL=postgresql://USER:PASSWORD@aws-0-us-west-1.pooler.supabase.com:6543/postgres

# After (example):
POSTGRES_DATABASE_URL=postgresql://USER:PASSWORD@aws-0-us-west-1.pooler.supabase.com:6543/postgres
```

Make sure:
- ✓ You replaced `[YOUR-PROJECT-REF]` with your actual project reference
- ✓ You replaced `[YOUR-PASSWORD]` with your actual database password
- ✓ The port is `6543` (Transaction mode) or `5432` (Session mode)
- ✓ `DATABASE_TYPE=postgres` is set

## Step 3: Run the Setup Script

Now run the automated setup script:

```bash
npm run supabase:setup
```

This script will:
1. ✓ Test your connection to Supabase
2. ✓ Create all database tables (projects, tasks, settings, note_rows, note_row_versions)
3. ✓ Add performance indexes
4. ✓ Create default settings
5. ✓ Verify the setup

### Expected Output

```
Supabase PostgreSQL Setup
============================================================

Step 1: Testing connection to Supabase...
✓ Connected to Supabase PostgreSQL!
  Version: PostgreSQL 15.x

Step 2: Checking existing schema...
✓ No existing tables found. Will create schema.

Step 3: Creating database schema...
✓ Schema created successfully!

Step 4: Creating performance indexes...
✓ Indexes created successfully!

Step 5: Creating default settings...
✓ Default settings created!

Step 6: Verifying setup...
✓ Tables created: 5
    - note_row_versions
    - note_rows
    - projects
    - settings
    - tasks
✓ Task indexes: 6

============================================================
✅ Supabase setup completed successfully!
============================================================

Next steps:
  1. Your database schema is ready
  2. Start your app with: npm run dev
  3. Optionally import local data with: npm run pg:import

Your app is now using Supabase PostgreSQL! 🚀
```

## Step 4: (Optional) Import Existing Data

If you have existing data in SQLite that you want to migrate to Supabase:

```bash
npm run pg:import
```

This will copy all your:
- Projects
- Tasks
- Settings
- Notes

from your local SQLite database to Supabase.

## Step 5: Verify and Test

1. **Test the connection:**
   ```bash
   npm run pg:test
   ```

2. **Verify the schema:**
   ```bash
   npm run pg:verify
   ```

3. **Start your development server:**
   ```bash
   npm run dev
   ```

4. **Check the app at:** http://localhost:3000

## Troubleshooting

### Error: "password authentication failed"

**Problem:** Your password is incorrect in the connection string.

**Solution:**
1. Go to Supabase Dashboard > Settings > Database
2. Click "Reset Database Password"
3. Copy the new connection string
4. Update your `.env.local` file

### Error: "no pg_hba.conf entry for host"

**Problem:** Your IP address is not allowed to connect.

**Solution:**
Supabase allows all IPs by default, but if you see this:
1. Go to Supabase Dashboard > Settings > Database
2. Scroll to "Connection Pooling"
3. Make sure it's enabled

### Error: "ENOTFOUND" or "ETIMEDOUT"

**Problem:** Network connection issue or wrong host.

**Solution:**
1. Check your internet connection
2. Verify the connection string host matches your Supabase region
3. Check Supabase status: https://status.supabase.com

### Error: "relation 'tasks' already exists"

**Problem:** Schema was already created.

**Solution:**
This is fine! Your database is already set up. Just run your app with `npm run dev`.

## Database Configuration Options

### Transaction Mode (Port 6543) - Recommended for Next.js ✓

```
postgresql://USER:PASSWORD@[region].pooler.supabase.com:6543/postgres
```

**Pros:**
- ✓ Better for serverless functions
- ✓ Automatic connection pooling
- ✓ Handles high connection churn
- ✓ Perfect for Next.js API routes

**Use this for:** Production deployments, Vercel, serverless environments

### Session Mode (Port 5432) - Direct Connection

```
postgresql://USER:PASSWORD@[region].pooler.supabase.com:5432/postgres
```

**Pros:**
- ✓ Lower latency
- ✓ Direct connection

**Cons:**
- ✗ Can exhaust connection pool with many API requests

**Use this for:** Long-running processes, background jobs

## Viewing Your Data

### Supabase Table Editor

1. Go to Supabase Dashboard
2. Click **Table Editor** in the sidebar
3. You'll see all your tables: `projects`, `tasks`, `settings`, etc.

### Supabase SQL Editor

1. Go to Supabase Dashboard
2. Click **SQL Editor** in the sidebar
3. Run queries directly:

```sql
-- See all tasks
SELECT * FROM tasks;

-- Count tasks by priority
SELECT priority, COUNT(*) as count
FROM tasks
GROUP BY priority;

-- See all projects with task counts
SELECT p.name, COUNT(t.id) as task_count
FROM projects p
LEFT JOIN tasks t ON p.id = t.project_id
GROUP BY p.id, p.name;
```

## Security Best Practices

1. **Never commit `.env.local`** - It's already in `.gitignore`
2. **Use different credentials for production** - Don't use the same password for dev/prod
3. **Enable Row Level Security (RLS)** when adding auth:
   - Go to Supabase Dashboard > Authentication > Policies
   - Set up policies to restrict access

## Next Steps

- ✓ Your app is now connected to Supabase PostgreSQL
- ✓ All data is stored in the cloud
- ✓ Ready for production deployment
- ✓ Automatic backups via Supabase (on paid plans)

For production deployment on Vercel:
1. Add `POSTGRES_DATABASE_URL` to your Vercel environment variables
2. Set `DATABASE_TYPE=postgres`
3. Deploy!

## Support

- Supabase Documentation: https://supabase.com/docs
- Supabase Discord: https://discord.supabase.com
- Toodle Issues: Use `bd` command to track issues

---

🚀 **Enjoy your cloud-powered Toodle app!**
