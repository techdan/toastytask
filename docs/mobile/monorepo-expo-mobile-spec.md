# Toasty Task Mobile (Expo) + Monorepo + Offline Sync Specification

## Problem Statement

Toasty Task currently ships as a Next.js web app with Clerk authentication and a PostgreSQL (Supabase-hosted) database accessed via Drizzle. We want a native-feeling mobile app (Android first, iOS later) with offline support and a write queue, while reusing as much TypeScript domain logic and API integration work as practical.

Constraints and realities:
- The mobile client cannot run server-only code (`lib/db/*`, Drizzle, Node runtime APIs).
- Mobile must remain functional offline: reads from local storage and queued writes that reconcile later.
- The existing `/api/*` routes are the canonical integration surface (Clerk-authenticated) for v1.
- Realtime cross-client updates are desirable but explicitly deferred to a later phase.

## Goals

- Deliver an Expo (React Native) mobile app with native navigation/gestures and fast list performance.
- Support offline reads and offline queued writes (outbox) with automatic reconciliation when connectivity returns.
- Keep Clerk as the only authentication provider for v1 and route all data access through Next `/api`.
- Introduce a clean monorepo structure that supports shared TypeScript packages across web and mobile.
- Define a stable, mobile-safe API contract (DTOs) that is independent of Drizzle schema types.
- Include Notes in the sync model (Notes are first-class and must work offline).

## Non-Goals (v1)

- Supabase Realtime-based push updates between clients (deferred; see "Deferred Features").
- Push notifications for due date reminders (deferred; bundled with realtime).
- Deep linking / URL handling (deferred; documented in "Deferred Features").
- Migrating auth from Clerk to Supabase Auth.
- Rich notes with images/formatting (deferred; see `docs/rich-notes-upgrade-plan.md` and "Deferred Features").
- Full monorepo migration (moving web to `apps/web/`).

## Platform Requirements

### Expo SDK & Clerk Compatibility

Target versions for v1:
- **Expo SDK**: 52 (latest stable, released November 2024)
- **React Native**: 0.76 (default) or 0.77 (opt-in with expo ≥52.0.27)
- **@clerk/clerk-expo**: v2.x (requires Expo SDK ≥50, React Native ≥0.73, React 18+)
- **Node.js**: 18.17.0+ (required by Clerk SDKs; Node 16 EOL)
- **React**: 18+

Platform minimums (set by Expo SDK 52):
- **iOS**: 15.1+ (bumped from 13.4 in SDK 51)
- **Android**: API 24+ (Android 7.0), compileSdkVersion 35

