import { NextResponse } from "next/server";

const NOT_AVAILABLE = { error: "File upload unavailable — migrated to inline attachments" };

export async function POST() {
  return NextResponse.json(NOT_AVAILABLE, { status: 503 });
}

export async function GET() {
  return NextResponse.json(NOT_AVAILABLE, { status: 503 });
}
