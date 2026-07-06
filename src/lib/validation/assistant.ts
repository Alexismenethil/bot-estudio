import { z } from "zod";

export const assistantQuerySchema = z.object({
  documentId: z.string().uuid(),
  question: z.string().trim().min(1),
});
