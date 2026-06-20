import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { SUPABASE_AUTH_ENV, validateEnvironment } from "@/core/env-validation";
import { cookies } from "next/headers";

export type AuthResolution =
  | { status: "authenticated"; user: User }
  | { status: "unauthenticated" }
  | { status: "configuration_error" }
  | { status: "development_bypass" };

export class SupabaseConfigurationError extends Error {
  constructor() {
    super("Server authentication is not configured correctly.");
    this.name = "SupabaseConfigurationError";
  }
}

let developmentAuthWarningLogged = false;

export async function createServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!validateEnvironment(process.env, SUPABASE_AUTH_ENV).valid || !url || !key) return null;

  const cookieStore = await cookies();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {}
      },
    },
  });
}

export async function resolveUser(): Promise<AuthResolution> {
  const authConfig = validateEnvironment(process.env, SUPABASE_AUTH_ENV);
  if (!authConfig.valid) {
    if (process.env.NODE_ENV === "production") return { status: "configuration_error" };
    if (!developmentAuthWarningLogged) {
      console.warn(
        "[Auth] Supabase is not configured correctly; server authentication is disabled outside production."
      );
      developmentAuthWarningLogged = true;
    }
    return { status: "development_bypass" };
  }

  const supabase = await createServerSupabase();
  if (!supabase) {
    return process.env.NODE_ENV === "production"
      ? { status: "configuration_error" }
      : { status: "development_bypass" };
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { status: "authenticated", user } : { status: "unauthenticated" };
}

export async function getUser() {
  const result = await resolveUser();
  return result.status === "authenticated" ? result.user : null;
}

export async function requireUser() {
  const result = await resolveUser();
  if (result.status === "configuration_error") throw new SupabaseConfigurationError();
  if (result.status !== "authenticated") throw new Error("Unauthorized");
  return result.user;
}
