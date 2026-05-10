import { NextRequest, NextResponse } from "next/server";
import { encrypt } from "@/core/security/encryption";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const token = typeof body?.token === "string" ? body.token.trim() : "";

    if (!token) {
      return NextResponse.json({ error: "token is required" }, { status: 400 });
    }
    if (token.length > 4096) {
      return NextResponse.json({ error: "token too long" }, { status: 400 });
    }

    const encrypted = encrypt(token);
    return NextResponse.json({ encrypted });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
