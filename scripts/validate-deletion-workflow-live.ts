/**
 * Phase 3.1 live validation — exercises the deletion workflow against the
 * real, linked Emma Supabase project instead of mocks. One-off runbook, not
 * covered by `npm test`. Creates and deletes its own disposable auth user;
 * never touches real user data.
 *
 * NOTE ON SCOPE: this project's live schema is missing the user_id column
 * (or the table) for 4 of the Registry's 32 tables — document_chunks,
 * personas, push_subscriptions, proactive_daily — the same gap the Phase
 * 2.1 Technical Design Document already disclosed ("could not be exercised
 * on that particular project... those tables' definitions exist only in
 * schema.sql, never as standalone migrations"). That means the real
 * deleteUserOwnedData() RPC call inside deleting_database cannot succeed on
 * THIS environment today, and this script does not work around it by
 * touching the live schema or the Registry's table list — see the Phase
 * 3.1 Live Production Validation Report for the full writeup. What this
 * script validates instead: everything that does not require
 * deleting_database to succeed — real PostgREST filter/insert/update
 * behavior, real optimistic-concurrency (Task 1's fix) under genuine
 * network interleaving, real retry-to-permanent-failure escalation, real
 * checkpoint persistence up to the point of failure, and real RLS
 * enforcement.
 *
 * Run: npx tsx --env-file=.env.local scripts/validate-deletion-workflow-live.ts
 */
import { createClient } from "@supabase/supabase-js";
import {
  runDeletionWorkflow,
  findActiveDeletionRequest,
} from "../src/core/account-deletion/workflow";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set");
  process.exit(1);
}

const admin = createClient(url, key);

type Result = { name: string; pass: boolean; detail: string };
const results: Result[] = [];

