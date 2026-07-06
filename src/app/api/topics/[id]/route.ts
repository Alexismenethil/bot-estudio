import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { topics } from "@/lib/db/schema";
import { updateTopicSchema } from "@/lib/validation/topics";
import { isUniqueViolation } from "@/lib/db/errors";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = updateTopicSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "invalid_body", message: parsed.error.message } },
      { status: 400 },
    );
  }

  try {
    const [updated] = await db.update(topics).set(parsed.data).where(eq(topics.id, id)).returning();
    if (!updated) {
      return NextResponse.json(
        { error: { code: "not_found", message: "Topic not found." } },
        { status: 404 },
      );
    }
    return NextResponse.json(updated);
  } catch (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json(
        {
          error: {
            code: "duplicate_topic",
            message: "A topic with that name already exists in this course.",
          },
        },
        { status: 409 },
      );
    }
    throw error;
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  await db.delete(topics).where(eq(topics.id, id));
  return new NextResponse(null, { status: 204 });
}
