# Waitlist Access Control — Gap Analysis

**Date:** 2026-05-27  
**Branch to implement on:** `fix/waitlist-access-hardening`

---

## How the current flow is supposed to work

1. User fills out `/waitlist` → API inserts into `waitlist_v2`
2. **Spots available** → `status: "converted"`, Supabase magic link emailed immediately, user can log in
3. **No spots** → `status: "waiting"`, confirmation email only, no login link
4. **Admin invites** via admin panel → `status: "invited"`, magic link emailed (48 h expiry)
5. User clicks magic link → `/auth/callback` → converts `invited → converted` → `/app`
6. Middleware (`proxy.ts`) gates all protected routes on a valid Supabase session

---

## Gaps

### Gap 1 — Middleware only checks session, not waitlist approval (primary gap)

**File:** `src/proxy.ts`

Any Supabase auth user — regardless of how their account was created — passes the middleware check and reaches `/app`. The `waitlist_v2` status is never consulted on protected routes.

**Fix:** Stamp `app_metadata.waitlist_approved = true` on the Supabase auth user at every approval point (see Gap 4 for which routes), then add a middleware check:

```ts
// In proxy.ts, after getting the user, before the public-path check:
if (user && !isPublic && !isApi) {
  const approved = user.app_metadata?.waitlist_approved === true;
  if (!approved) {
    // Backfill-safe grace condition — remove once all existing users are backfilled
    const supabaseAdmin = createAdminClient();
    const { data: wlEntry } = await supabaseAdmin
      .from("waitlist_v2")
      .select("status")
      .eq("email", user.email)
      .in("status", ["converted", "invited"])
      .single();

    if (!wlEntry) {
      // Not approved — sign out and redirect to waitlist
      redirectUrl.pathname = "/waitlist";
      return NextResponse.redirect(redirectUrl);
    }

    // Backfill the flag so this DB round-trip does not repeat
    await supabaseAdmin.auth.admin.updateUserById(user.id, {
      app_metadata: { waitlist_approved: true },
    });
  }
}
```

> **Backfill note:** The grace condition queries `waitlist_v2` as a fallback for existing approved users who pre-date the flag. Once a backfill script runs against all `waitlist_v2` rows with `status = 'converted'` to stamp `app_metadata.waitlist_approved = true` on the corresponding Supabase auth users, the grace condition can be removed and the middleware becomes a cheap single-field check with no DB round-trip.

> **Cost:** The grace-condition path adds one DB round-trip per protected page load until the flag is stamped on that user. After the first hit, subsequent requests are flag-only. The middleware will need `SUPABASE_SERVICE_ROLE_KEY` available in the edge runtime.

---

### Gap 2 — OAuth login (Google / GitHub) bypasses waitlist

**File:** `src/app/login/page.tsx`, `src/app/auth/callback/route.ts`

Any person can click "Continue with Google" or "Continue with GitHub" at `/login`. Supabase creates a new auth user on first OAuth sign-in. `/auth/callback` converts `invited → converted` for eligible entries but does **not** block users whose email is absent from `waitlist_v2` entirely. They land on `/app`.

**Fix:** In `/auth/callback`, after resolving the user, check waitlist status. If not approved, sign out and redirect:

```ts
// After supabase.auth.getUser() succeeds in /auth/callback/route.ts
if (user && user.email) {
  const approved = user.app_metadata?.waitlist_approved === true;
  if (!approved) {
    const admin = getAdminClient();
    const { data: entry } = await admin
      .from("waitlist_v2")
      .select("status, invite_expires_at")
      .eq("email", user.email)
      .single();

    const isApproved =
      entry?.status === "converted" ||
      (entry?.status === "invited" &&
        entry.invite_expires_at &&
        new Date(entry.invite_expires_at) > new Date());

    if (!isApproved) {
      await supabase.auth.signOut();
      return NextResponse.redirect(`${origin}/waitlist?blocked=1`);
    }

    // Stamp the flag so future sessions skip this check
    await admin.auth.admin.updateUserById(user.id, {
      app_metadata: { waitlist_approved: true },
    });
  }
}
```

