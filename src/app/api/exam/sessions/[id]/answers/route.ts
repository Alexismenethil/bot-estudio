import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { answerExamQuestion, ExamSessionError } from "@/lib/session/exam";
import { examAnswerSchema } from "@/lib/validation/exam";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = examAnswerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "invalid_body", message: parsed.error.message } },
      { status: 400 },
    );
  }

  try {
    const answer = await answerExamQuestion(db, {
      sessionId: id,
      ...parsed.data,
    });
    return NextResponse.json(answer, { status: 201 });
  } catch (error) {
    if (error instanceof ExamSessionError) {
      const status = error.code === "expired" || error.code === "question_not_in_session" ? 409 : 404;
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status },
      );
    }
    throw error;
  }
}
