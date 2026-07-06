import { z } from "zod";

const citationSchema = z.object({
  page: z.number().int().positive(),
  chunkId: z.string().uuid(),
});

export const createMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1),
  status: z.enum(["ok", "pending_retry"]),
  engine: z.enum(["gemini", "local"]).optional(),
  citations: z.array(citationSchema).optional(),
});
