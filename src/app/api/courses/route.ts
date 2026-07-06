import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { courses } from "@/lib/db/schema";
import { createCourseSchema } from "@/lib/validation/courses";
import { isUniqueViolation } from "@/lib/db/errors";

// NOTE: due-count rollups (FR-014) join against flashcards/bank_questions,
// which don't exist until Phase 4 (US2). Deferred until then.
export async function GET() {
  const rows = await db.select().from(courses);
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = createCourseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "invalid_body", message: parsed.error.message } },
      { status: 400 },
    );
  }

  try {
    const [created] = await db.insert(courses).values(parsed.data).returning();
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json(
        {
          error: {
            code: "duplicate_code",
            message: `Course code "${parsed.data.code}" already exists.`,
          },
        },
        { status: 409 },
      );
    }
    throw error;
  }
}
