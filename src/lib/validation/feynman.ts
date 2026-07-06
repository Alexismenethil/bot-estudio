import { z } from "zod";

export const createFeynmanSubmissionSchema = z.object({
  topicId: z.string().uuid(),
  explanation: z
    .string()
    .max(20_000)
    .refine((value) => value.trim().length > 0, { message: "Explanation is required." }),
});

export const retrieveFeynmanSchema = z.object({
  submissionId: z.string().uuid(),
});

export const feynmanCitationSchema = z.object({
  documentId: z.string().uuid(),
  page: z.number().int().positive(),
});

export const feynmanEvaluationSchema = z.object({
  correctPoints: z.array(z.string()),
  missingPoints: z.array(z.string()),
  wrongPoints: z.array(z.string()),
  reviewSuggestions: z.array(z.string()),
  citations: z.array(feynmanCitationSchema),
});

export const localFeynmanEvaluationSchema = z.object({
  engine: z.literal("local"),
  evaluation: feynmanEvaluationSchema,
});

export const retryStateSchema = z.object({
  status: z.literal("pending_retry"),
  failureClasses: z.object({
    gemini: z.enum(["timeout", "quota", "network", "invalid_response"]),
    local: z.enum(["unsupported", "oom", "not_cached", "inference_error"]),
  }),
});
