import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { answerTrainerQuestion, TrainerSessionError } from "@/lib/session/trainer";
import { trainerAnswerSchema } from "@/lib/validation/trainer";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = trainerAnswerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "invalid_body", message: parsed.error.message } },
      { status: 400 },
    );
  }

  try {
    const result = await answerTrainerQuestion(db, {
      sessionId: id,
      ...parsed.data,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof TrainerSessionError) {
      const status = error.code === "question_not_in_session" ? 409 : 404;
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status },
      );
    }
    throw error;
  }
}
