import { NextResponse } from "next/server";

const NOT_AVAILABLE = { error: "Files API unavailable — migrated to inline attachments" };

export async function GET() {
  return NextResponse.json(NOT_AVAILABLE, { status: 503 });
}

export async function DELETE() {
  return NextResponse.json(NOT_AVAILABLE, { status: 503 });
}
