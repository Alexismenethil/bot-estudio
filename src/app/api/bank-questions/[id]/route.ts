import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bankQuestions } from "@/lib/db/schema";
import { updateBankQuestionSchema } from "@/lib/validation/bank-questions";
import { logEvent } from "@/lib/logging";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = updateBankQuestionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "invalid_body", message: parsed.error.message } },
      { status: 400 },
    );
  }

  const [updated] = await db.update(bankQuestions).set(parsed.data).where(eq(bankQuestions.id, id)).returning();
  if (!updated) {
    return NextResponse.json(
      { error: { code: "not_found", message: "Bank question not found." } },
      { status: 404 },
    );
  }
  logEvent({
    boundary: "db",
    message: "bank question updated",
    operation: "update",
    table: "bank_questions",
    question_id: updated.id,
  });
  return NextResponse.json(updated);
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  await db.delete(bankQuestions).where(eq(bankQuestions.id, id));
  logEvent({
    boundary: "db",
    message: "bank question deleted",
    operation: "delete",
    table: "bank_questions",
    question_id: id,
  });
  return new NextResponse(null, { status: 204 });
}
