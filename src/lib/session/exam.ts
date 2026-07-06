import { and, asc, eq, inArray } from "drizzle-orm";
import type { db as appDb } from "@/lib/db";
import { bankQuestions, examSessions, reviewLogs, sessionAnswers, topics } from "@/lib/db/schema";
import { sm2Next, type ReviewState } from "@/lib/engine/sm2";
import { gradeExam, type ExamAnswer, type GradedExam } from "@/lib/scoring/grade";
import { isExpired, remainingMs } from "@/lib/scoring/timer";
import { normalizeTrainerAnswer } from "@/lib/session/trainer";

type Database = typeof appDb;
type ExamScopeType = "topic" | "course";

export class ExamSessionError extends Error {
  constructor(
    readonly code:
      | "empty_bank"
      | "session_not_found"
      | "question_not_found"
      | "question_not_in_session"
      | "expired",
    message: string,
  ) {
    super(message);
    this.name = "ExamSessionError";
  }
}

export type ExamReport = Omit<GradedExam, "failed"> & {
  failed: {
    questionId: string;
    topicId: string;
    prompt: string;
    correctAnswer: string;
    explanation: string;
  }[];
};

type ExamSessionRow = typeof examSessions.$inferSelect;
type BankQuestionRow = typeof bankQuestions.$inferSelect;

function timestampMs(value: Date | string): number {
  return value instanceof Date ? value.getTime() : Date.parse(value);
}

function todayIso(now: Date) {
  return now.toISOString().slice(0, 10);
}

function toReviewState(question: BankQuestionRow): ReviewState {
  return {
    nextReviewAt: question.nextReviewAt,
    intervalDays: question.intervalDays,
    easeFactor: question.easeFactor,
    repetitions: question.repetitions,
  };
}

async function selectQuestionIds(database: Database, scopeType: ExamScopeType, scopeId: string) {
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

async function getExamSessionRow(database: Database, id: string) {
  const [session] = await database.select().from(examSessions).where(eq(examSessions.id, id));
  return session;
}

async function getExamAnswers(database: Database, sessionId: string): Promise<ExamAnswer[]> {
  const answers = await database
    .select({
      questionId: sessionAnswers.questionId,
      isCorrect: sessionAnswers.isCorrect,
    })
    .from(sessionAnswers)
    .where(and(eq(sessionAnswers.sessionKind, "exam"), eq(sessionAnswers.sessionId, sessionId)));
  return answers;
}

async function getSessionQuestionRows(database: Database, questionIds: string[]) {
  return database.select().from(bankQuestions).where(inArray(bankQuestions.id, questionIds));
}

function sessionRemainingMs(session: ExamSessionRow, now: Date) {
  return remainingMs(timestampMs(session.startedAt), session.durationSeconds, now.getTime());
}

function sessionIsExpired(session: ExamSessionRow, now: Date) {
  return isExpired(timestampMs(session.startedAt), session.durationSeconds, now.getTime());
}

export async function createExamSession(
  database: Database,
  input: { scopeType: ExamScopeType; scopeId: string; durationSeconds: number },
  now = new Date(),
) {
  const questionIds = (await selectQuestionIds(database, input.scopeType, input.scopeId)).map((row) => row.id);
  if (questionIds.length === 0) {
    throw new ExamSessionError("empty_bank", "No bank questions are available for this scope.");
  }

  const [created] = await database
    .insert(examSessions)
    .values({
      scopeType: input.scopeType,
      scopeId: input.scopeId,
      questionIds,
      durationSeconds: input.durationSeconds,
      startedAt: now,
    })
    .returning();
  return {
    ...created,
    remainingMs: sessionRemainingMs(created, now),
    answers: [],
  };
}

export async function buildExamReport(database: Database, session: ExamSessionRow): Promise<ExamReport> {
  const answers = await getExamAnswers(database, session.id);
  const questions = await getSessionQuestionRows(database, session.questionIds);
  const questionById = new Map(questions.map((question) => [question.id, question]));
  const topicByQuestion = Object.fromEntries(
    session.questionIds.map((questionId) => [questionId, questionById.get(questionId)?.topicId ?? ""]),
  );
  const graded = gradeExam(session.questionIds, answers, topicByQuestion);

  return {
    ...graded,
    failed: graded.failed.map((failed) => {
      const question = questionById.get(failed.questionId);
      return {
        ...failed,
        prompt: question?.prompt ?? "",
        correctAnswer: question?.correctAnswer ?? "",
        explanation: question?.explanation ?? "",
      };
    }),
  };
}

export async function finalizeExamSession(database: Database, sessionId: string, now = new Date()) {
  const session = await getExamSessionRow(database, sessionId);
  if (!session) {
    throw new ExamSessionError("session_not_found", "Exam session not found.");
  }

  if (session.status === "finished") {
    return buildExamReport(database, session);
  }

  const report = await buildExamReport(database, session);
  await database
    .update(examSessions)
    .set({
      status: "finished",
      finalizedAt: now,
      totalQuestions: report.totalQuestions,
      correctCount: report.correctCount,
    })
    .where(eq(examSessions.id, session.id));

  const failedIds = new Set(report.failed.map((failed) => failed.questionId));
  const drawnQuestions = await getSessionQuestionRows(database, session.questionIds);
  const reviewDate = todayIso(now);

  for (const question of drawnQuestions) {
    const outcome = failedIds.has(question.id) ? "incorrect" : "correct";
    const prevState = toReviewState(question);
    const review = sm2Next(prevState, outcome, "exam", reviewDate);
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
    }

    await database.insert(reviewLogs).values({
      itemType: "bank_question",
      itemId: question.id,
      context: "exam",
      outcome,
      scheduleChanged: review.scheduleChanged,
      prevState,
      newState: review.state,
    });
  }

  return report;
}

