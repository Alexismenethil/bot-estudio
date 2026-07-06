import { z } from "zod";

export const documentPageSchema = z.object({
  pageNumber: z.number().int().min(1),
  text: z.string(),
});

export const createDocumentSchema = z.object({
  topicId: z.string().uuid(),
  title: z.string().trim().min(1),
  blobUrl: z.string().url(),
  pages: z.array(documentPageSchema),
});
