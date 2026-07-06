import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { feynmanSubmissions } from "@/lib/db/schema";
import { createFeynmanSubmissionSchema } from "@/lib/validation/feynman";
import { logEvent } from "@/lib/logging";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = createFeynmanSubmissionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "invalid_body", message: parsed.error.message } },
      { status: 422 },
    );
  }

  const [created] = await db
    .insert(feynmanSubmissions)
    .values({
      topicId: parsed.data.topicId,
      explanation: parsed.data.explanation,
      status: "submitted",
    })
    .returning();
  logEvent({
    boundary: "db",
    message: "feynman submission created",
    operation: "insert",
    table: "feynman_submissions",
    submission_id: created?.id,
    topic_id: created?.topicId,
    status: created?.status,
  });

  return NextResponse.json(created, { status: 201 });
}
