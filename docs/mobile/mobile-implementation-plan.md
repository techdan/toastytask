# Toasty Task Mobile Implementation Plan

This document provides a detailed, phased implementation plan for building the Toasty Task mobile app using Expo (React Native) with offline sync capabilities, based on the specification in [monorepo-expo-mobile-spec.md](monorepo-expo-mobile-spec.md).

---

## Overview

**Goal**: Build a native Android app (iOS later) with offline support that shares business logic with the web app through a monorepo structure.

**Key Decisions**:
- Keep Next.js app at repository root (don't move to `apps/web/` yet)
- Add `apps/mobile/` for Expo app and `packages/*` for shared code
- Use npm workspaces for dependency management
- Expo SDK 52, React Native 0.76+, @clerk/clerk-expo v2.x
- SQLite for offline storage with outbox pattern for writes

---

## Phase 0: Foundation (Monorepo + Shared Packages)

### 0.1 Configure npm Workspaces

**Files to modify**:
- `package.json` (root)

**Changes**:
```json
{
  "name": "toasty-task",
  "private": true,
  "workspaces": [
    "apps/*",
    "packages/*"
  ],
  // ... existing scripts and dependencies
}
```

**Acceptance criteria**:
- [ ] `npm install` at root installs dependencies for all workspaces
- [ ] Packages can import from each other using `@toasty/*` scope

---

### 0.2 Create `packages/contracts` (DTOs + Validation)

**Purpose**: Mobile-safe type definitions and runtime validation schemas that serve as the API boundary between server and clients.

**Directory structure**:
```
packages/contracts/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts           # Re-exports all DTOs and schemas
│   ├── task.ts            # TaskDTO, CreateTaskDTO, UpdateTaskDTO
│   ├── project.ts         # ProjectDTO, CreateProjectDTO, UpdateProjectDTO
│   ├── note.ts            # NoteDTO
│   ├── settings.ts        # SettingsDTO, UpdateSettingsDTO
│   ├── sync.ts            # SyncPullResponse, SyncPushRequest, SyncPushResponse
│   ├── enums.ts           # Priority, Bucket, RepeatType, StarLevel
│   └── errors.ts          # SyncErrorCode, SyncError
```

**Dependencies**:
```json
{
  "name": "@toasty/contracts",
  "version": "0.0.1",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "dependencies": {
    "zod": "^3.23.0"
  }
}
```

**Key types to define** (derived from [lib/db/schema.ts](../../lib/db/schema.ts) and [types/index.ts](../../types/index.ts)):

```typescript
// enums.ts
export const Priority = z.enum(["low", "medium", "high", "top"]);
export const Bucket = z.enum(["todo", "watch", "later"]);
export const RepeatType = z.enum(["none", "daily", "weekly", "biweekly", "monthly", "semiannual", "annual", "custom"]);
export const StarLevel = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);

// task.ts
export const TaskDTOSchema = z.object({
  id: z.number(),
  title: z.string(),
  projectId: z.number().nullable(),
  userId: z.string(),
  priority: Priority,
  bucket: Bucket,
  starLevel: StarLevel,
  dueAt: z.string().nullable(),  // ISO 8601
  repeatType: RepeatType,
  heat: z.number(),
  heatCalculatedAt: z.string().nullable(),
  heatAdjustment: z.number(),
  lastHeatTouchedAt: z.string().nullable(),
  lastTouchedAt: z.string().nullable(),
  importanceV1: z.number(),
  completedAt: z.string().nullable(),
  archivedAt: z.string().nullable(),
  deletedAt: z.string().nullable(),
  isFocused: z.boolean(),
  focusSnoozeUntil: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  // Derived fields added by API
  notes: z.array(NoteRowDTOSchema).optional(),
  notesCount: z.number().optional(),
  notesLastModified: z.string().nullable().optional(),
});

// sync.ts
export const SyncPullResponseSchema = z.object({
  entities: z.object({
    tasks: z.array(TaskDTOSchema),
    projects: z.array(ProjectDTOSchema),
    notes: z.array(NoteRowDTOSchema),
    settings: SettingsDTOSchema.optional(),
  }),
  cursor: z.string(),
  hasMore: z.boolean(),
});

export const SyncOperationSchema = z.object({
  idempotencyKey: z.string().uuid(),
  method: z.enum(["POST", "PATCH", "DELETE"]),
  path: z.string(),
  body: z.record(z.unknown()).optional(),
});

export const SyncPushRequestSchema = z.object({
  operations: z.array(SyncOperationSchema).max(100),
});

// errors.ts
export const SyncErrorCode = z.enum([
  "VALIDATION_ERROR",
  "NOT_FOUND",
  "FORBIDDEN",
  "CONFLICT",
  "UNAUTHORIZED",
  "RATE_LIMITED",
  "SERVER_ERROR",
  "NETWORK_ERROR",
  "TIMEOUT",
]);
```

**Acceptance criteria**:
- [ ] All DTOs have corresponding Zod schemas for runtime validation
- [ ] Enums match `types/index.ts` exactly
- [ ] No imports from `lib/db/*` or server-only code
- [ ] Package exports both types and schemas

---

### 0.3 Create `packages/api-client` (Typed HTTP Client)

**Purpose**: Shared HTTP client with auth header injection and typed request/response handling.

**Directory structure**:
```
packages/api-client/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts           # Re-exports all clients
│   ├── client.ts          # Base fetch wrapper with auth
│   ├── tasks.ts           # Task API methods
│   ├── projects.ts        # Project API methods
│   ├── settings.ts        # Settings API methods
│   ├── notes.ts           # Notes API methods
│   └── sync.ts            # Sync API methods (pull/push)
```

**Dependencies**:
```json
{
  "name": "@toasty/api-client",
  "version": "0.0.1",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "dependencies": {
    "@toasty/contracts": "*"
  }
}
```

**Key implementation** (per [mobile-api-reference.md](mobile-api-reference.md)):

```typescript
// client.ts
export interface ApiClientConfig {
  baseUrl: string;
  getAuthToken: () => Promise<string | null>;
}

export class ApiClient {
  constructor(private config: ApiClientConfig) {}

  async fetch<T>(path: string, options: RequestInit = {}): Promise<T> {
    const token = await this.config.getAuthToken();

    const response = await fetch(`${this.config.baseUrl}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new AuthError("Unauthorized");
      }
      const error = await response.json().catch(() => ({ error: "Unknown error" }));
      throw new ApiError(response.status, error.error);
    }

    return response.json();
  }
}

// tasks.ts
export class TasksApi {
  constructor(private client: ApiClient) {}

  async list(options?: { projectId?: number | null; includeCompleted?: boolean }): Promise<{ tasks: TaskDTO[] }> {
    const params = new URLSearchParams();
    if (options?.projectId !== undefined) {
      params.set("projectId", options.projectId === null ? "null" : String(options.projectId));
    }
    if (options?.includeCompleted) {
      params.set("includeCompleted", "true");
    }
    return this.client.fetch(`/api/tasks?${params}`);
  }

