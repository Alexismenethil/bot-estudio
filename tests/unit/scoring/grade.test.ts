import { describe, expect, it } from "vitest";
import { gradeExam } from "@/lib/scoring/grade";

const questionIds = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333",
];

const topicByQuestion = {
  [questionIds[0]]: "topic-a",
  [questionIds[1]]: "topic-b",
  [questionIds[2]]: "topic-c",
};

describe("gradeExam examples [FR-020, FR-021, US4-AC2, US4-AC3]", () => {
  it("counts unanswered questions as failed and computes score percentage over total", () => {
    const result = gradeExam(
      questionIds,
      [
        { questionId: questionIds[0], isCorrect: true },
        { questionId: questionIds[1], isCorrect: false },
      ],
      topicByQuestion,
    );

    expect(result.totalQuestions).toBe(3);
    expect(result.answeredCount).toBe(2);
    expect(result.correctCount).toBe(1);
    expect(result.scorePct).toBeCloseTo(33.333, 3);
    expect(result.failed).toEqual([
      { questionId: questionIds[1], topicId: "topic-b" },
      { questionId: questionIds[2], topicId: "topic-c" },
    ]);
  });

  it("returns 100 percent when every drawn question is answered correctly", () => {
    const result = gradeExam(
      questionIds,
      questionIds.map((questionId) => ({ questionId, isCorrect: true })),
      topicByQuestion,
    );

    expect(result).toMatchObject({
      totalQuestions: 3,
      answeredCount: 3,
      correctCount: 3,
      scorePct: 100,
      failed: [],
    });
  });

  it("rejects duplicate answers for one question", () => {
    expect(() =>
      gradeExam(
        questionIds,
        [
          { questionId: questionIds[0], isCorrect: true },
          { questionId: questionIds[0], isCorrect: false },
        ],
        topicByQuestion,
      ),
    ).toThrow(/duplicate/i);
  });

  it("rejects answers for questions outside the frozen draw", () => {
    expect(() =>
      gradeExam(
        questionIds,
        [{ questionId: "44444444-4444-4444-8444-444444444444", isCorrect: true }],
        topicByQuestion,
      ),
    ).toThrow(/frozen draw/i);
  });
});
