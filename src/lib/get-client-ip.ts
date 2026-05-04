import { NextRequest } from "next/server";

/**
 * Extract the real client IP from a Next.js request.
 * Checks headers in order of trustworthiness:
 *   1. x-real-ip (set by Vercel edge)
 *   2. x-forwarded-for (first entry = original client)
 *   3. Fallback to "unknown"
 */
export function getClientIp(req: NextRequest): string {
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp;

  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }

  return "unknown";
}
