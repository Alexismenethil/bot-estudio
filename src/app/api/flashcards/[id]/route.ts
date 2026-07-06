import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { flashcards } from "@/lib/db/schema";
import { updateFlashcardSchema } from "@/lib/validation/flashcards";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = updateFlashcardSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "invalid_body", message: parsed.error.message } },
      { status: 400 },
    );
  }

  const [updated] = await db.update(flashcards).set(parsed.data).where(eq(flashcards.id, id)).returning();
  if (!updated) {
    return NextResponse.json(
      { error: { code: "not_found", message: "Flashcard not found." } },
      { status: 404 },
    );
  }
  return NextResponse.json(updated);
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  await db.delete(flashcards).where(eq(flashcards.id, id));
  return new NextResponse(null, { status: 204 });
}
