import { NextResponse } from "next/server";
import {
  buildAdminDiagnostics,
  containsUnsafeDiagnosticData,
  isAdminEmail,
  resolveDiagnosticsLookup,
} from "@/core/admin-diagnostics";
import { getUser } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Read-only founder support diagnostics.
 *
 * GET /api/admin/diagnostics?email=...
 * GET /api/admin/diagnostics?userId=...
 * GET /api/admin/diagnostics?clientId=...
 */
export async function GET(req: Request) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized", hint: "Sign in at /login" },
        { status: 401 }
      );
    }
    if (!isAdminEmail(user.email)) {
      return NextResponse.json({ error: "Forbidden", hint: "Admin only" }, { status: 403 });
    }

    let lookup;
    try {
      lookup = resolveDiagnosticsLookup(new URL(req.url).searchParams);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Invalid diagnostics lookup" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        {
          error: "Database not configured",
          hint: "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local",
        },
        { status: 501 }
      );
    }

    const diagnostics = await buildAdminDiagnostics(supabase, lookup);
    if (containsUnsafeDiagnosticData(diagnostics)) {
      return NextResponse.json({ error: "Diagnostics contained unsafe data" }, { status: 500 });
    }

    return NextResponse.json(diagnostics);
  } catch (err) {
    console.error("[/api/admin/diagnostics]", err);
    return NextResponse.json({ error: "Failed to load admin diagnostics" }, { status: 500 });
  }
}
