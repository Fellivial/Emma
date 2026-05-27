import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");

  if (code) {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const admin = getAdminClient();

        // ── Waitlist gate ────────────────────────────────────────────
        if (admin && user.email) {
          const approved = user.app_metadata?.waitlist_approved === true;
          if (!approved) {
            const { data: entry } = await admin
              .from("waitlist_v2")
              .select("status, invite_expires_at")
              .eq("email", user.email.toLowerCase())
              .single();

            const inviteValid =
              entry?.status === "invited" &&
              entry.invite_expires_at &&
              new Date(entry.invite_expires_at) > new Date();

            const isApproved = entry?.status === "converted" || inviteValid;

            if (!isApproved) {
              await supabase.auth.signOut();
              return NextResponse.redirect(`${origin}/waitlist?blocked=1`);
            }

            // Convert invited → converted on first sign-in
            if (inviteValid) {
              await admin
                .from("waitlist_v2")
                .update({ status: "converted" })
                .eq("email", user.email)
                .eq("status", "invited")
                .gt("invite_expires_at", new Date().toISOString());
            }

            // Stamp the flag so future sessions skip this check
            await admin.auth.admin.updateUserById(user.id, {
              app_metadata: { waitlist_approved: true },
            });
          }
        }
        // ────────────────────────────────────────────────────────────

        // Route new users through onboarding
        const { data: profile } = await supabase
          .from("profiles")
          .select("onboarded")
          .eq("id", user.id)
          .single();

        if (profile && !profile.onboarded) {
          return NextResponse.redirect(`${origin}/onboarding`);
        }
      }

      return NextResponse.redirect(`${origin}/app`);
    }
  }

  // Error — redirect to login
  return NextResponse.redirect(`${origin}/login`);
}