export async function getExamSessionView(database: Database, sessionId: string, now = new Date()) {
  const session = await getExamSessionRow(database, sessionId);
  if (!session) {
    throw new ExamSessionError("session_not_found", "Exam session not found.");
  }

  if (session.status === "active" && sessionIsExpired(session, now)) {
    const report = await finalizeExamSession(database, session.id, now);
    const finalized = await getExamSessionRow(database, session.id);
    return {
      ...finalized!,
      remainingMs: 0,
      answers: await getExamAnswers(database, session.id),
      report,
    };
  }

  const report = session.status === "finished" ? await buildExamReport(database, session) : undefined;
  return {
    ...session,
    remainingMs: session.status === "finished" ? 0 : sessionRemainingMs(session, now),
    answers: await getExamAnswers(database, session.id),
    report,
  };
}

export async function answerExamQuestion(
  database: Database,
  input: { sessionId: string; questionId: string; givenAnswer: string },
  now = new Date(),
) {
  const session = await getExamSessionRow(database, input.sessionId);
  if (!session) {
    throw new ExamSessionError("session_not_found", "Exam session not found.");
  }
  if (session.status === "finished" || sessionIsExpired(session, now)) {
    await finalizeExamSession(database, session.id, now);
    throw new ExamSessionError("expired", "Exam has expired.");
  }
  if (!session.questionIds.includes(input.questionId)) {
    throw new ExamSessionError("question_not_in_session", "Question is not part of this exam session.");
  }

  const [question] = await database.select().from(bankQuestions).where(eq(bankQuestions.id, input.questionId));
  if (!question) {
    throw new ExamSessionError("question_not_found", "Bank question not found.");
  }

  const isCorrect =
    normalizeTrainerAnswer(input.givenAnswer) === normalizeTrainerAnswer(question.correctAnswer);

  await database.insert(sessionAnswers).values({
    sessionKind: "exam",
    sessionId: session.id,
    questionId: question.id,
    givenAnswer: input.givenAnswer,
    isCorrect,
  });

  return {
    questionId: question.id,
    isCorrect,
  };
}
