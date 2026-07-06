import { z } from "zod";

export const createFlashcardSchema = z.object({
  topicId: z.string().uuid(),
  front: z.string().trim().min(1),
  back: z.string().trim().min(1),
});

export const updateFlashcardSchema = z
  .object({
    front: z.string().trim().min(1).optional(),
    back: z.string().trim().min(1).optional(),
  })
  .refine((value) => value.front !== undefined || value.back !== undefined, {
    message: "At least one field must be provided.",
  });
