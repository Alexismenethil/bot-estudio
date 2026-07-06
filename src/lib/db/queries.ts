import { asc, eq } from "drizzle-orm";
import type { db as appDb } from "@/lib/db";
import { bankQuestions, courses, flashcards, topics } from "@/lib/db/schema";

type Database = typeof appDb;

export type DueItemType = "flashcard" | "bank_question";

export interface DueQueueItem {
  itemType: DueItemType;
  itemId: string;
  topicId: string;
  topicName: string;
  courseId: string;
  courseCode: string;
  courseName: string;
  nextReviewAt: string;
  intervalDays: number;
  easeFactor: number;
  repetitions: number;
  front?: string;
  back?: string;
  prompt?: string;
  correctAnswer?: string;
  explanation?: string;
}

interface DueCountBucket {
  dueCount: number;
  flashcards: number;
  bankQuestions: number;
}

export interface DueQueueCounts {
  total: number;
  byType: { flashcard: number; bankQuestion: number };
  byCourse: (DueCountBucket & { courseId: string; courseCode: string; courseName: string })[];
  byTopic: (DueCountBucket & {
    topicId: string;
    topicName: string;
    courseId: string;
    courseCode: string;
  })[];
}

export interface DueQueueResult {
  items: DueQueueItem[];
  counts: DueQueueCounts;
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function scopeMatches(item: DueQueueItem, scope: string): boolean {
  if (scope === "all") {
    return true;
  }
  const [scopeType, scopeId] = scope.split(":");
  if (scopeType === "course") {
    return item.courseId === scopeId;
  }
  if (scopeType === "topic") {
    return item.topicId === scopeId;
  }
  return false;
}

function countItems(items: DueQueueItem[]): DueQueueCounts {
  const byType = {
    flashcard: items.filter((item) => item.itemType === "flashcard").length,
    bankQuestion: items.filter((item) => item.itemType === "bank_question").length,
  };
  const courseMap = new Map<string, DueCountBucket & { courseCode: string; courseName: string }>();
  const topicMap = new Map<string, DueCountBucket & { topicName: string; courseId: string; courseCode: string }>();

  for (const item of items) {
    const course = courseMap.get(item.courseId) ?? {
      courseCode: item.courseCode,
      courseName: item.courseName,
      dueCount: 0,
      flashcards: 0,
      bankQuestions: 0,
    };
    const topic = topicMap.get(item.topicId) ?? {
      topicName: item.topicName,
      courseId: item.courseId,
      courseCode: item.courseCode,
      dueCount: 0,
      flashcards: 0,
      bankQuestions: 0,
    };

    course.dueCount += 1;
    topic.dueCount += 1;
    if (item.itemType === "flashcard") {
      course.flashcards += 1;
      topic.flashcards += 1;
    } else {
      course.bankQuestions += 1;
      topic.bankQuestions += 1;
    }
    courseMap.set(item.courseId, course);
    topicMap.set(item.topicId, topic);
  }

  return {
    total: items.length,
    byType,
    byCourse: Array.from(courseMap, ([courseId, bucket]) => ({ courseId, ...bucket })),
    byTopic: Array.from(topicMap, ([topicId, bucket]) => ({ topicId, ...bucket })),
  };
}

export async function getDueQueue(
  database: Database,
  params: { scope: string; horizon: "today" | "week"; today: string },
): Promise<DueQueueResult> {
  const through = params.horizon === "week" ? addDays(params.today, 7) : params.today;

  const flashcardRows = await database
    .select({
      itemId: flashcards.id,
      topicId: topics.id,
      topicName: topics.name,
      courseId: courses.id,
      courseCode: courses.code,
      courseName: courses.name,
      nextReviewAt: flashcards.nextReviewAt,
      intervalDays: flashcards.intervalDays,
      easeFactor: flashcards.easeFactor,
      repetitions: flashcards.repetitions,
      front: flashcards.front,
      back: flashcards.back,
    })
    .from(flashcards)
    .innerJoin(topics, eq(flashcards.topicId, topics.id))
    .innerJoin(courses, eq(topics.courseId, courses.id))
    .orderBy(asc(flashcards.nextReviewAt), asc(flashcards.createdAt));

  const bankQuestionRows = await database
    .select({
      itemId: bankQuestions.id,
      topicId: topics.id,
      topicName: topics.name,
      courseId: courses.id,
      courseCode: courses.code,
      courseName: courses.name,
      nextReviewAt: bankQuestions.nextReviewAt,
      intervalDays: bankQuestions.intervalDays,
      easeFactor: bankQuestions.easeFactor,
      repetitions: bankQuestions.repetitions,
      prompt: bankQuestions.prompt,
      correctAnswer: bankQuestions.correctAnswer,
      explanation: bankQuestions.explanation,
    })
    .from(bankQuestions)
    .innerJoin(topics, eq(bankQuestions.topicId, topics.id))
    .innerJoin(courses, eq(topics.courseId, courses.id))
    .orderBy(asc(bankQuestions.nextReviewAt), asc(bankQuestions.createdAt));

  const items: DueQueueItem[] = [
    ...flashcardRows.map((row) => ({ ...row, itemType: "flashcard" as const })),
    ...bankQuestionRows.map((row) => ({ ...row, itemType: "bank_question" as const })),
  ]
    .filter((item) => item.nextReviewAt <= through)
    .filter((item) => scopeMatches(item, params.scope))
    .sort((a, b) => a.nextReviewAt.localeCompare(b.nextReviewAt));

  return { items, counts: countItems(items) };
}
