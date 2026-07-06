import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

function parseDayShift(raw: string | undefined) {
  if (!raw) {
    throw new Error("Usage: pnpm db:timeshift -- +3d  (or -2d)");
  }

  const match = raw.trim().match(/^([+-]?\d+)d$/i);
  if (!match) {
    throw new Error(`Invalid day shift "${raw}". Expected format like +3d or -2d.`);
  }

  return Number(match[1]);
}

async function main() {
  const days = parseDayShift(process.argv[2]);

  await db.execute(sql`
    update flashcards
    set next_review_at = next_review_at + (${days} * interval '1 day')
  `);
  await db.execute(sql`
    update bank_questions
    set next_review_at = next_review_at + (${days} * interval '1 day')
  `);
  await db.execute(sql`
    update exam_sessions
    set started_at = started_at + (${days} * interval '1 day')
    where status = 'active'
  `);

  console.log(JSON.stringify({ shiftedDays: days }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
