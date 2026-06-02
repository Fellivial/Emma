# Realtime & Push Notification Delivery — Research

**Date:** 2026-05-31  
**Context:** Emma (Next.js AI companion on Vercel) needs two capabilities:

1. Deliver HITL (human-in-the-loop) approval requests from background cron tasks to an open browser tab.
2. Show live task-status updates from the Supabase `tasks` table in the React client without polling.

This document covers the two main mechanisms — **Web Push API** and **Supabase Realtime** — and closes with an architecture recommendation for Emma.

---

## Part 1 — Web Push API

### 1.1 What VAPID Is

VAPID (Voluntary Application Server Identification) is the spec that authenticates push messages as coming from your server rather than an impersonator. You generate one asymmetric key-pair (public + private) as a one-time operation. When you send a push, you sign a JWT with the private key; the browser push service (FCM, Mozilla AutoPush, APNs) validates the signature using the public key you provided at subscription time.

**Generating keys with the `web-push` npm package:**

```bash
# One-time, store output in .env
npx web-push generate-vapid-keys
```

Output:

```
Public Key:  BNGyCpAqnBxxxxxxxxxxxxxxxxxxx...
Private Key: <hex string>
```

Store as:

- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` — visible to the browser (used in `subscribe()`)
- `VAPID_PRIVATE_KEY` — server-only, never expose to the client

**Server-side initialization:**

```ts
import webpush from "web-push";
webpush.setVapidDetails(
  "mailto:admin@yourapp.com", // contact URI
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);
```

### 1.2 PushSubscription Object Structure

When a user grants permission and you call `pushManager.subscribe()`, the browser returns a `PushSubscription` object. Serialized to JSON it looks like:

```json
{
  "endpoint": "https://fcm.googleapis.com/fcm/send/c1KrmpTuRm...",
  "expirationTime": null,
  "keys": {
    "p256dh": "BIPUL12DLfytvTajnryr2PRdAgXS3HGKiLqndGcJGabyhHheJYlNGCeXl1dn18gSJ1WAkAPIxr4gK0_dQds4yiI=",
    "auth": "FPssNDTKnInHVndSTdbKFw=="
  }
}
```

- **`endpoint`** — the push service URL unique to this browser/device. The domain identifies the push service (FCM for Chrome/Edge, AutoPush for Firefox, APNs for Safari). Keep this private; anyone with the URL can attempt to push.
- **`keys.p256dh`** — elliptic-curve public key used to encrypt the push payload.
- **`keys.auth`** — 16-byte authentication secret used alongside p256dh for encryption.

The full subscription object must be persisted server-side so you can push to it later (see section 1.4).

### 1.3 Service Worker Registration in Next.js App Router

**Key constraint:** The App Router has no `_document.js`, so the classic Pages Router trick of registering a service worker there does not apply. The correct approach:

1. Place the service worker file at `public/sw.js` so it is served from the root (`/sw.js`).
2. Create a client component (e.g., `src/components/ServiceWorkerRegistrar.tsx`) that registers the SW in a `useEffect`.
3. Render that component inside `app/layout.tsx` so it runs globally.

**Registration pattern:**

```tsx
"use client";
import { useEffect } from "react";

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if ("serviceWorker" in navigator && "PushManager" in window) {
      navigator.serviceWorker.register("/sw.js", {
        scope: "/",
        updateViaCache: "none", // always fetch latest sw.js — important for production
      });
    }
  }, []);
  return null;
}
```

`updateViaCache: 'none'` is important: the default allows the browser to cache the SW file, delaying updates. Setting it to `'none'` forces a fresh fetch on every page load.

**Push event handler in `public/sw.js`:**

```js
self.addEventListener("push", function (event) {
  if (event.data) {
    const data = event.data.json();
    const options = {
      body: data.body,
      icon: data.icon || "/icon.png",
      badge: "/badge.png",
      vibrate: [100, 50, 100],
      data: { url: data.url },
    };
    event.waitUntil(self.registration.showNotification(data.title, options));
  }
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  if (event.notification.data?.url) {
    event.waitUntil(clients.openWindow(event.notification.data.url));
  }
});
```

`event.waitUntil()` is mandatory — it signals to the browser that the SW has work to complete and prevents it from terminating before `showNotification` resolves.

**Local development:** Service workers require HTTPS. Use `next dev --experimental-https` for local push testing.

**`next.config.js` headers for `/sw.js`** (recommended for production):

```js
{
  source: '/sw.js',
  headers: [
    { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
    { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
    { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self'" },
  ],
}
```

### 1.4 Storing PushSubscription Objects (Supabase)

Each browser/device that subscribes produces a distinct `PushSubscription`. You need one row per device per user.

**Proposed table schema:**

```sql
create table push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade not null,
  subscription jsonb not null,       -- full serialized PushSubscription
  user_agent  text,                  -- optional: for debugging which device
  created_at  timestamptz default now()
);

alter table push_subscriptions enable row level security;

create policy "users manage own subscriptions"
  on push_subscriptions
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

**Design decisions:**

- Store the full JSON blob so you do not need to normalize the keys structure.
- Per-device: one user can have multiple rows (desktop Chrome, iPhone Safari, Firefox, etc.).
- On subscription, POST the serialized object to a Server Action or a new `/api/emma/push-subscribe` route. On unsubscribe, delete the row.
- Stale subscriptions (push service returns 410 Gone) should be deleted automatically from the sending code.

### 1.5 Server-Side Push (API Route or Cron)

```ts
// In a Next.js API route, Server Action, or cron handler
import webpush from "web-push";

webpush.setVapidDetails(
  "mailto:admin@example.com",
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

async function pushToUser(userId: string, payload: object) {
  const { data: subs } = await supabaseAdmin
    .from("push_subscriptions")
    .select("id, subscription")
    .eq("user_id", userId);

  const results = await Promise.allSettled(
    subs.map(({ id, subscription }) =>
      webpush.sendNotification(subscription, JSON.stringify(payload)).catch(async (err) => {
        if (err.statusCode === 410) {
          // Subscription expired — clean up
          await supabaseAdmin.from("push_subscriptions").delete().eq("id", id);
        }
        throw err;
      })
    )
  );
  return results;
}
```

`webpush.sendNotification(subscription, payload)` encrypts the payload with the subscription's p256dh/auth keys and delivers via the push service endpoint. The payload is a string; JSON.stringify a typed object for structured data.

HTTP 410 (Gone) from the push service means the subscription is no longer valid and must be deleted; otherwise you accumulate dead rows.

### 1.6 Browser Support

| Browser           | Push Support                              | Notes                                                                                                                                                                                                                                                                                          |
| ----------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chrome / Edge     | Full                                      | Desktop and Android. Uses FCM endpoint.                                                                                                                                                                                                                                                        |
| Firefox           | Full                                      | Desktop and Android. Uses Mozilla AutoPush. Desktop quota applies (lifted for visible notifications).                                                                                                                                                                                          |
| Safari macOS      | Full since Safari 16 / macOS 13 (Ventura) | Uses APNs. VAPID required.                                                                                                                                                                                                                                                                     |
| Safari iOS        | Partial — iOS 16.4+ only                  | Must be installed as PWA to home screen. Push API is unavailable in the Safari browser itself.                                                                                                                                                                                                 |
| iOS in EU (17.4+) | Restored after reversal                   | Apple initially removed PWA standalone mode in iOS 17.4 beta (Feb 2024) for EU users under DMA pressure, then reversed it after regulatory backlash. As of 2025 PWA/push is restored globally. EU fined Apple EUR 500M in April 2025 for separate DMA non-compliance. Ongoing regulatory risk. |
| Samsung Internet  | Full (Chromium-based)                     | Behaves like Chrome.                                                                                                                                                                                                                                                                           |
| Opera / Brave     | Full (Chromium-based)                     |                                                                                                                                                                                                                                                                                                |

**What is missing or limited:**

- iOS users who have not installed the PWA to their home screen receive no push notifications at all. There is no automatic install prompt on iOS — users must manually tap Share then "Add to Home Screen."
- The Push API is sandboxed per context on iOS: subscription state and localStorage are separate between the Safari browser and the installed PWA.
- Some privacy-focused browser configurations (cookie auto-deletion, private browsing) can clear SW registrations and subscriptions silently.
- Safari on iOS has a 7-day cache limit that can expire cached credentials or subscription data.

### 1.7 Permission Prompt UX Best Practices

The browser blocks `Notification.requestPermission()` unless called from a user gesture (click, keypress). Best practices:

1. **Never ask on page load.** Browsers suppress or flag sites that request permission immediately. Safari 12.1+ enforces this at the engine level. Firefox 68+ has the same behavior.
2. **Show value first.** Demonstrate what the notification will contain before asking. For Emma: "Emma will notify you when she needs your approval for a task."
3. **Tie to a user action.** Gate `subscribe()` behind a clearly-labelled button: "Enable approval notifications."
4. **Respect denial.** If the user clicks "Block," do not re-prompt. Store their preference and surface a settings option to re-enable.
5. **Use double opt-in for iOS.** On iOS, the permission prompt can only appear after the PWA is installed. Consider showing an in-app nudge first, before the system prompt, explaining that they need to install and then approve.
6. **The right time for Emma:** A good trigger is the first time Emma generates a background task that requires approval. At that moment the user already has context for why they would want the notification.

---

## Part 2 — Supabase Realtime

### 2.1 Channel Setup

```ts
// Inside a client component
const channel = supabase
  .channel("tasks-<userId>") // unique per user; cannot be the string 'realtime'
  .on(
    "postgres_changes",
    {
      event: "*", // INSERT | UPDATE | DELETE | *
      schema: "public",
      table: "tasks",
      filter: `user_id=eq.${userId}`, // row-level filter
    },
    (payload) => {
      console.log("Change received:", payload);
    }
  )
  .subscribe((status) => {
    console.log("Realtime status:", status);
  });
```

**Channel naming:** Any string except the literal `'realtime'`. Use a user-scoped name (e.g., `tasks-${userId}`) to avoid conflicts between users. If two `useEffect`s on different pages use the same channel name, they conflict when navigating — always include a unique discriminator.

**Multiple events on one channel:** Chain multiple `.on()` calls before `.subscribe()`. Each call targets a different table or event combination. One `subscribe()` per channel is the connection-efficient pattern.

**Payload shape:**

```ts
{
  schema: 'public',
  table: 'tasks',
  commit_timestamp: '2026-05-31T12:00:00Z',
  eventType: 'UPDATE',
  new: { id: '...', status: 'done', ... },
  old: {}   // {} unless REPLICA IDENTITY FULL is set
}
```

**Available filters:**

- `eq` — `'user_id=eq.abc-123'`
- `neq` — `'status=neq.cancelled'`
- `lt`, `lte`, `gt`, `gte` — numeric/date comparisons
- `in` — `'status=in.(pending,running)'` (max 100 values)
- DELETE events cannot be filtered at the subscription level — filter client-side.

### 2.2 RLS on Realtime

Supabase Realtime respects RLS since ~2023. Every change event is checked against RLS policies before being forwarded to the subscriber.

**Requirements:**

1. Enable RLS on the table:

   ```sql
   alter table tasks enable row level security;
   ```

2. Create a SELECT policy for the authenticated user:

   ```sql
   create policy "users see own tasks"
     on tasks for select
     to authenticated
     using (auth.uid() = user_id);
   ```

3. Add the table to the `supabase_realtime` publication:

   ```sql
   alter publication supabase_realtime add table tasks;
   ```

   This can also be done via Dashboard → Database → Publications → supabase_realtime → toggle the table.

4. **`REPLICA IDENTITY FULL`** — required if you want the `old` record in UPDATE/DELETE payloads:
   ```sql
   alter table tasks replica identity full;
   ```
   Without this, `payload.old` is empty on UPDATEs and contains only the primary key on DELETEs when RLS is enabled. For Emma's use case (showing new task status), this is optional.

**Performance caveat:** Each change event triggers an RLS authorization check per connected subscriber. With many users subscribed to the same table, a single INSERT causes N database reads. For Emma (one user per session, low task churn), this is fine. At scale, consider public tables without RLS + server-side re-streaming via Broadcast.

**DELETE events cannot be filtered** with the `filter` parameter — this is a known Postgres Changes limitation. The full unfiltered DELETE event is sent and you must discard irrelevant rows client-side.

### 2.3 Next.js App Router Integration

Realtime is purely client-side — it opens a WebSocket connection from the browser. Server Components cannot use it. The pattern is a `useEffect` in a client component:

```tsx
"use client";
import { useEffect } from "react";
import { createBrowserClient } from "@supabase/ssr";

export function TasksRealtimeListener({ userId, onTaskUpdate }: Props) {
  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const channel = supabase
      .channel(`tasks-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks", filter: `user_id=eq.${userId}` },
        (payload) => onTaskUpdate(payload)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel); // cleanup on unmount
    };
  }, [userId]);

  return null;
}
```

**Cleanup is mandatory.** `supabase.removeChannel(channel)` on unmount prevents memory leaks, dangling subscriptions, and the channel-name conflict bug where two effects on the same name fight each other during navigation.

**SSR caveats:**

- `createBrowserClient` from `@supabase/ssr` is the current recommended client for browser-side use. It supersedes the deprecated `createClientComponentClient` from `@supabase/auth-helpers-nextjs`.
- `createBrowserClient` uses a singleton pattern internally — calling it multiple times returns the same instance.
- Emma's middleware in `src/proxy.ts` refreshes the auth token and stores it in cookies. The browser client reads from those cookies, so the Realtime channel inherits the authenticated session automatically.
- Do not create the client in the component body without `useMemo` — creating a new instance on every render is harmless (singleton) but wasteful.

### 2.4 Auth in Realtime Channels

`createBrowserClient` from `@supabase/ssr` is the right choice for authenticated Realtime in the App Router. It reads the session from cookies (set by middleware), so the channel is automatically authenticated as the logged-in user.

If you need to set a custom token explicitly (e.g., for RLS policies that check custom JWT claims):

```ts
supabase.realtime.setAuth("custom-jwt-here");
```

**Token expiry:** Realtime caches access policies for the connection duration. When the JWT expires, the client is disconnected unless a new token is sent via `supabase.realtime.setAuth()`. The `@supabase/ssr` client handles token refresh automatically via the cookie middleware.

**Private channels:** For channels that should only be accessible to authenticated users, set `config: { private: true }` and disable "Allow public access" in the Realtime settings dashboard. Authorization is then checked against RLS policies on `realtime.messages`.

### 2.5 Presence Channels

Presence tracks which clients are currently connected to a channel. Useful for "Emma is thinking" live indicators or showing agent activity.

```ts
const channel = supabase.channel("agent-activity", {
  config: { presence: { key: userId } },
});

