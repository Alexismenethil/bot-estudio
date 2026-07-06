import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getDueQueue } from "@/lib/db/queries";
import { reviewDueQuerySchema } from "@/lib/validation/review";

export async function GET(request: Request) {
  const searchParams = Object.fromEntries(new URL(request.url).searchParams.entries());
  const parsed = reviewDueQuerySchema.safeParse(searchParams);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "invalid_query", message: parsed.error.message } },
      { status: 400 },
    );
  }

  return NextResponse.json(await getDueQueue(db, parsed.data));
}
