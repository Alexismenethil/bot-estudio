import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { feynmanSubmissions } from "@/lib/db/schema";
import { retrieveTopicChunks } from "@/lib/rag/retrieve";
import { retrieveFeynmanSchema } from "@/lib/validation/feynman";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = retrieveFeynmanSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "invalid_body", message: parsed.error.message } },
      { status: 400 },
    );
  }

  const [submission] = await db
    .select()
    .from(feynmanSubmissions)
    .where(eq(feynmanSubmissions.id, parsed.data.submissionId));

  if (!submission) {
    return NextResponse.json(
      { error: { code: "not_found", message: "Feynman submission not found." } },
      { status: 404 },
    );
  }

  const chunks = await retrieveTopicChunks(submission.topicId, submission.explanation);
  return NextResponse.json({ chunks });
}
