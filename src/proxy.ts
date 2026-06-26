import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { SUPABASE_AUTH_ENV, validateEnvironment } from "@/core/env-validation";
import { NextResponse, type NextRequest } from "next/server";

const publicPaths = [
  "/login",
  "/register",
  "/auth/callback",
  "/landing",
  "/privacy",
  "/terms",
  "/support",
  "/beta",
  "/billing-faq",
  "/known-limitations",
  "/api/waitlist",
  "/api/emma/webhook",
  "/waitlist",
  "/api/emma/unsubscribe",
] as const;

let developmentAuthWarningLogged = false;

function isExplicitlyPublicPath(pathname: string): boolean {
  return publicPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export async function proxy(request: NextRequest) {
  // MCP is not a user-facing surface while the server-side feature is off.
  // Keep this before the local-dev auth bypass so the route is gated everywhere.
  if (
    request.nextUrl.pathname.startsWith("/settings/mcp") &&
    process.env.ENABLE_MCP_TOOLS !== "true"
  ) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/settings/more";
    return NextResponse.redirect(redirectUrl);
  }

  let response = NextResponse.next({ request: { headers: request.headers } });
  const isPublic = isExplicitlyPublicPath(request.nextUrl.pathname);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const authConfig = validateEnvironment(process.env, SUPABASE_AUTH_ENV);

  if (!authConfig.valid) {
    if (process.env.NODE_ENV === "production") {
      if (isPublic) return response;
      return new NextResponse("Server authentication is not configured correctly.", {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      });
    }

    if (!developmentAuthWarningLogged) {
      console.warn(
        "[Auth] Supabase is not configured correctly; authentication is disabled outside production."
      );
      developmentAuthWarningLogged = true;
    }
    return response;
  }

  const supabase = createServerClient(url!, key!, {
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
  // API routes — auth checked inside each route
  const isApi = request.nextUrl.pathname.startsWith("/api/");

  if (!user && !isPublic && !isApi) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    return NextResponse.redirect(redirectUrl);
  }

  // ── Waitlist gate ────────────────────────────────────────────────────────
  const adminEmails = (process.env.EMMA_ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const isAdmin = user
    ? adminEmails.length > 0 && adminEmails.includes(user.email?.toLowerCase() ?? "")
    : false;
  const approved = user?.app_metadata?.waitlist_approved === true;
  const isWaitlisted = !!user && !isAdmin && !approved;

  if (isWaitlisted && !isPublic && !isApi) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/waitlist";
    return NextResponse.redirect(redirectUrl);
  }
  // ────────────────────────────────────────────────────────────────────────

  // Authenticated user hitting public UI routes → redirect to app (or /waitlist if unapproved)
  const isPublicUiRoute =
    request.nextUrl.pathname === "/login" ||
    request.nextUrl.pathname === "/" ||
    request.nextUrl.pathname === "/landing" ||
    request.nextUrl.pathname === "/register";

  if (user && isPublicUiRoute) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = isWaitlisted ? "/waitlist" : "/app";
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
