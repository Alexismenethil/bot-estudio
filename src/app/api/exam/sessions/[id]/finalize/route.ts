import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ExamSessionError, finalizeExamSession } from "@/lib/session/exam";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  try {
    const report = await finalizeExamSession(db, id);
    return NextResponse.json(report);
  } catch (error) {
    if (error instanceof ExamSessionError && error.code === "session_not_found") {
      return NextResponse.json(
        { error: { code: "not_found", message: error.message } },
        { status: 404 },
      );
    }
    throw error;
  }
}
