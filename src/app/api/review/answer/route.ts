import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { bankQuestions, flashcards, reviewLogs } from "@/lib/db/schema";
import { sm2Next, type ReviewState } from "@/lib/engine/sm2";
import { reviewAnswerSchema } from "@/lib/validation/review";

type ReviewItem = {
  id: string;
  nextReviewAt: string;
  intervalDays: number;
  easeFactor: number;
  repetitions: number;
};

function toReviewState(item: ReviewItem): ReviewState {
  return {
    nextReviewAt: item.nextReviewAt,
    intervalDays: item.intervalDays,
    easeFactor: item.easeFactor,
    repetitions: item.repetitions,
  };
}

async function findItem(itemType: "flashcard" | "bank_question", itemId: string): Promise<ReviewItem | undefined> {
  if (itemType === "flashcard") {
    const [item] = await db.select().from(flashcards).where(eq(flashcards.id, itemId));
    return item;
  }
  const [item] = await db.select().from(bankQuestions).where(eq(bankQuestions.id, itemId));
  return item;
}

async function updateItem(
  itemType: "flashcard" | "bank_question",
  itemId: string,
  state: ReviewState,
  outcome: "correct" | "incorrect" | "hard",
) {
  const values = {
    nextReviewAt: state.nextReviewAt,
    intervalDays: state.intervalDays,
    easeFactor: state.easeFactor,
    repetitions: state.repetitions,
    lastOutcome: outcome,
  };

  if (itemType === "flashcard") {
    await db.update(flashcards).set(values).where(eq(flashcards.id, itemId));
    return;
  }
  await db.update(bankQuestions).set(values).where(eq(bankQuestions.id, itemId));
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = reviewAnswerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "invalid_body", message: parsed.error.message } },
      { status: 400 },
    );
  }

  const { itemType, itemId, outcome, context, today } = parsed.data;
  const item = await findItem(itemType, itemId);
  if (!item) {
    return NextResponse.json(
      { error: { code: "not_found", message: "Review item not found." } },
      { status: 404 },
    );
  }

  const prevState = toReviewState(item);
  const result = sm2Next(prevState, outcome, context, today);

  if (result.scheduleChanged) {
    await updateItem(itemType, itemId, result.state, outcome);
  }

  await db.insert(reviewLogs).values({
    itemType,
    itemId,
    context,
    outcome,
    scheduleChanged: result.scheduleChanged,
    prevState,
    newState: result.state,
  });

  return NextResponse.json(result);
}