---

### Gap 3 — Email OTP at `/login` sends a magic link to any email

**File:** `src/app/login/page.tsx`

`supabase.auth.signInWithOtp({ email })` is called client-side. If Supabase's "Enable email signup" is ON in the dashboard, Supabase creates a new auth user for any address and delivers an OTP. The user clicks the link, `/auth/callback` fires, no waitlist check occurs, and they reach `/app`.

**Fixes (both recommended):**

1. **Server-side:** The `/auth/callback` fix from Gap 2 also closes this vector — non-waitlisted users get signed out immediately after the OTP is exchanged.
2. **Supabase dashboard:** Disable "Enable email signups" (Authentication → Settings → Email). With this off, `signInWithOtp` only works for existing auth users (i.e. those whose account was created via `generateLink` — exactly the approved waitlist users).

---

### Gap 4 — Three approval routes do not set `app_metadata.waitlist_approved`

When implementing Gap 1's fix, all three paths that grant access must stamp the flag, or the grace condition will keep firing indefinitely for every new approval.

| Route                                        | Trigger                            | Needs flag   |
| -------------------------------------------- | ---------------------------------- | ------------ |
| `src/app/api/waitlist/route.ts`              | Spots available → immediate accept | ✅           |
| `src/app/api/emma/waitlist-manage/route.ts`  | Admin invites a waiting user       | ✅           |
| `src/app/api/waitlist/quick-access/route.ts` | Orphaned hero form (see Gap 6)     | ✅ or delete |

In each route, after `supabase.auth.admin.generateLink(...)`, call:

```ts
if (linkData?.user?.id) {
  await supabase.auth.admin.updateUserById(linkData.user.id, {
    app_metadata: { waitlist_approved: true },
  });
}
```

---

### Gap 5 — Expired invites still have a live Supabase auth account

When an admin invites a user, `generateLink` creates the Supabase auth user **immediately** — before they click the link. If the 48 h invite window expires without the user clicking, their auth account still exists. They could request a fresh OTP at `/login` and, with no middleware waitlist check, reach `/app`.

**Fix:** Closed by Gap 1 (middleware) + Gap 2 (`/auth/callback` expiry check already present in the existing `invite_expires_at` guard). No additional changes needed beyond those two.

---

### Gap 6 — `/api/waitlist/quick-access` is orphaned

**File:** `src/app/api/waitlist/quick-access/route.ts`

This route was called exclusively by the hero "Request Access" inline form, which was removed in commit `743bcb8`. The endpoint is still publicly reachable at `POST /api/waitlist/quick-access`. It does not set `app_metadata.waitlist_approved`, so any magic links it issues will hit the grace-condition path until backfilled.

**Options:**

- **Delete** the route (preferred — dead code, the full `/waitlist` form is the intended path).
- **Keep** and add the `app_metadata` stamp alongside the other three approval routes in Gap 4.

---

### Gap 7 — `/register` redirects to a broken anchor

**File:** `src/app/register/page.tsx`

```ts
redirect("/landing#waitlist");
```

The `#waitlist` anchor was removed from the landing page in commit `743bcb8`. The redirect lands the user at the top of `/landing` with no visible effect.

**Fix:** Change to `redirect("/waitlist")`. One-line change, no risk.

---

## Implementation order

1. **Gap 7** — one-line fix, unblocks broken UX immediately, no risk
2. **Gap 4** — stamp `app_metadata.waitlist_approved` in all three approval routes
3. **Gap 2** — add waitlist check + sign-out in `/auth/callback`
4. **Gap 3** — disable email signups in Supabase dashboard
5. **Gap 6** — delete `/api/waitlist/quick-access`
6. **Gap 1** — add middleware check (deploy after Gaps 2 + 4 are live so existing users get their flag stamped before the hard gate lands)
7. **Backfill** — run a script to stamp `app_metadata.waitlist_approved = true` on all Supabase auth users whose email is in `waitlist_v2` with `status = 'converted'`, then remove the grace condition from the middleware
