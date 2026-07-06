import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { documents } from "@/lib/db/schema";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  const [doc] = await db.select().from(documents).where(eq(documents.id, id));

  if (!doc) {
    return NextResponse.json(
      { error: { code: "not_found", message: "Document not found." } },
      { status: 404 },
    );
  }

  return NextResponse.json(doc);
}
