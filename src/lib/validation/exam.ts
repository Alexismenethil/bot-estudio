import { z } from "zod";

export const createExamSessionSchema = z.object({
  scopeType: z.enum(["topic", "course"]),
  scopeId: z.string().uuid(),
  durationSeconds: z.number().int().positive(),
});

export const examAnswerSchema = z.object({
  questionId: z.string().uuid(),
  givenAnswer: z.string().trim().min(1),
});
