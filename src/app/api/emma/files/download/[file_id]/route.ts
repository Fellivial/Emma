import { NextResponse } from "next/server";

const NOT_AVAILABLE = { error: "File download unavailable — migrated to inline attachments" };

export async function GET() {
  return NextResponse.json(NOT_AVAILABLE, { status: 503 });
}
