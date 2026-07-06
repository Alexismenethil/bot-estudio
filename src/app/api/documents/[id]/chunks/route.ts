import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { documentChunks } from "@/lib/db/schema";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  const rows = await db
    .select()
    .from(documentChunks)
    .where(eq(documentChunks.documentId, id))
    .orderBy(asc(documentChunks.chunkIndex));

  return NextResponse.json({
    chunks: rows.map((row) => ({
      id: row.id,
      pageNumber: row.pageNumber,
      content: row.content,
      embedding: row.embedding,
    })),
  });
}
