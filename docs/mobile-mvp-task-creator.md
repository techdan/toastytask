# Mobile MVP: Quick Task Creator

This guide explains the minimum backend integration required for an Android MVP that shows a single text field and creates a Toodle task when the user presses submit. It describes the API calls involved and how to authenticate with Clerk, including a pragmatic option for hardcoding a development token during the earliest prototype stage.

---

## MVP Workflow Overview
- **UI interaction:** User enters a task title and taps submit.
- **Network call:** Mobile app sends a `POST /api/tasks` request with the title (and optional overrides) in JSON.
- **Server response:** API returns the fully populated task record, including calculated importance and heat scores.
- **UI update:** App can ignore the payload for now or display a confirmation/toast.

No other API endpoints are strictly required for this minimal experience, though a production client would add task list retrieval (`GET /api/tasks`) and error handling UX.

---

## Clerk Authentication
All Next.js API routes are protected by Clerk through `middleware.ts`. Every request from the mobile client must carry a valid Clerk session token in the `Authorization` header.

### Option A – Proper Mobile Auth (Recommended)
1. **Integrate Clerk’s mobile SDK** (React Native or direct REST) to perform email/password or OAuth sign-in.
2. After sign-in, Clerk returns a **session token** (JWT).
3. Include the token on every API call:
   ```
   Authorization: Bearer <session_token>
   ```
4. Refresh tokens before they expire (Clerk SDK handles this for you).

### Option B – Hardcoded Development Token (Hack for MVP)
For a throwaway prototype you can temporarily hardcode a session token, but keep in mind:
- Tokens **expire** (usually ~1 week) and are tied to a specific Clerk user.
- Anyone with the token can access that user’s data, so never ship this to production.

The dev token value stored in the `__session` cookie is : 
<removed_jwt>


-  the header `Authorization: Bearer <copied_token>` on every request.

---

## API Request: Create Task

### Endpoint
`POST /api/tasks`

### Headers
```
Authorization: Bearer <clerk_session_token>
Content-Type: application/json
```

### Body
Only `title` is required. All other fields fall back to the user’s settings defaults.
```json
{
  "title": "Follow up with design team"
}
```

Optional fields you can add later:
- `priority`: `"low" | "medium" | "high" | "top"`
- `bucket`: `"todo" | "watch" | "later"`
- `starLevel`: `0 | 1 | 2 | 3`
- `dueAt`: ISO datetime string
- `projectId`: numeric project id
- `repeatType`: `"none" | "daily" | "weekly" | "monthly"`

### Success Response
```json
{
  "task": {
    "id": 123,
    "title": "Follow up with design team",
    "priority": "medium",
    "bucket": "todo",
    "importanceV1": 6,
    "heat": 74.3,
    "createdAt": "2025-10-30T05:12:47.882Z",
    "...": "other fields omitted"
  }
}
```

### Error Responses
- `401 {"error": "Unauthorized"}` – missing/invalid Clerk token.
- `400 {"error": "Failed to create task"}` – malformed body (rare if you only send `title`).
- `500 {"error": "Failed to create task"}` – server issue; log the response for debugging.

---

## Putting It Together (Pseudo-code)

```ts
async function createTask(title: string) {
  if (!title.trim()) return;

  const response = await fetch("https://your-host/api/tasks", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${CLERK_SESSION_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title }),
  });

  if (!response.ok) {
    // handle 401 → re-auth, other codes → show error
    throw new Error(`Task create failed: ${response.status}`);
  }

  const data = await response.json();
  return data.task;
}
```

Replace `CLERK_SESSION_TOKEN` with either the hardcoded dev token (Option B) or the current session token from Clerk’s mobile SDK (Option A).

---

## Next Steps Beyond the MVP
- Add `GET /api/tasks` to display the newly created item.
- Implement proper sign-in and token refresh via Clerk.
- Surface server validation errors (e.g., empty title) in the UI.
- Store the base API URL in configuration so the app can switch between local and production environments.
