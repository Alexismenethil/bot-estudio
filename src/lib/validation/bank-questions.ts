import { z } from "zod";

export const createBankQuestionSchema = z.object({
  topicId: z.string().uuid(),
  prompt: z.string().trim().min(1),
  correctAnswer: z.string().trim().min(1),
  explanation: z.string().trim().min(1),
});

export const updateBankQuestionSchema = z
  .object({
    prompt: z.string().trim().min(1).optional(),
    correctAnswer: z.string().trim().min(1).optional(),
    explanation: z.string().trim().min(1).optional(),
  })
  .refine(
    (value) =>
      value.prompt !== undefined || value.correctAnswer !== undefined || value.explanation !== undefined,
    {
      message: "At least one field must be provided.",
    },
  );