function record(name: string, pass: boolean, detail: string) {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} — ${name}: ${detail}`);
}

async function main() {
  const email = `phase31-validation-${Date.now()}@example.invalid`;
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
  });
  if (createErr || !created.user) {
    console.error("Could not create disposable auth user:", createErr?.message);
    process.exit(1);
  }
  const userId = created.user.id;
  console.log(`Disposable auth user: ${userId}`);

  try {
    // 1. Fresh create — findActiveDeletionRequest() returns null pre-creation.
    // Proves the real .not("status","in","(completed,cancelled)") PostgREST
    // filter syntax works as intended (this was explicitly unverified per
    // the Phase 3 Production Readiness Report).
    const beforeCreate = await findActiveDeletionRequest(admin, userId);
    record(
      "PostgREST .not() filter: no active row before first call",
      beforeCreate === null,
      JSON.stringify(beforeCreate)
    );

    // 2. Retry-to-permanent-failure — this environment's known gap
    // (document_chunks.user_id missing — see header) means deleting_database
    // reliably fails, which is itself a real, live exercise of the
    // retry_pending -> retry_pending -> retry_pending -> failed escalation
    // this phase's retry logic is supposed to guarantee (MAX_RETRY_COUNT=3).
    // This was previously verified only against mocks.
    let last = await runDeletionWorkflow(admin, userId);
    let calls = 1;
    while (last.status === "retry_pending" && calls < 6) {
      last = await runDeletionWorkflow(admin, userId);
      calls++;
    }
    record(
      "retry escalation: reaches 'failed' after MAX_RETRY_COUNT, not stuck or silently restarted",
      last.status === "failed",
      `finalStatus=${last.status} callsUntilTerminal=${calls}`
    );

    // 3. Checkpoint persistence up to the point of failure is real and
    // readable back — proves the checkpoint jsonb column round-trips
    // correctly through real PostgREST, not just the mocked test harness.
    const { data: failedRow } = await admin
      .from("deletion_requests")
      .select("status,checkpoint,retry_count")
      .eq("id", last.requestId)
      .single();
    const checkpointLen = Array.isArray(failedRow?.checkpoint) ? failedRow.checkpoint.length : 0;
    const dbFailureEntry = (failedRow?.checkpoint ?? []).find(
      (e: { phase?: string; resourceId?: string }) =>
        e.phase === "deleting_database" && e.resourceId === "db.batch"
    );
    record(
      "checkpoint persisted and readable back, including the real RPC error",
      failedRow?.status === "failed" && checkpointLen > 0 && !!dbFailureEntry?.error,
      `status=${failedRow?.status} checkpointLen=${checkpointLen} retry_count=${failedRow?.retry_count} dbError=${dbFailureEntry?.error}`
    );

    // 4. A second call for this user after 'failed' does NOT silently
    // restart the workflow (the specific bug fixed in Phase 3's c4292ea /
    // f3d675d) — proves that fix live, not just in mocks.
    const afterFailed = await runDeletionWorkflow(admin, userId);
    record(
      "a permanently-failed row is not silently restarted on the next call",
      afterFailed.status === "failed" && afterFailed.requestId === last.requestId,
      `status=${afterFailed.status} sameRow=${afterFailed.requestId === last.requestId}`
    );

    // 5. Concurrent request — the real target of Task 1's fix. Two genuinely
    // concurrent calls over the real network, for a *different* user with no
    // existing row, must not both invoke the RPC / must not both drive the
    // same row to completion independently.
    const concurrentEmail = `phase31-concurrent-${Date.now()}@example.invalid`;
    const { data: concurrentUser, error: concurrentCreateErr } = await admin.auth.admin.createUser({
      email: concurrentEmail,
      email_confirm: true,
    });
    if (concurrentCreateErr || !concurrentUser.user) {
      record(
        "concurrent requests setup",
        false,
        `could not create second disposable user: ${concurrentCreateErr?.message}`
      );
    } else {
      const concurrentUserId = concurrentUser.user.id;
      try {
        const [c1, c2] = await Promise.all([
          runDeletionWorkflow(admin, concurrentUserId),
          runDeletionWorkflow(admin, concurrentUserId),
        ]);
        const { data: rowsAfter } = await admin
          .from("deletion_requests")
          .select("id,status")
          .eq("user_id", concurrentUserId);
        record(
          "concurrent requests: exactly one row, both calls resolve without throwing (real network, not mocked jitter)",
          (rowsAfter?.length ?? 0) === 1,
          `rows=${rowsAfter?.length} c1.status=${c1.status} c2.status=${c2.status}`
        );
      } finally {
        await admin.auth.admin.deleteUser(concurrentUserId);
      }
    }

    // 6. Permission model / RLS — an anon client must not be able to write
    // deletion_requests at all. Chain .select() so a silently-filtered
    // zero-row RLS result (no error, no data) is distinguished from an
    // actual unauthorized write (no error, data present).
    const anonKeyEnv = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (anonKeyEnv) {
      const anon = createClient(url!, anonKeyEnv);
      const { data: anonWriteData, error: anonWriteErr } = await anon
        .from("deletion_requests")
        .update({ status: "cancelled" })
        .eq("user_id", userId)
        .select("id");
      const actuallyWrote =
        !anonWriteErr && Array.isArray(anonWriteData) && anonWriteData.length > 0;
      record(
        "RLS: anon client cannot write deletion_requests (no policy = 0 rows affected, not an error, and not a write)",
        !actuallyWrote,
        `error=${anonWriteErr?.message ?? "none"} rowsReturned=${anonWriteData?.length ?? 0}`
      );

      // And the flip side: anon CAN read only their own row's absence (no
      // session bound to this disposable user, so this proves anon reads
      // are scoped by auth.uid(), not open).
      const { data: anonReadData } = await anon
        .from("deletion_requests")
        .select("id")
        .eq("user_id", userId);
      record(
        "RLS: anon client (no session) cannot read this user's deletion_requests row",
        (anonReadData?.length ?? 0) === 0,
        `rowsReturned=${anonReadData?.length ?? 0}`
      );
    } else {
      record(
        "RLS: anon client checks",
        false,
        "NEXT_PUBLIC_SUPABASE_ANON_KEY not set — skipped, not verified"
      );
    }
  } finally {
    await admin.auth.admin.deleteUser(userId);
    console.log(`Cleaned up disposable auth user: ${userId}`);
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length > 0) {
    console.log("FAILURES:", failed.map((f) => f.name).join(", "));
  }
}

main();
