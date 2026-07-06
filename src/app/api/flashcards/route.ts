import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { flashcards } from "@/lib/db/schema";
import { createFlashcardSchema } from "@/lib/validation/flashcards";
import { logEvent } from "@/lib/logging";

export async function GET(request: Request) {
  const topicId = new URL(request.url).searchParams.get("topicId");
  const query = db.select().from(flashcards);
  const rows = topicId ? await query.where(eq(flashcards.topicId, topicId)) : await query;
  return NextResponse.json({ flashcards: rows });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = createFlashcardSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "invalid_body", message: parsed.error.message } },
      { status: 400 },
    );
  }

  const [created] = await db.insert(flashcards).values(parsed.data).returning();
  logEvent({
    boundary: "db",
    message: "flashcard created",
    operation: "insert",
    table: "flashcards",
    flashcard_id: created?.id,
    topic_id: created?.topicId,
  });
  return NextResponse.json(created, { status: 201 });
}