channel.on("presence", { event: "sync" }, () => {
  const state = channel.presenceState();
  console.log("Current presence:", state);
});

await channel.subscribe();
await channel.track({ user: userId, activity: "processing" });

// Later when done:
await channel.untrack();
```

**Events:** `sync` (full refresh), `join` (someone joined), `leave` (someone left). During a `sync` you may receive join/leave simultaneously — this is state reconciliation, not actual user movement.

**Use Presence for:** online indicators, "Emma is processing task X" banners, active tab detection.

**Do not use Presence for** high-frequency updates (cursor positions, keystroke-level telemetry) — use Broadcast instead for those.

### 2.6 Broadcast — Server-to-Client Without DB Changes

Broadcast lets a server route send a message directly to all connected clients on a channel, without any database write. This is the key primitive for delivering HITL approval requests to an open tab.

**Server (API route / cron):**

```ts
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // service role for server-side broadcast
);

await supabase.channel(`user-${userId}`).send({
  type: "broadcast",
  event: "approval_request",
  payload: {
    taskId: "abc-123",
    description: "Delete 47 files from /uploads",
    requestedAt: new Date().toISOString(),
  },
});
```

**Client (client component):**

```ts
const channel = supabase
  .channel(`user-${userId}`)
  .on("broadcast", { event: "approval_request" }, ({ payload }) => {
    showApprovalModal(payload);
  })
  .subscribe();
