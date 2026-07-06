import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bankQuestions } from "@/lib/db/schema";
import { createBankQuestionSchema } from "@/lib/validation/bank-questions";
import { logEvent } from "@/lib/logging";

export async function GET(request: Request) {
  const topicId = new URL(request.url).searchParams.get("topicId");
  const query = db.select().from(bankQuestions);
  const rows = topicId ? await query.where(eq(bankQuestions.topicId, topicId)) : await query;
  return NextResponse.json({ bankQuestions: rows });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = createBankQuestionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "invalid_body", message: parsed.error.message } },
      { status: 400 },
    );
  }

  const [created] = await db.insert(bankQuestions).values(parsed.data).returning();
  logEvent({
    boundary: "db",
    message: "bank question created",
    operation: "insert",
    table: "bank_questions",
    question_id: created?.id,
    topic_id: created?.topicId,
  });
  return NextResponse.json(created, { status: 201 });
}