  async create(data: CreateTaskDTO): Promise<{ task: TaskDTO }> {
    return this.client.fetch("/api/tasks", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async update(id: number, data: UpdateTaskDTO): Promise<{ task: TaskDTO }> {
    return this.client.fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async complete(id: number): Promise<{ task: TaskDTO }> {
    return this.client.fetch(`/api/tasks/${id}/complete`, { method: "POST" });
  }

  async uncomplete(id: number): Promise<{ task: TaskDTO }> {
    return this.client.fetch(`/api/tasks/${id}/complete`, { method: "DELETE" });
  }

  async heat(id: number, options?: { increment?: number; visibleTasks?: { id: number; heat: number }[] }) {
    return this.client.fetch(`/api/tasks/${id}/heat`, {
      method: "POST",
      body: JSON.stringify(options ?? {}),
    });
  }

  async cool(id: number, options?: { decrement?: number; visibleTasks?: { id: number; heat: number }[] }) {
    return this.client.fetch(`/api/tasks/${id}/cool`, {
      method: "POST",
      body: JSON.stringify(options ?? {}),
    });
  }

  async cycleStar(id: number) {
    return this.client.fetch(`/api/tasks/${id}/star`, { method: "POST" });
  }
}

// sync.ts
export class SyncApi {
  constructor(private client: ApiClient) {}

  async pull(since: string, limit = 500): Promise<SyncPullResponse> {
    return this.client.fetch(`/api/sync/pull?since=${encodeURIComponent(since)}&limit=${limit}`);
  }

  async push(operations: SyncOperation[]): Promise<SyncPushResponse> {
    return this.client.fetch("/api/sync/push", {
      method: "POST",
      body: JSON.stringify({ operations }),
    });
  }
}
```

**Acceptance criteria**:
- [ ] All existing API endpoints have typed methods (see [mobile-api-reference.md](mobile-api-reference.md) Section 4)
- [ ] Auth token injection works via callback
- [ ] Proper error typing (ApiError, AuthError)
- [ ] Request/response types match `@toasty/contracts`

---

### 0.4 Create `packages/domain` (Scoring Logic)

**Purpose**: Share scoring algorithms between web and mobile for client-side calculations.

**Directory structure**:
```
packages/domain/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts           # Re-exports all domain logic
│   ├── scoring/
│   │   ├── heat-config.ts      # Copy from lib/scoring/heat-config.ts
│   │   ├── heat-v3.ts          # Copy from lib/scoring/heat-v3.ts (simplified)
│   │   ├── importance-v1.ts    # Copy from lib/scoring/importance-v1.ts
│   │   └── importance-colors.ts # Copy from lib/scoring/importance-colors.ts
│   └── utils/
│       └── date.ts         # Date utilities (daysBetween, toDate, etc.)
```

**Migration from existing code**:

1. Copy these files from `lib/scoring/`:
   - `heat-config.ts` - No changes needed (pure constants)
   - `importance-v1.ts` - Replace `@/types` import with `@toasty/contracts`
   - `heat-v3.ts` - Replace `@/types` import, extract shared functions only
   - `importance-colors.ts` - No changes needed

2. Replace imports:
   ```typescript
   // Before (web)
   import type { Task } from "@/types";

   // After (domain package)
   import type { TaskDTO } from "@toasty/contracts";
   ```

**Dependencies**:
```json
{
  "name": "@toasty/domain",
  "version": "0.0.1",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "dependencies": {
    "@toasty/contracts": "*"
  }
}
```

**Acceptance criteria**:
- [ ] `calculateHeat()` and `calculateImportanceV1()` work identically to web
- [ ] No server-only imports (Node APIs, Drizzle, etc.)
- [ ] Web app updated to import from `@toasty/domain` instead of `lib/scoring/`
- [ ] Unit tests pass for scoring functions

---

## Phase 1: Scaffold Mobile App

### 1.1 Create Expo App

**Commands**:
```bash
cd apps
npx create-expo-app@latest mobile --template expo-template-blank-typescript
cd mobile
npx expo-doctor@latest  # Check New Architecture compatibility
```

**Directory structure** (after scaffolding):
```
apps/mobile/
├── app.config.js          # Expo configuration (not app.json)
├── package.json
├── tsconfig.json
├── babel.config.js
├── app/                   # Expo Router (file-based routing)
│   ├── _layout.tsx        # Root layout with providers
│   ├── (auth)/            # Auth screens (sign-in, sign-up)
│   │   ├── _layout.tsx
│   │   ├── sign-in.tsx
│   │   └── sign-up.tsx
│   ├── (tabs)/            # Main tab navigation
│   │   ├── _layout.tsx    # Tab navigator
│   │   ├── index.tsx      # Todo bucket (default)
│   │   ├── watch.tsx      # Watch bucket
│   │   ├── later.tsx      # Later bucket
│   │   └── settings.tsx   # Settings screen
│   └── task/
│       └── [id].tsx       # Task detail screen
├── components/
├── hooks/
├── lib/
│   ├── api.ts             # API client instance
│   ├── sync/              # Sync engine
│   └── storage/           # SQLite wrapper
└── assets/
    ├── icon.png           # App icon (1024x1024)
    ├── adaptive-icon.png  # Android adaptive icon
    └── splash.png         # Splash screen
```

**Dependencies to install**:
```bash
npx expo install expo-router expo-secure-store expo-constants expo-linking expo-status-bar expo-splash-screen @clerk/clerk-expo expo-sqlite react-native-reanimated react-native-gesture-handler
npm install @toasty/contracts @toasty/api-client @toasty/domain
npm install @tanstack/react-query zustand  # State management
```

**Acceptance criteria**:
- [ ] App builds and runs on Android emulator
- [ ] Expo Doctor shows no New Architecture issues
- [ ] Tab navigation works between Todo/Watch/Later/Settings

---

### 1.2 Configure Environment (app.config.js)

**File**: `apps/mobile/app.config.js`

```javascript
export default {
  expo: {
    name: "Toasty Task",
    slug: "toasty-task",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "automatic",
    splash: {
      image: "./assets/splash.png",
      resizeMode: "contain",
      backgroundColor: "#f24c05",  // Toast orange
    },
    assetBundlePatterns: ["**/*"],
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.toastytask.app",
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#f24c05",
      },
      package: "com.toastytask.app",
    },
    extra: {
      apiBaseUrl: process.env.API_BASE_URL || "http://localhost:3000",
      clerkPublishableKey: process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY,
      eas: {
        projectId: "your-eas-project-id",
      },
    },
    scheme: "toastytask",  // For deep linking (future)
    plugins: [
      "expo-router",
      "expo-secure-store",
    ],
  },
};
```

**Environment files**:
- `.env.development` - `API_BASE_URL=http://10.0.2.2:3000` (Android emulator localhost)
- `.env.production` - `API_BASE_URL=https://toastytask.com`

**Acceptance criteria**:
- [ ] `Constants.expoConfig?.extra?.apiBaseUrl` returns correct URL per environment
- [ ] Clerk publishable key is available in config

---

### 1.3 Clerk Authentication Setup

**Reference**: [Clerk Expo v2 Guide](https://clerk.com/docs/upgrade-guides/expo/v2)

**Key files**:

```typescript
// app/_layout.tsx
import { ClerkProvider, ClerkLoaded } from "@clerk/clerk-expo";
import { tokenCache } from "@/lib/auth/token-cache";
import Constants from "expo-constants";

export default function RootLayout() {
  const publishableKey = Constants.expoConfig?.extra?.clerkPublishableKey;

  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <ClerkLoaded>
        <Stack />
      </ClerkLoaded>
    </ClerkProvider>
  );
}

// lib/auth/token-cache.ts
import * as SecureStore from "expo-secure-store";

export const tokenCache = {
  async getToken(key: string) {
    return SecureStore.getItemAsync(key);
  },
  async saveToken(key: string, value: string) {
    return SecureStore.setItemAsync(key, value);
  },
};

// app/(auth)/sign-in.tsx
import { useSignIn } from "@clerk/clerk-expo";
import { useState } from "react";
import { View, TextInput, Button, Text } from "react-native";

export default function SignInScreen() {
  const { signIn, setActive, isLoaded } = useSignIn();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSignIn = async () => {
    if (!isLoaded) return;

    try {
      const result = await signIn.create({
        identifier: email,
        password,
      });

      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
      }
    } catch (err: any) {
      setError(err.errors?.[0]?.message || "Sign in failed");
    }
  };

  return (
    <View style={{ padding: 20 }}>
      <TextInput
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <TextInput
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />
      {error ? <Text style={{ color: "red" }}>{error}</Text> : null}
      <Button title="Sign In" onPress={handleSignIn} />
    </View>
  );
}
```

**Auth flow requirements** (Clerk Expo v2):
- No prebuilt UI components - must build custom sign-in/sign-up screens
- Use `expo-secure-store` for token persistence
- Email links not supported in native apps

**Acceptance criteria**:
- [ ] User can sign in with email/password
- [ ] User can sign up for new account
- [ ] Session persists across app restarts
- [ ] Auth state directs to correct screens (auth vs main)

---

### 1.4 Generate App Icon & Splash Screen

**Source assets** (from [public/logo/](../../public/logo/)):
- Primary: `toasty_task_filled_css-v4.svg`
- Favicon variants for reference: `toasty_task_filled_css-v4-favicon-*.svg`

**Required outputs**:
- `icon.png` - 1024x1024, app icon for stores
- `adaptive-icon.png` - 1024x1024, Android adaptive icon foreground
- `splash.png` - 1284x2778, splash screen (centered logo on orange background)

**Color values** (from [lib/logo-color-config.ts](../../lib/logo-color-config.ts)):
- Toast orange: `#f24c05` (splash background)
- Use dark mode favicon variant for icon

**Generation approach**:
1. Use Figma, Inkscape, or a conversion tool to export SVG to PNG at required sizes
2. Create splash with centered logo on solid `#f24c05` background
3. For adaptive icon, use logo as foreground with transparent background

**Acceptance criteria**:
- [ ] Icon displays correctly in app launcher
- [ ] Adaptive icon works on Android 8+ devices
- [ ] Splash screen shows during app load with smooth transition

---

### 1.5 Basic Tab Navigation

**File**: `app/(tabs)/_layout.tsx`

```typescript
import { Tabs } from "expo-router";
import { Flame, Eye, Clock, Settings } from "lucide-react-native";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: "#f24c05",  // Toast orange
        headerShown: true,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Todo",
          tabBarIcon: ({ color, size }) => <Flame color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="watch"
        options={{
          title: "Watch",
          tabBarIcon: ({ color, size }) => <Eye color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="later"
        options={{
          title: "Later",
          tabBarIcon: ({ color, size }) => <Clock color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color, size }) => <Settings color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
```

**Acceptance criteria**:
- [ ] Four tabs visible: Todo, Watch, Later, Settings
- [ ] Tab icons use lucide-react-native
- [ ] Active tab highlighted with toast orange
- [ ] Screens render placeholder content

---

## Phase 2: Sync Infrastructure (Mobile)

### 2.1 SQLite Schema with Migrations

**Dependencies**:
```bash
npx expo install expo-sqlite
```

**File**: `lib/storage/schema.ts`

```typescript
import * as SQLite from "expo-sqlite";

export interface Migration {
  version: number;
  up: (db: SQLite.SQLiteDatabase) => void;
}

export const migrations: Migration[] = [
  {
    version: 1,
    up: (db) => {
      db.execSync(`
        CREATE TABLE IF NOT EXISTS schema_version (
          version INTEGER PRIMARY KEY
        );

        CREATE TABLE IF NOT EXISTS tasks (
          id INTEGER PRIMARY KEY,
          title TEXT NOT NULL,
          project_id INTEGER,
          user_id TEXT,
          priority TEXT NOT NULL DEFAULT 'medium',
          bucket TEXT NOT NULL DEFAULT 'todo',
          star_level INTEGER NOT NULL DEFAULT 0,
          due_at TEXT,
          repeat_type TEXT NOT NULL DEFAULT 'none',
          heat REAL NOT NULL DEFAULT 0,
          heat_calculated_at TEXT,
          heat_adjustment REAL NOT NULL DEFAULT 0,
          last_heat_touched_at TEXT,
          last_touched_at TEXT,
          importance_v1 INTEGER NOT NULL DEFAULT 0,
          completed_at TEXT,
          archived_at TEXT,
          deleted_at TEXT,
          is_focused INTEGER NOT NULL DEFAULT 0,
          focus_snooze_until TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          -- Sync metadata
          sync_status TEXT NOT NULL DEFAULT 'synced',  -- synced, pending, conflict
          local_updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS projects (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          color_hex TEXT NOT NULL DEFAULT '#6b7280',
          sort_order INTEGER NOT NULL DEFAULT 0,
          archived INTEGER NOT NULL DEFAULT 0,
          user_id TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          sync_status TEXT NOT NULL DEFAULT 'synced',
          local_updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS notes (
          id INTEGER PRIMARY KEY,
          task_id INTEGER NOT NULL,
          ordinal INTEGER NOT NULL,
          current_text TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS settings (
          id INTEGER PRIMARY KEY DEFAULT 1,
          user_id TEXT,
          default_priority TEXT NOT NULL DEFAULT 'medium',
          default_bucket TEXT NOT NULL DEFAULT 'todo',
          default_due_date TEXT NOT NULL DEFAULT 'today',
          grouping_mode TEXT NOT NULL DEFAULT 'ungrouped',
          sort_mode TEXT NOT NULL DEFAULT 'heat',
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS outbox (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          idempotency_key TEXT NOT NULL UNIQUE,
          method TEXT NOT NULL,
          path TEXT NOT NULL,
          body TEXT,
          client_id TEXT,
          state TEXT NOT NULL DEFAULT 'pending',  -- pending, in_flight, applied, failed
          error_code TEXT,
          error_message TEXT,
          retry_count INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          last_attempt_at TEXT
        );

        CREATE TABLE IF NOT EXISTS sync_state (
          id INTEGER PRIMARY KEY DEFAULT 1,
          pull_cursor TEXT NOT NULL DEFAULT '',
          last_pull_at TEXT,
          last_push_at TEXT
        );

        -- Indexes
        CREATE INDEX IF NOT EXISTS tasks_bucket_heat ON tasks(bucket, heat);
        CREATE INDEX IF NOT EXISTS tasks_sync_status ON tasks(sync_status);
        CREATE INDEX IF NOT EXISTS outbox_state ON outbox(state);
      `);
    },
  },
  // Future migrations go here
  // {
  //   version: 2,
  //   up: (db) => {
  //     db.execSync(`ALTER TABLE tasks ADD COLUMN focus INTEGER DEFAULT 0`);
  //   },
  // },
];

export async function runMigrations(db: SQLite.SQLiteDatabase): Promise<void> {
  // Get current version
  const result = db.getFirstSync<{ version: number }>(
    "SELECT version FROM schema_version ORDER BY version DESC LIMIT 1"
  );
  const currentVersion = result?.version ?? 0;

  // Run pending migrations
  for (const migration of migrations) {
    if (migration.version > currentVersion) {
      migration.up(db);
      db.runSync("INSERT INTO schema_version (version) VALUES (?)", [migration.version]);
    }
  }
}
```

**Acceptance criteria**:
- [ ] Schema creates all tables on first run
- [ ] Schema version tracked in `schema_version` table
- [ ] Future migrations can be added without data loss
- [ ] Indexes created for common queries

---

### 2.2 Outbox Queue Management

**File**: `lib/sync/outbox.ts`

```typescript
import * as SQLite from "expo-sqlite";
import { v4 as uuid } from "uuid";

export interface OutboxEntry {
  id: number;
  idempotencyKey: string;
  method: "POST" | "PATCH" | "DELETE";
  path: string;
  body?: Record<string, unknown>;
  clientId?: string;
  state: "pending" | "in_flight" | "applied" | "failed";
  errorCode?: string;
  errorMessage?: string;
  retryCount: number;
  createdAt: string;
  lastAttemptAt?: string;
}

export class OutboxQueue {
  constructor(private db: SQLite.SQLiteDatabase) {}

  /**
   * Add an operation to the outbox
   * Returns the idempotency key for tracking
   */
  async enqueue(operation: {
    method: "POST" | "PATCH" | "DELETE";
    path: string;
    body?: Record<string, unknown>;
    clientId?: string;
  }): Promise<string> {
    const idempotencyKey = uuid();
    const now = new Date().toISOString();

    this.db.runSync(
      `INSERT INTO outbox (idempotency_key, method, path, body, client_id, state, created_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
      [
        idempotencyKey,
        operation.method,
        operation.path,
        operation.body ? JSON.stringify(operation.body) : null,
        operation.clientId ?? null,
        now,
      ]
    );

    return idempotencyKey;
  }

  /**
   * Get pending operations for push (up to limit)
   */
  getPending(limit = 100): OutboxEntry[] {
    const rows = this.db.getAllSync<any>(
      `SELECT * FROM outbox
       WHERE state IN ('pending', 'failed') AND retry_count < 5
       ORDER BY created_at ASC
       LIMIT ?`,
      [limit]
    );

    return rows.map(this.parseRow);
  }

  /**
   * Mark entries as in-flight before push
   */
  markInFlight(ids: number[]): void {
    if (ids.length === 0) return;

    const placeholders = ids.map(() => "?").join(",");
    this.db.runSync(
      `UPDATE outbox SET state = 'in_flight', last_attempt_at = ? WHERE id IN (${placeholders})`,
      [new Date().toISOString(), ...ids]
    );
  }

  /**
   * Mark entry as successfully applied
   */
  markApplied(idempotencyKey: string): void {
    this.db.runSync(
      "UPDATE outbox SET state = 'applied' WHERE idempotency_key = ?",
      [idempotencyKey]
    );
  }

  /**
   * Mark entry as failed with error details
   */
  markFailed(idempotencyKey: string, errorCode: string, errorMessage: string, retryable: boolean): void {
    if (retryable) {
      this.db.runSync(
        `UPDATE outbox
         SET state = 'failed', error_code = ?, error_message = ?, retry_count = retry_count + 1
         WHERE idempotency_key = ?`,
        [errorCode, errorMessage, idempotencyKey]
      );
    } else {
      // Permanent failure - don't retry
      this.db.runSync(
        `UPDATE outbox
         SET state = 'failed', error_code = ?, error_message = ?, retry_count = 999
         WHERE idempotency_key = ?`,
        [errorCode, errorMessage, idempotencyKey]
      );
    }
  }

  /**
   * Get failed operations for user review
   */
  getFailed(): OutboxEntry[] {
    const rows = this.db.getAllSync<any>(
      "SELECT * FROM outbox WHERE state = 'failed' AND retry_count >= 5 ORDER BY created_at ASC"
    );
    return rows.map(this.parseRow);
  }

  /**
   * Remove applied entries (cleanup)
   */
  cleanup(): void {
    this.db.runSync("DELETE FROM outbox WHERE state = 'applied'");
  }

  /**
   * Get pending count for UI indicator
   */
  getPendingCount(): number {
    const result = this.db.getFirstSync<{ count: number }>(
      "SELECT COUNT(*) as count FROM outbox WHERE state IN ('pending', 'in_flight', 'failed')"
    );
    return result?.count ?? 0;
  }

  private parseRow(row: any): OutboxEntry {
    return {
      ...row,
      body: row.body ? JSON.parse(row.body) : undefined,
    };
  }
}
```

**Acceptance criteria**:
- [ ] Operations can be enqueued with unique idempotency keys
- [ ] Pending operations retrieved in order
- [ ] State transitions work correctly (pending → in_flight → applied/failed)
- [ ] Failed operations with retryable errors can be retried (up to 5 times)
- [ ] Permanent failures tracked separately for user review

---

### 2.3 Sync Engine

**File**: `lib/sync/engine.ts`

```typescript
import { ApiClient, SyncApi } from "@toasty/api-client";
import type { SyncPullResponse, SyncPushResponse, SyncOperation } from "@toasty/contracts";
import { OutboxQueue } from "./outbox";
import { LocalDatabase } from "../storage/database";
import { EventEmitter } from "../utils/events";

export type SyncEvent =
  | { type: "sync:started" }
  | { type: "sync:completed"; cursor: string }
  | { type: "sync:offline" }
  | { type: "sync:error"; error: Error }
  | { type: "sync:auth-required" }
  | { type: "sync:pending-count"; count: number };

export interface SyncEngineConfig {
  apiClient: ApiClient;
  database: LocalDatabase;
  outbox: OutboxQueue;
  getNetworkState: () => boolean;
  refreshAuthToken: () => Promise<boolean>;
}

export class SyncEngine {
  private syncApi: SyncApi;
  private isSyncing = false;
  public events = new EventEmitter<SyncEvent>();

  constructor(private config: SyncEngineConfig) {
    this.syncApi = new SyncApi(config.apiClient);
  }

  /**
   * Perform full sync (push then pull)
   */
  async sync(): Promise<void> {
    if (this.isSyncing) return;
    if (!this.config.getNetworkState()) {
      this.events.emit({ type: "sync:offline" });
      return;
    }

    this.isSyncing = true;
    this.events.emit({ type: "sync:started" });

    try {
      // Validate auth token
      const authValid = await this.config.refreshAuthToken();
      if (!authValid) {
        this.events.emit({ type: "sync:auth-required" });
        return;
      }

      // Push local changes first
      await this.push();

      // Then pull remote changes
      await this.pull();

      const cursor = this.config.database.getSyncCursor();
      this.events.emit({ type: "sync:completed", cursor });
    } catch (error) {
      this.events.emit({ type: "sync:error", error: error as Error });
    } finally {
      this.isSyncing = false;
      this.emitPendingCount();
    }
  }

  /**
   * Push queued operations to server
   */
  private async push(): Promise<void> {
    const pending = this.config.outbox.getPending(100);
    if (pending.length === 0) return;

    // Mark as in-flight
    this.config.outbox.markInFlight(pending.map((p) => p.id));

    // Convert to sync operations
    const operations: SyncOperation[] = pending.map((entry) => ({
      idempotencyKey: entry.idempotencyKey,
      method: entry.method,
      path: entry.path,
      body: entry.body,
    }));

    try {
      const response = await this.syncApi.push(operations);

      // Process results
      for (const result of response.results) {
        if (result.status === "success") {
          this.config.outbox.markApplied(result.idempotencyKey);

          // Handle ID mapping for creates
          if (result.clientId && result.serverId) {
            this.config.database.mapClientToServerId(result.clientId, result.serverId);
          }

          // Update local entity with server response
          if (result.entity) {
            this.config.database.upsertFromServer(result.entity);
          }
        } else {
          const error = result as { idempotencyKey: string; status: "error"; code: string; message: string; retryable: boolean };
          this.config.outbox.markFailed(
            error.idempotencyKey,
            error.code,
            error.message,
            error.retryable
          );
        }
      }

      // Update sync cursor if provided
      if (response.cursor) {
        this.config.database.setSyncCursor(response.cursor);
      }
    } catch (error) {
      // Network error - reset to pending for retry
      for (const entry of pending) {
        this.config.outbox.markFailed(entry.idempotencyKey, "NETWORK_ERROR", "Network request failed", true);
      }
      throw error;
    }
  }

  /**
   * Pull changes from server
   */
  private async pull(): Promise<void> {
    let cursor = this.config.database.getSyncCursor();
    let hasMore = true;

    while (hasMore) {
      const response = await this.syncApi.pull(cursor, 500);

      // Apply entities to local database
      this.applyPullResponse(response);

      cursor = response.cursor;
      hasMore = response.hasMore;
    }

    // Store final cursor
    this.config.database.setSyncCursor(cursor);
    this.config.database.setLastPullTime(new Date().toISOString());
  }

  private applyPullResponse(response: SyncPullResponse): void {
    const db = this.config.database;

    // Tasks
    for (const task of response.entities.tasks) {
      if (task.deletedAt) {
        db.deleteTask(task.id);
      } else {
        db.upsertTask(task);
      }
    }

    // Projects
    for (const project of response.entities.projects) {
      if (project.deletedAt) {
        db.deleteProject(project.id);
      } else {
        db.upsertProject(project);
      }
    }

    // Notes
    for (const note of response.entities.notes) {
      db.upsertNote(note);
    }

    // Settings
    if (response.entities.settings) {
      db.upsertSettings(response.entities.settings);
    }
  }

  private emitPendingCount(): void {
    const count = this.config.outbox.getPendingCount();
    this.events.emit({ type: "sync:pending-count", count });
  }
}
```

**Acceptance criteria**:
- [ ] Sync engine pushes queued operations before pulling
- [ ] Pull loops until `hasMore: false`
- [ ] Client ID to server ID mapping works for creates
- [ ] Tombstones (deletedAt) trigger local deletes
- [ ] Events emitted for UI consumption
- [ ] Auth token refresh attempted before sync

---

### 2.4 Network State Detection

**File**: `lib/sync/network.ts`

```typescript
import NetInfo, { NetInfoState } from "@react-native-community/netinfo";
import { useEffect, useState } from "react";

export function useNetworkState(): boolean {
  const [isConnected, setIsConnected] = useState(true);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      setIsConnected(state.isConnected ?? false);
    });

    return () => unsubscribe();
  }, []);

