import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createExamSession, ExamSessionError } from "@/lib/session/exam";
import { createExamSessionSchema } from "@/lib/validation/exam";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = createExamSessionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "invalid_body", message: parsed.error.message } },
      { status: 400 },
    );
  }

  try {
    const created = await createExamSession(db, parsed.data);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (error instanceof ExamSessionError && error.code === "empty_bank") {
      return NextResponse.json(
        { error: { code: "empty_bank", message: error.message } },
        { status: 422 },
      );
    }
    throw error;
  }
}
