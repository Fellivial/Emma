import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  // ── Subdomain routing: {slug}.{NEXT_PUBLIC_SMB_DOMAIN} → /intake/{slug} ───
  const smbDomain = process.env.NEXT_PUBLIC_SMB_DOMAIN;
  if (smbDomain) {
    const host = request.headers.get("host") ?? "";
    const smbSuffix = `.${smbDomain}`;
    if (host.endsWith(smbSuffix)) {
      const slug = host.slice(0, host.length - smbSuffix.length);
      if (slug && !slug.includes(".")) {
        const rewriteUrl = request.nextUrl.clone();
        rewriteUrl.pathname = `/intake/${slug}${request.nextUrl.pathname === "/" ? "" : request.nextUrl.pathname}`;
        return NextResponse.rewrite(rewriteUrl);
      }
    }
  }

  let response = NextResponse.next({ request: { headers: request.headers } });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Skip auth if Supabase not configured (dev mode)
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      get(name: string) {
        return request.cookies.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        request.cookies.set({ name, value, ...options });
        response = NextResponse.next({ request: { headers: request.headers } });
        response.cookies.set({ name, value, ...options });
      },
      remove(name: string, options: CookieOptions) {
        request.cookies.set({ name, value: "", ...options });
        response = NextResponse.next({ request: { headers: request.headers } });
        response.cookies.set({ name, value: "", ...options });
      },
    },
  });

  // Refresh session
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Public routes — no auth required
  const publicPaths = [
    "/login",
    "/register",
    "/auth/callback",
    "/landing",
    "/api/waitlist",
    "/api/emma/webhook",
    "/waitlist",
    "/api/emma/unsubscribe",
    "/intake/",
  ];
  const isPublic = publicPaths.some((p) => request.nextUrl.pathname.startsWith(p));

  // API routes — auth checked inside each route
  const isApi = request.nextUrl.pathname.startsWith("/api/");

  if (!user && !isPublic && !isApi) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    return NextResponse.redirect(redirectUrl);
  }

  // ── Waitlist gate ────────────────────────────────────────────────────────
  if (user && !isPublic && !isApi) {
    const adminEmails = (process.env.EMMA_ADMIN_EMAILS || "")
      .split(",")
      .map((e) => e.trim().toLowerCase());
    const isAdmin = adminEmails.includes(user.email?.toLowerCase() ?? "");

    if (!isAdmin) {
      const approved = user.app_metadata?.waitlist_approved === true;
      if (!approved) {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (supabaseUrl && serviceKey) {
          const adminClient = createClient(supabaseUrl, serviceKey);
          const { data: wlEntry } = await adminClient
            .from("waitlist_v2")
            .select("status")
            .eq("email", user.email)
            .in("status", ["converted", "invited"])
            .single();

          if (!wlEntry) {
            const redirectUrl = request.nextUrl.clone();
            redirectUrl.pathname = "/waitlist";
            return NextResponse.redirect(redirectUrl);
          }

          // Backfill the flag so this DB round-trip does not repeat
          await adminClient.auth.admin.updateUserById(user.id, {
            app_metadata: { waitlist_approved: true },
          });
        }
      }
    }
  }
  // ────────────────────────────────────────────────────────────────────────

  // Authenticated user hitting public UI routes → redirect to app
  const isPublicUiRoute =
    request.nextUrl.pathname === "/login" ||
    request.nextUrl.pathname === "/" ||
    request.nextUrl.pathname === "/landing" ||
    request.nextUrl.pathname === "/register";

  if (user && isPublicUiRoute) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/app";
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

export const config = {
  matcher: [
    // Match all routes except static files and Next.js internals
    "/((?!_next/static|_next/image|favicon.ico|live2d|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
