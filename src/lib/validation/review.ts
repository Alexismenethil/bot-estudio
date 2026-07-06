import { z } from "zod";

export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const reviewAnswerSchema = z.object({
  itemType: z.enum(["flashcard", "bank_question"]),
  itemId: z.string().uuid(),
  outcome: z.enum(["correct", "incorrect", "hard"]),
  context: z.enum(["review", "trainer", "exam"]),
  today: isoDateSchema,
});

export const reviewDueQuerySchema = z.object({
  scope: z
    .string()
    .optional()
    .transform((value) => value ?? "all"),
  horizon: z.enum(["today", "week"]).default("today"),
  today: isoDateSchema,
});
