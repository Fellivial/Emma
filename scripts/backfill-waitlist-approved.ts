/**
 * One-shot backfill: stamp app_metadata.waitlist_approved = true on all
 * Supabase auth users whose email is in waitlist_v2 with status = 'converted'.
 *
 * Run once after deploying fix/waitlist-access-hardening, then remove the
 * grace condition from src/proxy.ts (the `if (!approved)` block that queries
 * waitlist_v2).
 *
 * Usage:
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     npx tsx scripts/backfill-waitlist-approved.ts
 *
 * Or load from .env.local first (bash):
 *   set -a && source .env.local && set +a
 *   npx tsx scripts/backfill-waitlist-approved.ts
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function run() {
  console.log("Fetching converted waitlist entries…");

  let offset = 0;
  const PAGE = 1000;
  let totalStamped = 0;
  let totalSkipped = 0;
  let totalFailed = 0;

  // Load all auth users once to avoid N+1 API calls
  console.log("Loading auth users…");
  const allAuthUsers: { id: string; email?: string; app_metadata?: Record<string, unknown> }[] = [];
  let authPage = 1;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page: authPage, perPage: 1000 });
    if (error) {
      console.error("Failed to list auth users:", error.message);
      process.exit(1);
    }
    if (!data?.users?.length) break;
    allAuthUsers.push(...data.users);
    if (data.users.length < 1000) break;
    authPage++;
  }

  const authByEmail = new Map(allAuthUsers.map((u) => [u.email?.toLowerCase() ?? "", u]));
  console.log(`Loaded ${allAuthUsers.length} auth users.\n`);

  // Paginate through all converted waitlist rows
  while (true) {
    const { data: rows, error } = await supabase
      .from("waitlist_v2")
      .select("email")
      .eq("status", "converted")
      .range(offset, offset + PAGE - 1);

    if (error) {
      console.error("Failed to fetch waitlist_v2:", error.message);
      process.exit(1);
    }

    if (!rows || rows.length === 0) break;

    for (const row of rows) {
      const email = (row.email as string).toLowerCase();
      const authUser = authByEmail.get(email);

      if (!authUser) {
        console.log(`  SKIP  ${email} — no auth account (not yet signed in)`);
        totalSkipped++;
        continue;
      }

      if (authUser.app_metadata?.waitlist_approved === true) {
        console.log(`  SKIP  ${email} — already stamped`);
        totalSkipped++;
        continue;
      }

      const { error: updateErr } = await supabase.auth.admin.updateUserById(authUser.id, {
        app_metadata: { waitlist_approved: true },
      });

      if (updateErr) {
        console.error(`  FAIL  ${email} — ${updateErr.message}`);
        totalFailed++;
      } else {
        console.log(`  OK    ${email}`);
        totalStamped++;
      }
    }

    if (rows.length < PAGE) break;
    offset += PAGE;
  }

  console.log("\n── Backfill complete ──────────────────────────────────");
  console.log(`  Stamped:  ${totalStamped}`);
  console.log(`  Skipped:  ${totalSkipped}`);
  console.log(`  Failed:   ${totalFailed}`);

  if (totalFailed > 0) {
    console.log("\nSome users failed — re-run the script to retry.");
    process.exit(1);
  }

  console.log("\nNext step: remove the grace condition from src/proxy.ts.");
  console.log("Delete the inner `if (!approved)` block that queries waitlist_v2,");
  console.log("and replace with a direct redirect:");
  console.log("  if (!isAdmin && !approved) { redirect to /waitlist }");
}

run().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
