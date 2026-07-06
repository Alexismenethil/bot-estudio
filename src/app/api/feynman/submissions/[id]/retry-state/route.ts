import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { feynmanSubmissions } from "@/lib/db/schema";
import { retryStateSchema } from "@/lib/validation/feynman";
import { logEvent } from "@/lib/logging";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = retryStateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "invalid_body", message: parsed.error.message } },
      { status: 400 },
    );
  }

  const [submission] = await db
    .select()
    .from(feynmanSubmissions)
    .where(eq(feynmanSubmissions.id, id));

  if (!submission) {
    return NextResponse.json(
      { error: { code: "not_found", message: "Feynman submission not found." } },
      { status: 404 },
    );
  }

  if (submission.status === "evaluated") {
    return NextResponse.json(
      { error: { code: "already_evaluated", message: "Evaluated submissions are terminal." } },
      { status: 409 },
    );
  }

  const [updated] = await db
    .update(feynmanSubmissions)
    .set({
      status: "pending_retry",
      failureClasses: parsed.data.failureClasses,
      updatedAt: new Date(),
    })
    .where(eq(feynmanSubmissions.id, id))
    .returning();
  logEvent({
    boundary: "db",
    level: "warn",
    message: "feynman submission queued for retry",
    operation: "update",
    table: "feynman_submissions",
    submission_id: updated?.id,
    status: updated?.status,
    expected_degradation: true,
    failure_classes: parsed.data.failureClasses,
  });

  return NextResponse.json(updated);
}
