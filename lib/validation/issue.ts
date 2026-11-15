// Zod schemas and constants for Issue Submission API (Task 4.1).
// Used by app/api/issues/route.ts and client submission components.

import { z } from "zod";

export const MAX_ISSUE_TEXT_LENGTH = 2000;
export const MAX_PHOTO_COUNT = 5;
export const MAX_PHOTO_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
export const MAX_VOICE_SIZE_BYTES = 25 * 1024 * 1024; // 25MB

export const ALLOWED_PHOTO_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

export const ALLOWED_VOICE_MIME_TYPES = [
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/x-m4a",
  "audio/aac",
] as const;

export const geoSchema = z.object({
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
});
export type GeoPoint = z.infer<typeof geoSchema>;

export const issueSubmissionInputSchema = z.object({
  text: z.string().trim().max(MAX_ISSUE_TEXT_LENGTH).optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
});
export type IssueSubmissionInput = z.infer<typeof issueSubmissionInputSchema>;

export interface IssueSubmissionResult {
  issueId: string;
  incidentId?: string;
}
