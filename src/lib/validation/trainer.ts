import { z } from "zod";

const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const createTrainerSessionSchema = z.object({
  scopeType: z.enum(["topic", "course"]),
  scopeId: z.string().uuid(),
});

export const trainerAnswerSchema = z.object({
  questionId: z.string().uuid(),
  givenAnswer: z.string().trim().min(1),
  today: dateOnlySchema.optional(),
});