```

**Important details:**

- Sending before subscribing uses HTTP; sending after subscribing uses WebSocket. Server-side broadcast always uses HTTP.
- Channel names must match exactly between sender and receiver.
- Broadcast does not persist messages — if the client is not connected when the message is sent, it is lost. For HITL approvals, fall back to polling or Postgres Changes on an `approval_requests` table if the user is not connected.
- Private broadcast channels require RLS on `realtime.messages`. Public channels (default) allow anyone knowing the channel name to receive.
- As of `@supabase/supabase-js` v2.37.0+, a Replay feature allows retrieving historical broadcast messages from `realtime.messages` using epoch timestamps — useful as a catch-up mechanism on reconnect.

---

## Part 3 — Recommended Architecture for Emma

### Which Mechanism for Which Use Case

| Use Case                                                 | Mechanism                            | Reasoning                                                                                                                                                                       |
| -------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Live task status while tab is open                       | Supabase Realtime (Postgres Changes) | Tab is open, user is authenticated, updates come from DB writes already happening server-side. Zero extra infrastructure.                                                       |
| "Emma is processing" indicator                           | Supabase Realtime (Presence)         | Server tracks/untracks on the channel. Lightweight, accurate.                                                                                                                   |
| HITL approval request, tab open                          | Supabase Realtime (Broadcast)        | Server broadcasts to user channel; client shows modal immediately. No DB write required.                                                                                        |
| HITL approval request, tab closed                        | Web Push API                         | Only mechanism that reaches the user when the browser tab is not open or the app is backgrounded.                                                                               |
| HITL approval request, tab open but no active SSE stream | Supabase Realtime (Broadcast)        | The Realtime WebSocket connection is persistent and independent of SSE streaming. As long as the tab is open, the channel is live regardless of whether a request is in-flight. |

### Handling the "Tab Open, Not Streaming" Case

Emma's current SSE stream (`/api/emma`) only exists during an active user message. Between messages, there is no delivery channel. The solution is to keep a Realtime channel open for the lifetime of the tab — this is independent of SSE.

The Realtime WebSocket connects when the component mounts and stays connected until the component unmounts or the tab closes. Unlike SSE, it does not require a request-in-flight to receive messages. This makes it the right channel for background delivery to an open tab.

### Suggested Layered Strategy

1. **Always open a Realtime channel** in the main app shell (`src/app/app/page.tsx` or a wrapping layout) on mount. Subscribe to:
   - `postgres_changes` on `tasks` filtered by `user_id` — updates the task list in real time.
   - `broadcast` on `user-${userId}` — receives HITL approval requests from background cron/agent.

2. **On background cron generating HITL approval:**
   - Broadcast to `user-${userId}` channel (instant delivery if tab open).
   - Also write an `approval_requests` row to the DB (durable record for when the tab is closed or on reconnect via Replay).
   - If the user is not connected within N minutes, send a Web Push notification.

3. **Web Push as fallback** for when the tab is closed:
   - Store `PushSubscription` in a `push_subscriptions` table.
   - Cron job: after writing the approval request, check if a push subscription exists and call `webpush.sendNotification()`.
   - The push notification payload includes a deep link back to the `/app` page with the `taskId` as a query param so Emma can surface the approval modal on load.

4. **No SSE keep-alive needed** — the Realtime WebSocket covers persistent in-session delivery without any modifications to the existing SSE streaming architecture.

### Implementation Order (for when you are ready to build)

1. Supabase Realtime for `tasks` table — smallest surface area, immediate value, no new infrastructure beyond a SQL publication toggle.
2. Broadcast for HITL approval delivery to open tabs — adds one channel subscription and one server-side `send()` call in the cron/agent route.
3. `approval_requests` DB table as durable store — makes approvals resilient to closed tabs and provides Replay catch-up.
4. Web Push for closed-tab delivery — requires SW registration, VAPID key generation, and a new `push_subscriptions` DB table. Most complex but covers the full lifecycle.

---

## References

- [Supabase Realtime Overview](https://supabase.com/docs/guides/realtime)
- [Supabase Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes)
- [Supabase Realtime Authorization](https://supabase.com/docs/guides/realtime/authorization)
- [Supabase createBrowserClient (SSR)](https://supabase.com/docs/guides/auth/server-side/creating-a-client)
- [Next.js PWA Guide (official)](https://nextjs.org/docs/app/guides/progressive-web-apps)
- [MDN Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API)
- [MDN Push API Best Practices](https://developer.mozilla.org/en-US/docs/Web/API/Push_API/Best_Practices)
- [web.dev: Push Notifications Overview](https://web.dev/articles/push-notifications-overview)
- [web.dev: Subscribing a User to Push](https://web.dev/articles/push-notifications-subscribing-a-user)
- [iOS PWA limitations 2026 (MagicBell)](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide)
- [iOS special requirements for Web Push (Pushpad)](https://pushpad.xyz/blog/ios-special-requirements-for-web-push-notifications)
- [iOS 17.4 DMA PWA removal and reversal (9to5Mac)](https://9to5mac.com/2024/02/08/ios-17-4-web-app-eu/)