  return isConnected;
}

export function getNetworkState(): Promise<boolean> {
  return NetInfo.fetch().then((state) => state.isConnected ?? false);
}
```

**Dependency**:
```bash
npx expo install @react-native-community/netinfo
```

**Acceptance criteria**:
- [ ] Hook returns current network state
- [ ] State updates when connectivity changes
- [ ] Sync engine uses network state to skip sync when offline

---

### 2.5 Auth Token Refresh Handling

**File**: `lib/sync/auth.ts`

```typescript
import { useAuth } from "@clerk/clerk-expo";

export function useAuthToken() {
  const { getToken, isSignedIn } = useAuth();

  const refreshToken = async (): Promise<boolean> => {
    if (!isSignedIn) return false;

    try {
      const token = await getToken();
      return token !== null;
    } catch {
      return false;
    }
  };

  return { getToken, refreshToken, isSignedIn };
}
```

**Acceptance criteria**:
- [ ] Token retrieval works via Clerk
- [ ] Failed token refresh returns false
- [ ] Sync engine triggers re-auth flow when refresh fails

---

## Phase 3: Server Sync Endpoints

### 3.1 Add Idempotency Keys Table

**File**: `lib/db/schema.ts` (add to existing)

```typescript
export const idempotencyKeys = pgTable("idempotency_keys", {
  id: serial("id").primaryKey(),
  key: text("key").notNull(),
  userId: text("user_id").notNull(),
  response: text("response").notNull(),  // JSON-serialized response
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
    .notNull()
    .default(sql`(NOW() AT TIME ZONE 'UTC')`),
}, (table) => ({
  keyUserIdx: index("idempotency_keys_key_user_idx").on(table.key, table.userId),
  createdAtIdx: index("idempotency_keys_created_at_idx").on(table.createdAt),
}));

