import { z } from "zod";

const when = z.string().nullable();
export const Document = z.object({ category: z.string(), label: z.string(), description: z.string() });
export const Status = z.enum(["NOT_STARTED", "OTP_SENT", "AUTHORIZED", "RETRIEVING", "COMPLETED", "DECLINED", "UNAVAILABLE"]);
export type Status = z.infer<typeof Status>;
export const Card = z.object({
  provider_id: z.string(),
  display_name: z.string(),
  status: Status,
  authorization_required: z.boolean(),
  documents: z.array(Document),
  detail: z.string().nullable(),
  updated_at: when,
});
export type Card = z.infer<typeof Card>;
export const Overview = z.object({
  transaction_reference: z.string(),
  state: z.string(),
  service_id: z.string(),
  service_name: z.string(),
  purpose: z.string(),
  mobile_masked: z.string(),
  session_expires_at: z.string(),
  can_complete: z.boolean(),
  departments: z.array(Card),
});
export type Overview = z.infer<typeof Overview>;
export const Challenge = z.object({
  challenge_reference: z.string(),
  provider_id: z.string(),
  mobile_masked: z.string(),
  expires_at: z.string(),
  resend_after: z.string(),
  attempts_allowed: z.number(),
  demo_code: z.string().optional(),
});
export type Challenge = z.infer<typeof Challenge>;
export const Verified = z.object({ department: Card });
export const Completion = z.object({
  transaction_reference: z.string(),
  state: z.string(),
  return_url: z.string(),
  message_queued: z.boolean(),
});
export type Completion = z.infer<typeof Completion>;
export const Check = z.object({
  rule_name: z.string().nullable(),
  provider_id: z.string(),
  outcome: z.enum(["PASS", "FAIL", "NEEDS_REVIEW"]),
  reason_code: z.string(),
  message: z.string(),
});
export const Report = z.object({
  transaction_reference: z.string(),
  state: z.string(),
  passed: z.number(),
  failed: z.number(),
  needs_review: z.number(),
  completed_at: z.string(),
  checks: z.array(Check),
});
export type Report = z.infer<typeof Report>;
export const Message = z.object({
  message_reference: z.string(),
  transaction_reference: z.string().nullable(),
  kind: z.enum(["OTP", "VERIFICATION_RESULT"]),
  recipient_masked: z.string(),
  body: z.string(),
  status: z.enum(["QUEUED", "SENT", "FAILED"]),
  created_at: z.string(),
});
export type Message = z.infer<typeof Message>;
export const MessageList = z.object({ messages: z.array(Message), next_cursor: z.string().nullable() });
export const Grant = z.object({ session_token: z.string(), session_expires_at: z.string(), transaction_reference: z.string() });
