import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { courses } from "@/lib/db/schema";
import { createCourseSchema } from "@/lib/validation/courses";
import { isUniqueViolation } from "@/lib/db/errors";
import { getDueQueue } from "@/lib/db/queries";
import { logEvent } from "@/lib/logging";

export async function GET(request?: Request) {
  const rows = await db.select().from(courses);
  const today = request ? new URL(request.url).searchParams.get("today") : null;
  if (!today) {
    return NextResponse.json(rows);
  }

  const [todayQueue, weekQueue] = await Promise.all([
    getDueQueue(db, { scope: "all", horizon: "today", today }),
    getDueQueue(db, { scope: "all", horizon: "week", today }),
  ]);

  const withRollups = rows.map((course) => {
    const todayCourse = todayQueue.counts.byCourse.find((count) => count.courseId === course.id);
    const weekCourse = weekQueue.counts.byCourse.find((count) => count.courseId === course.id);
    return {
      ...course,
      dueToday: todayCourse?.dueCount ?? 0,
      dueWeek: weekCourse?.dueCount ?? 0,
      dueTodayByType: {
        flashcard: todayCourse?.flashcards ?? 0,
        bankQuestion: todayCourse?.bankQuestions ?? 0,
      },
      dueWeekByType: {
        flashcard: weekCourse?.flashcards ?? 0,
        bankQuestion: weekCourse?.bankQuestions ?? 0,
      },
      dueByType: {
        flashcard: weekCourse?.flashcards ?? 0,
        bankQuestion: weekCourse?.bankQuestions ?? 0,
      },
    };
  });
  return NextResponse.json(withRollups);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = createCourseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "invalid_body", message: parsed.error.message } },
      { status: 400 },
    );
  }

  try {
    const [created] = await db.insert(courses).values(parsed.data).returning();
    logEvent({
      boundary: "db",
      message: "course created",
      operation: "insert",
      table: "courses",
      course_id: created?.id,
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json(
        {
          error: {
            code: "duplicate_code",
            message: `Course code "${parsed.data.code}" already exists.`,
          },
        },
        { status: 409 },
      );
    }
    throw error;
  }
}
