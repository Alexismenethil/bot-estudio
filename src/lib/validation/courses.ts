import { z } from "zod";

export const createCourseSchema = z.object({
  code: z.string().trim().min(1),
  name: z.string().trim().min(1),
});
