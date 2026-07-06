import { asc, eq } from "drizzle-orm";
import type { db as appDb } from "@/lib/db";
import { bankQuestions, reviewLogs, sessionAnswers, topics, trainerSessions } from "@/lib/db/schema";
import { sm2Next, type ReviewState } from "@/lib/engine/sm2";
import { logEvent } from "@/lib/logging";

type Database = typeof appDb;

export type TrainerScopeType = "topic" | "course";

export class TrainerSessionError extends Error {
  constructor(
    readonly code:
      | "empty_bank"
      | "session_not_found"
      | "question_not_found"
      | "question_not_in_session",
    message: string,
  ) {
    super(message);
    this.name = "TrainerSessionError";
  }
}

interface ReviewItem {
  nextReviewAt: string;
  intervalDays: number;
  easeFactor: number;
  repetitions: number;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function toReviewState(item: ReviewItem): ReviewState {
  return {
    nextReviewAt: item.nextReviewAt,
    intervalDays: item.intervalDays,
    easeFactor: item.easeFactor,
    repetitions: item.repetitions,
  };
}

export function normalizeTrainerAnswer(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("es");
}

async function selectQuestionIds(database: Database, scopeType: TrainerScopeType, scopeId: string) {
  if (scopeType === "topic") {
    return database
      .select({ id: bankQuestions.id })
      .from(bankQuestions)
      .where(eq(bankQuestions.topicId, scopeId))
      .orderBy(asc(bankQuestions.createdAt), asc(bankQuestions.id));
  }

  return database
    .select({ id: bankQuestions.id })
    .from(bankQuestions)
    .innerJoin(topics, eq(bankQuestions.topicId, topics.id))
    .where(eq(topics.courseId, scopeId))
    .orderBy(asc(bankQuestions.createdAt), asc(bankQuestions.id));
}

export async function createTrainerSession(
  database: Database,
  input: { scopeType: TrainerScopeType; scopeId: string },
) {
  const questionIds = (await selectQuestionIds(database, input.scopeType, input.scopeId)).map((row) => row.id);
  if (questionIds.length === 0) {
    throw new TrainerSessionError("empty_bank", "No bank questions are available for this scope.");
  }

  const [created] = await database
    .insert(trainerSessions)
    .values({
      scopeType: input.scopeType,
      scopeId: input.scopeId,
      questionIds,
    })
    .returning();
  logEvent({
    boundary: "db",
    message: "trainer session created",
    operation: "insert",
    table: "trainer_sessions",
    session_id: created?.id,
    scope_type: input.scopeType,
    scope_id: input.scopeId,
    question_count: questionIds.length,
  });

  return created;
}

export async function getTrainerSession(database: Database, id: string) {
  const [session] = await database.select().from(trainerSessions).where(eq(trainerSessions.id, id));
  return session;
}

export async function answerTrainerQuestion(
  database: Database,
  input: {
    sessionId: string;
    questionId: string;
    givenAnswer: string;
    today?: string;
  },
) {
  const session = await getTrainerSession(database, input.sessionId);
  if (!session) {
    throw new TrainerSessionError("session_not_found", "Trainer session not found.");
  }

  const questionIndex = session.questionIds.indexOf(input.questionId);
  if (questionIndex < 0) {
    throw new TrainerSessionError("question_not_in_session", "Question is not part of this trainer session.");
  }

  const [question] = await database.select().from(bankQuestions).where(eq(bankQuestions.id, input.questionId));
  if (!question) {
    throw new TrainerSessionError("question_not_found", "Bank question not found.");
  }

  const isCorrect =
    normalizeTrainerAnswer(input.givenAnswer) === normalizeTrainerAnswer(question.correctAnswer);
  const outcome = isCorrect ? "correct" : "incorrect";
  const prevState = toReviewState(question);
  const review = sm2Next(prevState, outcome, "trainer", input.today ?? todayIso());

  if (review.scheduleChanged) {
    await database
      .update(bankQuestions)
      .set({
        nextReviewAt: review.state.nextReviewAt,
        intervalDays: review.state.intervalDays,
        easeFactor: review.state.easeFactor,
        repetitions: review.state.repetitions,
        lastOutcome: outcome,
      })
      .where(eq(bankQuestions.id, question.id));
    logEvent({
      boundary: "db",
      message: "trainer bank question schedule updated",
      operation: "update",
      table: "bank_questions",
      session_id: session.id,
      question_id: question.id,
      outcome,
    });
  }

  await database.insert(reviewLogs).values({
    itemType: "bank_question",
    itemId: question.id,
    context: "trainer",
    outcome,
    scheduleChanged: review.scheduleChanged,
    prevState,
    newState: review.state,
  });
  logEvent({
    boundary: "db",
    message: "trainer review log created",
    operation: "insert",
    table: "review_logs",
    session_id: session.id,
    question_id: question.id,
    outcome,
    schedule_changed: review.scheduleChanged,
  });

  await database.insert(sessionAnswers).values({
    sessionKind: "trainer",
    sessionId: session.id,
    questionId: question.id,
    givenAnswer: input.givenAnswer,
    isCorrect,
  });
  logEvent({
    boundary: "db",
    message: "trainer answer created",
    operation: "insert",
    table: "session_answers",
    session_id: session.id,
    question_id: question.id,
    is_correct: isCorrect,
  });

  const nextIndex = Math.max(session.currentIndex, questionIndex + 1);
  await database
    .update(trainerSessions)
    .set({
      currentIndex: nextIndex,
      status: nextIndex >= session.questionIds.length ? "finished" : "active",
    })
    .where(eq(trainerSessions.id, session.id));
  logEvent({
    boundary: "db",
    message: "trainer session progress updated",
    operation: "update",
    table: "trainer_sessions",
    session_id: session.id,
    current_index: nextIndex,
    status: nextIndex >= session.questionIds.length ? "finished" : "active",
  });

  return {
    isCorrect,
    explanation: question.explanation,
    review,
  };
}
