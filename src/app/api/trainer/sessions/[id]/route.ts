import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getTrainerSession } from "@/lib/session/trainer";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  const session = await getTrainerSession(db, id);
  if (!session) {
    return NextResponse.json(
      { error: { code: "not_found", message: "Trainer session not found." } },
      { status: 404 },
    );
  }
  return NextResponse.json(session);
}