export type IdempotencyKey = typeof idempotencyKeys.$inferSelect;
export type NewIdempotencyKey = typeof idempotencyKeys.$inferInsert;
```

**Migration script**: Create migration to add table and indexes.

**Cleanup job**: Add scheduled cleanup (via cron or Supabase function) to delete keys older than 48 hours.

**Acceptance criteria**:
- [ ] Table created with proper indexes
- [ ] Unique constraint on (key, user_id)
- [ ] Cleanup job defined (can be manual for v1)

---

### 3.2 Implement `/api/sync/pull`

**File**: `app/api/sync/pull/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { tasks, projects, noteRows, settings } from "@/lib/db/schema";
import { and, gt, eq, or, isNull, not, sql } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const since = searchParams.get("since") || "";
  const limit = Math.min(parseInt(searchParams.get("limit") || "500"), 1000);

  // Parse cursor (empty string = initial sync)
  const sinceDate = since ? new Date(since) : new Date(0);

  // Fetch entities updated since cursor
  // Include soft-deleted (tombstones) for sync purposes
  const [taskRows, projectRows, noteData, settingsRow] = await Promise.all([
    db.select()
      .from(tasks)
      .where(
        and(
          eq(tasks.userId, userId),
          gt(tasks.updatedAt, sinceDate)
        )
      )
      .orderBy(tasks.updatedAt)
      .limit(limit + 1),  // Fetch one extra to check hasMore

    db.select()
      .from(projects)
      .where(
        and(
          eq(projects.userId, userId),
          gt(projects.updatedAt, sinceDate)
        )
      )
      .orderBy(projects.updatedAt)
      .limit(limit + 1),

    db.select({
      id: noteRows.id,
      taskId: noteRows.taskId,
      ordinal: noteRows.ordinal,
      currentText: sql<string>`COALESCE(
        (SELECT text FROM note_row_versions WHERE id = ${noteRows.activeVersionId}),
        ''
      )`,
      createdAt: noteRows.createdAt,
      updatedAt: noteRows.updatedAt,
    })
      .from(noteRows)
      .innerJoin(tasks, eq(noteRows.taskId, tasks.id))
      .where(
        and(
          eq(tasks.userId, userId),
          gt(noteRows.updatedAt, sinceDate)
        )
      )
      .orderBy(noteRows.updatedAt)
      .limit(limit + 1),

    db.select()
      .from(settings)
      .where(eq(settings.userId, userId))
      .limit(1),
  ]);

  // Determine if there are more results
  const hasMoreTasks = taskRows.length > limit;
  const hasMoreProjects = projectRows.length > limit;
  const hasMoreNotes = noteData.length > limit;
  const hasMore = hasMoreTasks || hasMoreProjects || hasMoreNotes;

  // Trim to limit
  const finalTasks = taskRows.slice(0, limit);
  const finalProjects = projectRows.slice(0, limit);
  const finalNotes = noteData.slice(0, limit);

  // Calculate cursor (max updatedAt across all entities)
  const allDates = [
    ...finalTasks.map((t) => t.updatedAt),
    ...finalProjects.map((p) => p.updatedAt),
    ...finalNotes.map((n) => n.updatedAt),
  ].filter(Boolean);

  const maxDate = allDates.length > 0
    ? new Date(Math.max(...allDates.map((d) => d!.getTime())))
    : sinceDate;

  const cursor = maxDate.toISOString();

  return NextResponse.json({
    entities: {
      tasks: finalTasks.map(taskToDTO),
      projects: finalProjects.map(projectToDTO),
      notes: finalNotes.map(noteToDTO),
      settings: settingsRow[0] ? settingsToDTO(settingsRow[0]) : undefined,
    },
    cursor,
    hasMore,
  });
}

