import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { assistantMessages, assistantThreads } from "@/lib/db/schema";
import { createMessageSchema } from "@/lib/validation/messages";

type RouteContext = { params: Promise<{ id: string }> };

async function findOrCreateThread(documentId: string) {
  const [existing] = await db
    .select()
    .from(assistantThreads)
    .where(eq(assistantThreads.documentId, documentId));
  if (existing) {
    return existing;
  }
  const [created] = await db.insert(assistantThreads).values({ documentId }).returning();
  return created!;
}

export async function GET(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  const [thread] = await db.select().from(assistantThreads).where(eq(assistantThreads.documentId, id));

  if (!thread) {
    return NextResponse.json({ messages: [] });
  }

  const messages = await db
    .select()
    .from(assistantMessages)
    .where(eq(assistantMessages.threadId, thread.id))
    .orderBy(asc(assistantMessages.createdAt));

  return NextResponse.json({ messages });
}

// One thread per document (data-model.md); the thread is created lazily on
// the first message so no separate "create thread" endpoint is needed.
export async function POST(request: Request, { params }: RouteContext) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = createMessageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "invalid_body", message: parsed.error.message } },
      { status: 400 },
    );
  }

  const thread = await findOrCreateThread(id);
  const [message] = await db
    .insert(assistantMessages)
    .values({ threadId: thread.id, ...parsed.data })
    .returning();

  return NextResponse.json(message, { status: 201 });
}
