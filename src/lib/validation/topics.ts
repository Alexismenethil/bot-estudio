import { z } from "zod";

export const createTopicSchema = z.object({
  courseId: z.string().uuid(),
  name: z.string().trim().min(1),
});

export const updateTopicSchema = z.object({
  name: z.string().trim().min(1),
});