// DTO conversion functions
function taskToDTO(task: any) {
  return {
    ...task,
    dueAt: task.dueAt?.toISOString() ?? null,
    heatCalculatedAt: task.heatCalculatedAt?.toISOString() ?? null,
    lastHeatTouchedAt: task.lastHeatTouchedAt?.toISOString() ?? null,
    lastTouchedAt: task.lastTouchedAt?.toISOString() ?? null,
    completedAt: task.completedAt?.toISOString() ?? null,
    archivedAt: task.archivedAt?.toISOString() ?? null,
    deletedAt: task.deletedAt?.toISOString() ?? null,
    focusSnoozeUntil: task.focusSnoozeUntil?.toISOString() ?? null,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}

function projectToDTO(project: any) {
  return {
    ...project,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

function noteToDTO(note: any) {
  return {
    ...note,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
  };
}

function settingsToDTO(settings: any) {
  return {
    ...settings,
    updatedAt: settings.updatedAt.toISOString(),
  };
}
```

**Acceptance criteria**:
- [ ] Returns entities updated since cursor
- [ ] Includes tombstones (entities with deletedAt set)
- [ ] Pagination works with `hasMore` and cursor
- [ ] Results ordered by `updatedAt` ascending
- [ ] Returns settings if they exist

---

### 3.3 Implement `/api/sync/push`

**File**: `app/api/sync/push/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { idempotencyKeys } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { SyncPushRequestSchema } from "@toasty/contracts";

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = SyncPushRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { operations } = parsed.data;
  const results: any[] = [];

  for (const op of operations) {
    try {
      // Check idempotency key
      const existing = await db.select()
        .from(idempotencyKeys)
        .where(
          and(
            eq(idempotencyKeys.key, op.idempotencyKey),
            eq(idempotencyKeys.userId, userId)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        // Return cached response
        results.push(JSON.parse(existing[0].response));
        continue;
      }

      // Execute operation
      const result = await executeOperation(op, userId);

      // Store idempotency key with response
      await db.insert(idempotencyKeys).values({
        key: op.idempotencyKey,
        userId,
        response: JSON.stringify(result),
      });

      results.push(result);
    } catch (error: any) {
      const errorResult = {
        idempotencyKey: op.idempotencyKey,
        status: "error",
        code: error.code || "SERVER_ERROR",
        message: error.message || "Internal server error",
        retryable: error.retryable ?? true,
      };
      results.push(errorResult);
    }
  }

  // Get latest cursor
  const cursor = new Date().toISOString();

  return NextResponse.json({ results, cursor });
}

async function executeOperation(op: any, userId: string): Promise<any> {
  const { method, path, body } = op;

  // Route to appropriate handler based on path pattern
  // This is a simplified router - in production, use proper routing

  // POST /api/tasks
  if (method === "POST" && path === "/api/tasks") {
    const result = await createTask(body, userId);
    return {
      idempotencyKey: op.idempotencyKey,
      status: "success",
      clientId: body.clientId,
      serverId: result.task.id,
      entity: result.task,
    };
  }

  // PATCH /api/tasks/:id
  const patchTaskMatch = path.match(/^\/api\/tasks\/(\d+)$/);
  if (method === "PATCH" && patchTaskMatch) {
    const taskId = parseInt(patchTaskMatch[1]);
    const result = await updateTask(taskId, body, userId);
    return {
      idempotencyKey: op.idempotencyKey,
      status: "success",
      entity: result.task,
    };
  }

  // DELETE /api/tasks/:id
  const deleteTaskMatch = path.match(/^\/api\/tasks\/(\d+)$/);
  if (method === "DELETE" && deleteTaskMatch) {
    const taskId = parseInt(deleteTaskMatch[1]);
    await softDeleteTask(taskId, userId);
    return {
      idempotencyKey: op.idempotencyKey,
      status: "success",
    };
  }

  // POST /api/tasks/:id/complete
  const completeMatch = path.match(/^\/api\/tasks\/(\d+)\/complete$/);
  if (method === "POST" && completeMatch) {
    const taskId = parseInt(completeMatch[1]);
    const result = await completeTask(taskId, userId);
    return {
      idempotencyKey: op.idempotencyKey,
      status: "success",
      entity: result.task,
    };
  }

  // POST /api/tasks/:id/notes
  const notesMatch = path.match(/^\/api\/tasks\/(\d+)\/notes$/);
  if (method === "POST" && notesMatch) {
    const taskId = parseInt(notesMatch[1]);
    const result = await updateTaskNotes(taskId, body.text, userId);
    return {
      idempotencyKey: op.idempotencyKey,
      status: "success",
      entity: result,
    };
  }

  // Add more operation handlers as needed...

  throw { code: "NOT_FOUND", message: `Unknown operation: ${method} ${path}`, retryable: false };
}

// Import handlers from existing API routes or create shared functions
// These are stubs - implement using existing repository logic
async function createTask(body: any, userId: string) {
  // Use taskRepository.create()
  throw new Error("Not implemented");
}

async function updateTask(id: number, body: any, userId: string) {
  // Use taskRepository.update()
  throw new Error("Not implemented");
}

async function softDeleteTask(id: number, userId: string) {
  // Set deletedAt
  throw new Error("Not implemented");
}

async function completeTask(id: number, userId: string) {
  // Use existing complete logic
  throw new Error("Not implemented");
}

async function updateTaskNotes(taskId: number, text: string, userId: string) {
  // Use existing notes logic
  throw new Error("Not implemented");
}
```

**Refactoring needed**:
1. Extract shared logic from existing API routes into repository functions
2. Create `lib/db/repositories/sync-operations.ts` with reusable handlers

**Acceptance criteria**:
- [ ] Batch operations processed in order
- [ ] Idempotency keys prevent duplicate operations
- [ ] Failed operations return structured errors
- [ ] Client ID to server ID mapping returned for creates
- [ ] New cursor returned after processing

---

### 3.4 Add Tombstone Support

**Behavior changes**:
1. Change `DELETE /api/tasks/{id}` from hard delete to soft delete (set `deletedAt`)
2. Pull endpoint already returns entities with `deletedAt` set
3. Add cleanup job to hard-delete after 30 days

**File**: Update `app/api/tasks/[id]/route.ts`

```typescript
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const taskId = parseInt(id);

  // Soft delete instead of hard delete
  const result = await db
    .update(tasks)
    .set({
      deletedAt: new Date(),
      updatedAt: new Date(),  // Trigger sync
    })
    .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)))
    .returning();

  if (result.length === 0) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
