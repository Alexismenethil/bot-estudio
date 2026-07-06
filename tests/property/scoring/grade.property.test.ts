import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { gradeExam } from "@/lib/scoring/grade";

const questionIdsArbitrary = fc.uniqueArray(fc.uuid(), { minLength: 1, maxLength: 20 });

describe("gradeExam properties [FR-020, FR-021, US4-AC2, US4-AC3]", () => {
  it("keeps score counts within 0 <= correct <= answered <= total", () => {
    fc.assert(
      fc.property(
        questionIdsArbitrary.chain((questionIds) =>
          fc.record({
            questionIds: fc.constant(questionIds),
            states: fc.array(fc.option(fc.boolean(), { nil: undefined }), {
              minLength: questionIds.length,
              maxLength: questionIds.length,
            }),
          }),
        ),
        ({ questionIds, states }) => {
          const topicByQuestion = Object.fromEntries(
            questionIds.map((questionId, index) => [questionId, `topic-${index % 3}`]),
          );
          const answers = questionIds.flatMap((questionId, index) =>
            states[index] === undefined ? [] : [{ questionId, isCorrect: states[index]! }],
          );
          const result = gradeExam(questionIds, answers, topicByQuestion);

          expect(result.correctCount).toBeGreaterThanOrEqual(0);
          expect(result.answeredCount).toBeGreaterThanOrEqual(result.correctCount);
          expect(result.totalQuestions).toBeGreaterThanOrEqual(result.answeredCount);
        },
      ),
    );
  });

  it("sets failed to wrong plus unanswered questions", () => {
    fc.assert(
      fc.property(
        questionIdsArbitrary.chain((questionIds) =>
          fc.record({
            questionIds: fc.constant(questionIds),
            states: fc.array(fc.option(fc.boolean(), { nil: undefined }), {
              minLength: questionIds.length,
              maxLength: questionIds.length,
            }),
          }),
        ),
        ({ questionIds, states }) => {
          const topicByQuestion = Object.fromEntries(
            questionIds.map((questionId, index) => [questionId, `topic-${index % 3}`]),
          );
          const answers = questionIds.flatMap((questionId, index) =>
            states[index] === undefined ? [] : [{ questionId, isCorrect: states[index]! }],
          );
          const failedIds = gradeExam(questionIds, answers, topicByQuestion)
            .failed.map((item) => item.questionId)
            .sort();
          const expectedFailedIds = questionIds
            .filter((_, index) => states[index] !== true)
            .sort();

          expect(failedIds).toEqual(expectedFailedIds);
        },
      ),
    );
  });

  it("computes scorePct as correct / total * 100", () => {
    fc.assert(
      fc.property(
        questionIdsArbitrary.chain((questionIds) =>
          fc.record({
            questionIds: fc.constant(questionIds),
            states: fc.array(fc.option(fc.boolean(), { nil: undefined }), {
              minLength: questionIds.length,
              maxLength: questionIds.length,
            }),
          }),
        ),
        ({ questionIds, states }) => {
          const topicByQuestion = Object.fromEntries(
            questionIds.map((questionId, index) => [questionId, `topic-${index % 3}`]),
          );
          const answers = questionIds.flatMap((questionId, index) =>
            states[index] === undefined ? [] : [{ questionId, isCorrect: states[index]! }],
          );
          const result = gradeExam(questionIds, answers, topicByQuestion);
          const expectedCorrect = states.filter((state) => state === true).length;

          expect(result.scorePct).toBeCloseTo((expectedCorrect / questionIds.length) * 100, 10);
        },
      ),
    );
  });
});