Clerk Expo requirements (from [Clerk Expo v2 Upgrade Guide](https://clerk.com/docs/upgrade-guides/expo/v2)):
- Custom auth flows required—Clerk prebuilt UI components are **not available** for React Native.
- `expo-secure-store` required for secure token storage.
- Email links not supported in native apps.
- Use `@clerk/upgrade` CLI tool to assist with migration if upgrading from v1.

Expo SDK 52 notes (from [Expo SDK 52 Changelog](https://expo.dev/changelog/2024-11-12-sdk-52)):
- New Architecture only—Expo Go for SDK 52+ does not support the old architecture.
- SDK 53 will enable New Architecture by default with opt-out; future releases may remove old architecture entirely.
- Run `npx expo-doctor@latest` after scaffolding to check for library incompatibilities with New Architecture.

Scaffold command:
```bash
npx create-expo-app@latest apps/mobile --template expo-template-blank-typescript
```

### Environment Configuration

The mobile app needs to know which API server to target based on build environment.

Use Expo's `app.config.js` with environment variables:

```javascript
// apps/mobile/app.config.js
export default {
  expo: {
    name: "Toasty Task",
    slug: "toasty-task",
    extra: {
      apiBaseUrl: process.env.API_BASE_URL || "http://localhost:3000",
      clerkPublishableKey: process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY,
    },
  },
};
```

Environment targets:
- **Development**: `API_BASE_URL=http://localhost:3000` (or local IP for device testing)
- **Staging**: `API_BASE_URL=https://staging.toastytask.com` (if applicable)
- **Production**: `API_BASE_URL=https://toastytask.com`

Access in code via `expo-constants`:
```typescript
import Constants from 'expo-constants';
const apiBaseUrl = Constants.expoConfig?.extra?.apiBaseUrl;
```

### App Icon & Splash Screen

Use the existing Toasty Task logo defined in `public/logo/`.

Source assets (see `public/logo/LOGO-STYLING-GUIDE.md`):
- **Primary logo**: `public/logo/toasty_task_filled_css-v4.svg`
- **Favicon variants**: `toasty_task_filled_css-v4-favicon-light.svg` (light mode), `toasty_task_filled_css-v4-favicon-dark.svg` (dark mode)

For Expo, generate required PNG sizes from the SVG:
- `icon.png` (1024x1024) — App icon for stores
- `adaptive-icon.png` (1024x1024) — Android adaptive icon foreground
- `splash.png` (1284x2778 or similar) — Splash screen

Color values from `lib/logo-color-config.ts`:
- Toast orange: `#f24c05`
- Light mode foreground: use theme `--foreground`
- Dark mode accent: `#c4c9cc`

Splash screen recommendation:
- Centered logo on solid background matching app theme.
- Use `expo-splash-screen` for smooth transition to app.

### Background Sync

v1 is **foreground-only** for sync operations.

Rationale:
- iOS heavily restricts background execution; unreliable for critical data.
- Background sync adds battery/complexity concerns.
- Foreground sync is sufficient for a personal task app.

Future consideration:
- `expo-background-fetch` can be added later for periodic background refresh.
- Push notifications (deferred) can trigger sync when app is backgrounded.

### Build & Deployment

v1 uses **local builds** with Expo prebuild + Gradle.

**Generate native project:**
```bash
cd apps/mobile
npx expo prebuild --platform android
```

This creates `apps/mobile/android/` with standard React Native project structure.

**Development:**
```bash
# Run on device/emulator
npx expo run:android

# Or open apps/mobile/android/ in Android Studio
```

**Build APK/AAB:**
```bash
cd apps/mobile/android

# Debug APK
./gradlew assembleDebug

# Release APK (requires signing config in android/app/build.gradle)
./gradlew assembleRelease

# App Bundle for Play Store
./gradlew bundleRelease
```

**Signing configuration:**
Add to `apps/mobile/android/app/build.gradle`:
```gradle
android {
    signingConfigs {
        release {
            storeFile file(System.getenv("ANDROID_KEYSTORE_PATH") ?: "release.keystore")
            storePassword System.getenv("ANDROID_KEYSTORE_PASSWORD")
            keyAlias System.getenv("ANDROID_KEY_ALIAS")
            keyPassword System.getenv("ANDROID_KEY_PASSWORD")
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
        }
    }
}
```

Store keystore credentials in environment variables, not in the repo.

**Alternative: EAS Build** (cloud-based) is available but not required. See [EAS Build docs](https://docs.expo.dev/build/introduction/) if team members don't have Android SDK installed.

## Repository Strategy

We will keep the same repository and implement changes on a branch.

Rationale:
- Preserves full history and existing deployment configuration.
- Avoids duplicated maintenance between a fork and the canonical web app.
- Enables incremental adoption (web continues to ship while mobile is built).

### Monorepo Migration Approach (v1)

For v1, we will **not** move the existing web app to `apps/web/`. Instead:
- Keep the Next.js app at the repository root (current structure).
- Add `apps/mobile/` alongside for the Expo app.
- Add `packages/*` for shared code.

Rationale:
- Avoids breaking existing Vercel deployment, CI/CD, and import paths.
- Unblocks mobile development immediately.
- The full `apps/web/` migration can happen later when there's a natural pause.

Trade-offs accepted:
- Shared packages use slightly awkward imports from the root web app (e.g., `../packages/contracts` or path aliases).
- Two separate `node_modules` trees until npm workspaces are fully configured.
- Asymmetric folder structure (web at root, mobile in `apps/`).

## Monorepo Layout (npm workspaces)

v1 layout:
- `/` (root) — existing Next.js app (unchanged)
- `apps/mobile/` — Expo app (Android first, iOS later)
- `packages/api-client/` — typed HTTP client + auth header injection + shared request helpers
- `packages/contracts/` — DTO types and runtime validation schemas (mobile-safe)
- `packages/domain/` — shareable business logic (scoring, recurrence, formatting) that depends only on DTOs

### Scoring Code Portability

The scoring logic in `lib/scoring/` (`heat-v3.ts`, `importance-v1.ts`, `heat-config.ts`, `importance-colors.ts`) is a candidate for `packages/domain/`.

Current state:
- Pure TypeScript functions with no Node/DB dependencies.
- Only imports: `@/types` (path alias to `types/index.ts`).
- Functions operate on task-shaped objects, not DB rows.

Migration path:
1. Copy scoring files to `packages/domain/scoring/`.
2. Replace `@/types` import with local DTO types from `packages/contracts`.
3. Update web app to import from `@toasty/domain` instead of `lib/scoring/`.
4. Mobile app imports the same package.

This enables client-side heat calculation for optimistic UI updates on mobile while keeping the server as the authoritative source.

Future layout (deferred):
- `apps/web/` — Next.js app (moved from root)
- `apps/mobile/` — Expo app
- `packages/*` — shared packages

Root `package.json` will define npm workspaces for `apps/*` and `packages/*`.

Guiding rule:
- Only the root web app may import server-only code (`lib/db/*`, Next server APIs).
- `packages/*` must be platform-neutral (Node-free, DOM-free) so Expo can bundle them.

## Shared Contract vs DB Schema: Tradeoffs and Recommendation

### Option A: Share DB schema types (`lib/db/schema.ts`) with mobile

Pros:
- Appears “DRY”: one source of types.

Cons (significant):
- Couples mobile to Drizzle schema and server-only concerns.
- Pulls in Node/DB dependencies (or type-only imports that still create brittle pathing).
- Blurs responsibilities: DTOs (API shapes) are not the same as DB rows (internal persistence).
- Makes it harder to evolve the API without exposing internal columns/fields.

### Option B: Shared contracts (DTOs) as the mobile boundary (recommended)

Pros:
- Clean separation: DB schema is internal; DTOs are the public boundary.
- Mobile-safe packages: Expo can consume contracts without server bundling issues.
- Enables consistent request/response validation (runtime schemas) on both server and client.
- Makes cursor sync and offline storage easier because DTOs are intentionally shaped for clients.

Cons:
- Requires explicit mapping between DB rows and DTOs in the API layer.
- Adds a small amount of maintenance overhead when fields change.

Recommendation:
- Adopt Option B. Create `packages/contracts` and treat it as the “public API boundary” for both web and mobile.

## API Strategy (v1)

### Canonical surface

All reads/writes for v1 go through existing Next routes under `/api/*`, authenticated by Clerk bearer tokens:
- Mobile attaches `Authorization: Bearer <Clerk session token>` (see `docs/mobile/mobile-api-reference.md`).

### DTO Mapping

Server routes should return DTOs defined in `packages/contracts` rather than leaking DB schema types. Internally, routes may:
- read/write via repositories (`lib/db/repositories/*`)
- compute derived fields (heat, importance, counts)
- map DB rows to DTOs at the edge

This mapping step is also where we can normalize:
- timestamps (ISO strings)
- nullable fields
- “rich” server-only fields (excluded from mobile DTOs unless needed)

## Offline Architecture (SQLite + Outbox)

### Data model on device

SQLite tables mirror DTOs:
- `tasks`
- `projects`
- `settings`
- `notes` (see below)
- `outbox` (queued writes)
- `sync_state` (last successful pull cursor, last push status)

### Outbox format (conceptual)

Each queued write stores:
- target: resource type and remote identifier (or client-generated temporary id)
- operation: create/update/delete + endpoint + method
- payload: JSON request body
- idempotency key: stable UUID per operation
- timestamps: createdAt, lastAttemptAt
- state: pending, in_flight, applied, failed (with error details)

### Idempotency and "create while offline"

Offline creates require a strategy to prevent duplicates when retrying:
- Server accepts an `Idempotency-Key` header and persists the result per user+key.
- Client also includes a `clientId` UUID in create payloads for ID mapping after sync.

Server-side implementation:
- New `idempotency_keys` table stores `(key, user_id, response, created_at)`.
- On receiving a request with an idempotency key, check if key exists for user:
  - If exists: return cached response (no side effects).
  - If not: process request, store response, return result.
- Keys expire after 48 hours via scheduled cleanup job.

Client-side implementation:
- Generate UUID for each outbox operation at creation time.
- Store `clientId` → `serverId` mapping after successful creates.
- Update all local foreign key references when mapping is received.

### Conflict policy (v1)

Primary policy:
- Server is authoritative. After a push, the server response overwrites local fields.
- For concurrent edits, use last-write-wins based on server timestamps (`updatedAt`).

Field-level authority rules:

| Field | Authority | Rationale |
|-------|-----------|-----------|
| `title`, `notes`, `bucket`, `priority`, `dueAt`, `projectId` | Last write wins | User content/preferences |
| `completedAt`, `status` | Last write wins | User intent is clear |
| `heat`, `importance`, `heatCalculatedAt` | Server always | Derived/computed fields |
| `deletedAt` | Server wins | Prevent accidental resurrection |
| `createdAt`, `updatedAt` | Server always | Audit fields |

UX policy:
- If a queued write fails due to validation/ownership, mark it failed and surface a non-blocking UI indicator with a retry/discard action.
- "Deleted while editing" conflict: Show toast ("This task was deleted on another device") and offer to restore or discard local changes.

### Tombstone Retention

Soft-deleted entities (non-null `deletedAt`) are retained for 30 days to support sync.

Behavior:
- Pull endpoint returns tombstones for entities deleted since the cursor.
- Client removes local copies when receiving a tombstone.
- After 30 days, tombstones are hard-deleted from the server.
- If a client's cursor is older than 30 days, it must perform a full re-sync (clear local DB, pull from empty cursor).

## Sync Model (timestamp cursors)

### Cursor Format

Cursors are **plain ISO 8601 timestamp strings** (e.g., `2025-01-15T10:30:00Z`).

Rationale:
- Easier to debug—timestamps are human-readable in network logs and database queries.
- Sufficient for a single-user task app without complex sharding.
- If compound cursors become necessary later, we can introduce a v2 endpoint.

The cursor represents the `updatedAt` timestamp of the most recently synced entity. The server generates all cursor values; clients never fabricate timestamps.

### Pull (read)

Sync endpoint:
- `GET /api/sync/pull?since=<ISO timestamp>&limit=<number>`

Request parameters:
- `since` (required): ISO timestamp cursor from previous sync, or empty string for initial sync.
- `limit` (optional): Maximum entities to return (default 500, max 1000).

Response:
```json
{
  "entities": {
    "tasks": [...],
    "projects": [...],
    "notes": [...],
    "settings": {...}
  },
  "cursor": "2025-01-15T10:35:22Z",
  "hasMore": false
}
```

Behavior:
- Returns all entities with `updatedAt > since` (including soft-deleted via `deletedAt` tombstones).
- Results ordered by `updatedAt` ascending to ensure consistent pagination.
- `cursor` is the `updatedAt` of the last entity returned.
- Client loops until `hasMore: false`, then stores final `cursor` in `sync_state`.

### Push (write)

Batch endpoint for queued operations:
- `POST /api/sync/push`

Request body:
```json
{
  "operations": [
    {
      "idempotencyKey": "uuid-1",
      "method": "POST",
      "path": "/api/tasks",
      "body": { "title": "New task", "clientId": "temp-uuid-123" }
    },
    {
      "idempotencyKey": "uuid-2",
      "method": "PATCH",
      "path": "/api/tasks/456",
      "body": { "title": "Updated title" }
    }
  ]
}
```

Response:
```json
{
  "results": [
    { "idempotencyKey": "uuid-1", "status": "success", "clientId": "temp-uuid-123", "serverId": 789, "entity": {...} },
    { "idempotencyKey": "uuid-2", "status": "success", "entity": {...} }
  ],
  "cursor": "2025-01-15T10:36:00Z"
}
```

Behavior:
- Processes operations in order.
- Each operation includes an `idempotencyKey`; server de-duplicates within 48-hour window.
- For creates, `clientId` maps to `serverId` in response so client can update local references.
- Failed operations return `{ status: "error", error: "message" }` without aborting the batch.
- Returns a new cursor reflecting the latest server state.

### Batch Size Limits

- Push: Maximum 100 operations per request. Client chunks larger batches.
- Pull: Maximum 1000 entities per response. Client loops with cursor until complete.

### Retry Strategy

For failed push operations:
- Exponential backoff with jitter: `min(1000 * 2^attempt + random(0-1000), 30000)` ms.
- Max 5 retries before marking operation as permanently failed.
- Permanent failures surface in UI with retry/discard actions.

### Error Codes

Structured error format for failed operations:

```json
{
  "status": "error",
  "code": "TASK_NOT_FOUND",
  "message": "Task with id 456 not found",
  "retryable": false
}
```

Standard error codes:

| Code | Retryable | Description |
|------|-----------|-------------|
| `VALIDATION_ERROR` | No | Request body failed validation |
| `NOT_FOUND` | No | Resource does not exist |
| `FORBIDDEN` | No | User does not own resource |
| `CONFLICT` | No | Resource was modified/deleted by another client |
| `UNAUTHORIZED` | No* | Auth token invalid (trigger re-auth flow) |
| `RATE_LIMITED` | Yes | Too many requests; retry after backoff |
| `SERVER_ERROR` | Yes | Internal server error; retry with backoff |
| `NETWORK_ERROR` | Yes | Client-side; request didn't reach server |
| `TIMEOUT` | Yes | Request timed out |

*`UNAUTHORIZED` triggers auth refresh flow rather than standard retry.

Client behavior:
- `retryable: true` → add to retry queue with backoff.
- `retryable: false` → mark as permanently failed, surface to user.

### Notes in sync

Notes are first-class and must sync offline. v1 will sync the "current note text state", not full version history:
- Store note rows as "currentText" snapshots with `updatedAt`.
- Use cursor pull to return changed note rows (and tombstones for deletes).
- Outbox writes notes via the existing "full text blob" endpoint:
  - `POST /api/tasks/{id}/notes` with `{ text: "..." }`

This keeps the client model simple and lets the server continue handling line-diff/versioning.

### Auth Token Refresh

Clerk session tokens may expire while the device is offline. The sync engine must handle this gracefully.

Flow:
1. Before flushing outbox, validate current token via `clerk.session?.getToken()`.
2. If token is null or expired, call `clerk.session?.touch()` to refresh.
3. If refresh fails (e.g., user logged out on another device), emit `sync:auth-required` event.
4. UI layer prompts re-authentication before resuming sync.
5. Outbox operations remain queued (not discarded) during auth recovery.

### Mobile SQLite Migrations

Mobile SQLite schema must be versioned from day one to support app updates.

Approach:
- Store schema version in a `schema_version` table.
- Migrations are append-only functions: `{ version: number, up: (db) => void }`.
- On app startup, run all migrations with version > current.
- Never modify existing migrations; only append new ones.

Example:
```typescript
const migrations = [
  { version: 1, up: (db) => db.exec(`CREATE TABLE tasks (...)`) },
  { version: 2, up: (db) => db.exec(`ALTER TABLE tasks ADD COLUMN focus INTEGER DEFAULT 0`) },
];
```

## Mobile UI/UX Decisions

### Reference Documents

Mobile UI follows the existing web app patterns. See:
- `docs/mobile/mobile-api-reference.md` — API integration details
- `docs/mobile/mobile-task-edit-guidelines.md` — Task detail screen layout and field mapping
- `docs/mobile/mobile-styles-heat-importance-priority.md` — Visual styling for heat/importance

### Sync Status Indicators (v1)

The app should surface sync state to users:

**Stale data indicator**:
- Show "Last synced X ago" in a subtle header or footer area.
- If cursor is >1 hour old, show warning color.
- If cursor is >30 days old, show "Full sync required" prompt.

**Pending changes badge**:
- Show count of outbox operations on a sync icon or in settings.
- Example: 🔄 (3) indicates 3 pending writes.
- Tapping opens a list of pending/failed operations with retry/discard options.

**Sync status events**:
The sync engine should emit events for UI consumption:
- `sync:started` — sync in progress
- `sync:completed` — sync finished successfully
- `sync:offline` — device is offline
- `sync:error` — sync failed (with error details)
- `sync:pending-count` — number of queued operations changed

### Initial Data

First-time users see whatever exists on the server. No client-side seeding of example tasks—this is handled server-side during account creation.

## Testing Strategy

### Sync Engine (required for v1)

The sync engine is critical and hard to debug in production. Unit tests are required:
- **Outbox operations**: Queue, retry, permanent failure marking.
- **Cursor pagination**: Empty cursor, hasMore looping, stale cursor detection.
- **Conflict resolution**: Last-write-wins, tombstone handling, ID mapping.
- **Network simulation**: Offline → online transitions, partial batch failures.

Use mocked network layer (e.g., MSW or manual fetch mocks) to simulate server responses.

### Shared Packages

- `packages/contracts`: Zod schema validation tests.
- `packages/domain`: Unit tests for scoring functions (already pure, easy to test).

### Mobile UI (deferred)

Manual testing for v1. E2E automation (Detox/Maestro) can be added in later phases if warranted by regression frequency.

### Server Sync Endpoints

Integration tests against local database for `/api/sync/pull` and `/api/sync/push`. Cover:
- Idempotency key de-duplication.
- Correct cursor generation.
- Tombstone inclusion in results.

## Deferred Features

### Realtime Sync + Push Notifications

Realtime cross-client updates and push notifications will be implemented together in a later phase.

Candidate approach:
- **Supabase Realtime** broadcast as a "poke" mechanism to notify clients of changes.
- Client receives poke → triggers cursor pull to fetch actual data.
- This avoids polling while keeping Clerk + `/api` as canonical data path.

Push notifications integration:
- Use Expo's push notification service (`expo-notifications`).
- Server sends push via Supabase Edge Functions or a scheduled job.
- Notification types: due date reminders, task assignments (if multi-user added later).
- Push can include a "poke" payload to trigger background sync.

### Deep Linking

Deep links allow external URLs to open specific screens in the app.

Deferred for v1, but document the planned scheme:
- `toastytask://task/{id}` — Open task detail screen
- `toastytask://project/{id}` — Open project view
- `toastytask://bucket/{bucket}` — Open bucket (todo/watch/later)

Implementation notes:
- Use `expo-linking` for URL handling.
- Requires app.json configuration for custom scheme.
- Universal links (https://app.toastytask.com/...) require domain verification.

### Rich Notes

v1 syncs notes as plain text blobs (current line-based model).

Future upgrade planned per `docs/rich-notes-upgrade-plan.md`:
- Block-based rich notes with per-block versioning.
- Support for bulleted lists, indentation, inline images.
- Images stored in Supabase Storage (private bucket, signed URLs).
- Task-level `notes_mode` flag (`legacy` | `rich`) for gradual migration.

Mobile considerations for rich notes:
- Rich text editor library needed (e.g., adapt TipTap for React Native, or use a native solution).
- Image upload requires background upload queue (similar to outbox pattern).
- Sync model would need to handle block-level diffs instead of full-text blobs.

This is a significant feature and will have its own implementation spec when prioritized.

## Relevant Beads Issues

Parent epic:
- `toodle-70.1` Native mobile app (Expo): monorepo + offline sync

Planned work items:
- `toodle-70.1.3` Monorepo restructure: apps/web + apps/mobile
- `toodle-70.1.4` Scaffold Expo app (Android) with Clerk auth
- `toodle-70.1.5` Define mobile-safe DTOs + api-client package
- `toodle-70.1.6` Offline SQLite + outbox queue + sync engine
- `toodle-70.1.7` Sync endpoints: timestamp cursor pull + push
- `toodle-70.1.8` Write specification doc: monorepo + Expo mobile + offline sync

## Considered Alternatives (Rejected for v1)

- Kotlin/Compose native client:
  - Rejected for v1 due to significantly lower code reuse and slower iteration on shared domain logic and API integration.

- Supabase Auth migration (replacing Clerk):
  - Rejected for v1 due to production migration complexity and broad surface area changes (middleware, API routes, user id ownership).

- Direct-to-Supabase client reads/writes with RLS:
  - Rejected for v1 because it splits the canonical write path and complicates derived field computation (heat/importance) and invariants already enforced in `/api`.

- Server-relayed SSE/WebSockets on Vercel:
  - Rejected for v1 due to long-lived connection constraints in serverless runtimes; revisit only if moving to a long-running Node runtime.