```

**Cleanup job** (via Supabase scheduled function or external cron):
```sql
-- Run daily: delete tombstones older than 30 days
DELETE FROM tasks WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '30 days';
DELETE FROM projects WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '30 days';
```

**Acceptance criteria**:
- [ ] DELETE sets `deletedAt` instead of removing row
- [ ] `updatedAt` updated on soft delete for sync
- [ ] Pull endpoint includes soft-deleted entities
- [ ] Cleanup job deletes old tombstones

---

## Phase 4: Core UI Screens

### 4.1 Task List with Heat-Sorted FlatList

**Reference**: [mobile-styles-heat-importance-priority.md](mobile-styles-heat-importance-priority.md)

**File**: `app/(tabs)/index.tsx` (Todo bucket)

```typescript
import { FlatList, View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useTasks } from "@/hooks/useTasks";
import { TaskListItem } from "@/components/TaskListItem";
import { calculateHeat, calculateImportanceV1 } from "@toasty/domain";

export default function TodoScreen() {
  const router = useRouter();
  const { tasks, isLoading } = useTasks({ bucket: "todo" });

  // Sort by heat (descending), with untouched tasks pinned to top
  const sortedTasks = [...tasks].sort((a, b) => {
    const aUntouched = !a.lastTouchedAt && !a.lastHeatTouchedAt;
    const bUntouched = !b.lastTouchedAt && !b.lastHeatTouchedAt;

    // Untouched tasks first
    if (aUntouched && !bUntouched) return -1;
    if (!aUntouched && bUntouched) return 1;

    // Then by heat (descending)
    const now = new Date();
    const aHeat = calculateHeat(a, now, calculateImportanceV1(a, now));
    const bHeat = calculateHeat(b, now, calculateImportanceV1(b, now));
    return bHeat - aHeat;
  });

  return (
    <FlatList
      data={sortedTasks}
      keyExtractor={(item) => String(item.id)}
      renderItem={({ item }) => (
        <TaskListItem
          task={item}
          onPress={() => router.push(`/task/${item.id}`)}
        />
      )}
      contentContainerStyle={{ padding: 16 }}
    />
  );
}
```

**Component**: `components/TaskListItem.tsx`

Key styling per [mobile-styles-heat-importance-priority.md](mobile-styles-heat-importance-priority.md):

| Condition | Title Style |
|-----------|-------------|
| Untouched | Bold, Green 400 `#4ADE80` |
| Priority Top | Bold, Red (light: `#990000`, dark: `#DD5555`) |
| Priority High | Bold, Blue (light: `#344C63`, dark: `#7A9EC6`) |
| Priority Medium | Regular, default text |
| Priority Low | Light/300, muted text |

