import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { topics } from "@/lib/db/schema";
import { createTopicSchema } from "@/lib/validation/topics";
import { isUniqueViolation } from "@/lib/db/errors";

export async function GET(request: Request) {
  const courseId = new URL(request.url).searchParams.get("courseId");
  const query = db.select().from(topics);
  const rows = courseId ? await query.where(eq(topics.courseId, courseId)) : await query;
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = createTopicSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "invalid_body", message: parsed.error.message } },
      { status: 400 },
    );
  }

  try {
    const [created] = await db.insert(topics).values(parsed.data).returning();
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json(
        {
          error: {
            code: "duplicate_topic",
            message: `Topic "${parsed.data.name}" already exists in this course.`,
          },
        },
        { status: 409 },
      );
    }
    throw error;
  }
}
