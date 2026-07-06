export interface ExamAnswer {
  questionId: string;
  isCorrect: boolean;
}

export interface FailedExamQuestion {
  questionId: string;
  topicId: string;
}

export interface GradedExam {
  totalQuestions: number;
  answeredCount: number;
  correctCount: number;
  scorePct: number;
  failed: FailedExamQuestion[];
}

export function gradeExam(
  questionIds: string[],
  answers: ExamAnswer[],
  topicByQuestion: Record<string, string>,
): GradedExam {
  const draw = new Set(questionIds);
  const answerByQuestion = new Map<string, boolean>();

  for (const answer of answers) {
    if (!draw.has(answer.questionId)) {
      throw new Error("Answer question is outside the frozen draw.");
    }
    if (answerByQuestion.has(answer.questionId)) {
      throw new Error("Duplicate answer for one question.");
    }
    answerByQuestion.set(answer.questionId, answer.isCorrect);
  }

  const correctCount = Array.from(answerByQuestion.values()).filter(Boolean).length;
  const failed = questionIds
    .filter((questionId) => answerByQuestion.get(questionId) !== true)
    .map((questionId) => ({
      questionId,
      topicId: topicByQuestion[questionId] ?? "",
    }));

  return {
    totalQuestions: questionIds.length,
    answeredCount: answerByQuestion.size,
    correctCount,
    scorePct: questionIds.length === 0 ? 0 : (correctCount / questionIds.length) * 100,
    failed,
  };
}