**Heat/Importance chip colors**:
- Blue 400 `#60A5FA`: Heat 0–8
- Green 400 `#4ADE80`: Heat 9–24
- Yellow 400 `#FACC15`: Heat 25–48
- Orange 400 `#FB923C`: Heat 49–71
- Red 400 `#F87171`: Heat 72–145

**Acceptance criteria**:
- [ ] Tasks sorted by heat (untouched pinned to top)
- [ ] Priority styling matches spec
- [ ] Heat chip colors match thresholds
- [ ] Tap navigates to detail screen
- [ ] List performance good with 100+ items

---

### 4.2 Task Detail/Edit Screen

**Reference**: [mobile-task-edit-guidelines.md](mobile-task-edit-guidelines.md)

**File**: `app/task/[id].tsx`

**Layout (top → bottom)**:
1. **Top Row**: Checkbox + editable title + Heat/Importance badge + Star control
2. **Notes Row**: Multi-line text area
3. **Priority Row**: Segmented control
4. **Due Date Row**: Date picker
5. **Project Row**: Dropdown picker
6. **Repeat Row**: Dropdown picker

**API mapping** per [mobile-task-edit-guidelines.md](mobile-task-edit-guidelines.md):

| Field | Fetch | Update |
|-------|-------|--------|
| Title | `task.title` | `PATCH /api/tasks/:id` with `{ title }` |
| Completed | `task.completedAt` | `POST/DELETE /api/tasks/:id/complete` |
| Star | `task.starLevel` | `POST /api/tasks/:id/star` |
| Due Date | `task.dueAt` | `PATCH /api/tasks/:id` with `{ dueAt }` |
| Notes | `task.notes` array | `POST /api/tasks/:id/notes` with `{ text }` |
| Priority | `task.priority` | `PATCH /api/tasks/:id` with `{ priority }` |
| Project | `task.projectId` | `PATCH /api/tasks/:id` with `{ projectId }` |
| Repeat | `task.repeatType` | `PATCH /api/tasks/:id` with `{ repeatType }` |

**Acceptance criteria**:
- [ ] All fields editable
- [ ] Changes enqueue to outbox for offline support
- [ ] Star cycles through 4 levels (off → blue → yellow → orange)
- [ ] Heat/Importance badge toggles display (no server call)
- [ ] Notes saved as full text blob
- [ ] URL auto-linking in notes

---

### 4.3 Quick Add Task

**Component**: `components/QuickAddTask.tsx`

Simple text input at top of task list. On submit:
1. Create task with title and user defaults (from settings)
2. Enqueue create operation to outbox
3. Optimistically add to local list
4. Clear input

**Acceptance criteria**:
- [ ] Single-field quick entry
- [ ] Uses user's default priority/bucket from settings
- [ ] Works offline (queues to outbox)
- [ ] New task appears immediately in list

---

### 4.4 Project Picker

**Component**: `components/ProjectPicker.tsx`

Dropdown/modal that shows:
- "No Project" option (clears projectId)
- List of active projects (sorted alphabetically)
- Project colors displayed as dots

**Data source**: `GET /api/projects` (cached locally via sync)

**Acceptance criteria**:
- [ ] Shows all non-archived projects
- [ ] "No Project" option available
- [ ] Project colors visible
- [ ] Selection updates task

---

### 4.5 Settings Screen

**File**: `app/(tabs)/settings.tsx`

Display user settings from local database (synced from server).

**Settings to show**:
- Default Priority (picker)
- Default Bucket (picker)
- Default Due Date (picker)
- Sort Mode (Heat/Importance)
- Grouping Mode (Ungrouped/Importance/Heat)

**Sync status section**:
- Last synced time
- Pending changes count
- Manual sync button

**Acceptance criteria**:
- [ ] Settings load from local database
- [ ] Changes saved to local DB and queued to outbox
- [ ] Sync status visible
- [ ] Manual sync trigger works

---

## Phase 5: Polish & Testing

### 5.1 Sync Status Indicators

**Header/footer component** showing:
- "Last synced X ago" (subtle, e.g., "5 min ago")
- Warning color if > 1 hour stale
- "Full sync required" if cursor > 30 days old

**Sync icon with badge** showing pending count:
- Icon: rotating arrows or cloud
- Badge: number of pending operations (e.g., "3")
- Tap opens pending operations list

**Events to handle** (from sync engine):
- `sync:started` - Show spinner
- `sync:completed` - Update "last synced" timestamp
- `sync:offline` - Show offline indicator
- `sync:error` - Show error toast
- `sync:pending-count` - Update badge

**Acceptance criteria**:
- [ ] Last synced time visible
- [ ] Stale data warning when > 1 hour old
- [ ] Pending count badge on sync icon
- [ ] Offline state clearly indicated

---

### 5.2 Error Handling UI

**Failed operations list** (accessible from settings or sync icon tap):
- List of permanently failed operations
- Each shows: operation type, target, error message
- Actions: Retry / Discard

**Toast notifications** for:
- Sync errors
- Auth required (with "Sign In" action)
- Conflict resolution ("Task deleted on another device")

**Acceptance criteria**:
- [ ] Failed operations visible to user
- [ ] Retry action re-queues operation
- [ ] Discard removes from outbox
- [ ] Error toasts non-blocking

---

### 5.3 Sync Engine Unit Tests

**Test file**: `lib/sync/__tests__/engine.test.ts`

**Test cases**:

1. **Outbox operations**
   - Enqueue creates pending entry with idempotency key
   - State transitions: pending → in_flight → applied
   - State transitions: pending → in_flight → failed (retryable)
   - Retry count increments on failure
   - Permanent failure after 5 retries

2. **Cursor pagination**
   - Empty cursor triggers full sync
   - `hasMore: true` continues loop
   - `hasMore: false` stops and saves cursor
   - Stale cursor (> 30 days) triggers warning

3. **Conflict resolution**
   - Server response overwrites local
   - Tombstone triggers local delete
   - Client ID → Server ID mapping works

4. **Network simulation**
   - Offline state prevents sync
   - Reconnect triggers sync
   - Partial batch failure (some succeed, some fail)

**Mocking approach**: Use MSW (Mock Service Worker) or manual fetch mocks.

**Acceptance criteria**:
- [ ] All outbox state transitions tested
- [ ] Pagination logic tested
- [ ] Conflict scenarios tested
- [ ] Network failure recovery tested
- [ ] Tests run in CI

---

### 5.4 Server Endpoint Integration Tests

**Test file**: `app/api/sync/__tests__/sync.test.ts`

**Test cases**:

1. **Pull endpoint**
   - Empty cursor returns all entities
   - Cursor returns only newer entities
   - Includes soft-deleted (tombstones)
   - Pagination respects limit
   - Returns correct cursor

2. **Push endpoint**
   - Batch operations processed in order
   - Idempotency key prevents duplicates
   - Client ID mapping works for creates
   - Failed operations return structured errors
   - Mixed success/failure in batch

**Test database**: Use local PostgreSQL or test database.

**Acceptance criteria**:
- [ ] Pull returns correct entities
- [ ] Tombstones included in pull
- [ ] Idempotency works
- [ ] Error codes match spec
- [ ] Tests run in CI

---

## Appendix: Key Files Reference

### Existing files to reference:
- [lib/db/schema.ts](../../lib/db/schema.ts) - Database schema
- [types/index.ts](../../types/index.ts) - Type definitions
- [lib/scoring/heat-v3.ts](../../lib/scoring/heat-v3.ts) - Heat calculation
- [lib/scoring/importance-v1.ts](../../lib/scoring/importance-v1.ts) - Importance calculation
- [lib/scoring/heat-config.ts](../../lib/scoring/heat-config.ts) - Heat constants

### Mobile spec docs:
- [monorepo-expo-mobile-spec.md](monorepo-expo-mobile-spec.md) - Full specification
- [mobile-api-reference.md](mobile-api-reference.md) - API documentation
- [mobile-task-edit-guidelines.md](mobile-task-edit-guidelines.md) - Task detail screen
- [mobile-styles-heat-importance-priority.md](mobile-styles-heat-importance-priority.md) - Visual styling

### Logo assets:
- [public/logo/toasty_task_filled_css-v4.svg](../../public/logo/toasty_task_filled_css-v4.svg) - Primary logo
- [public/logo/LOGO-STYLING-GUIDE.md](../../public/logo/LOGO-STYLING-GUIDE.md) - Logo guidelines

---

## Dependency Summary

### Root workspace packages:
```json
{
  "workspaces": ["apps/*", "packages/*"]
}
```

### packages/contracts:
- zod

### packages/api-client:
- @toasty/contracts

### packages/domain:
- @toasty/contracts

### apps/mobile:
- expo (SDK 52)
- expo-router
- expo-secure-store
- expo-constants
- expo-linking
- expo-status-bar
- expo-splash-screen
- expo-sqlite
- @clerk/clerk-expo (v2.x)
- @react-native-community/netinfo
- @tanstack/react-query
- zustand
- react-native-reanimated
- react-native-gesture-handler
- lucide-react-native
- uuid
- @toasty/contracts
- @toasty/api-client
- @toasty/domain
