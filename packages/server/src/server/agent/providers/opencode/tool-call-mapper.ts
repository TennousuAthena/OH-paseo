import { z } from "zod";

import type { ToolCallTimelineItem } from "../../agent-sdk-types.js";
import { normalizeToolCallStatus } from "../tool-call-mapper-utils.js";
import { deriveOpencodeToolDetail } from "./tool-call-detail-parser.js";

interface OpencodeToolCallParams {
  toolName: string;
  callId?: string | null;
  status?: unknown;
  input?: unknown;
  output?: unknown;
  error?: unknown;
  metadata?: Record<string, unknown>;
}

const OpencodeToolCallStatusSchema = z.enum(["running", "completed", "failed", "canceled"]);

const OpencodeRawToolCallSchema = z
  .object({
    toolName: z.string().min(1),
    callId: z.string().optional().nullable(),
    status: z.unknown().optional(),
    input: z.unknown().optional(),
    output: z.unknown().optional(),
    error: z.unknown().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

const OpencodeNormalizedToolCallPass1Schema = OpencodeRawToolCallSchema.transform((raw) => {
  const input = raw.input ?? null;
  const output = raw.output ?? null;
  const error = raw.error ?? null;
  const callId =
    typeof raw.callId === "string" && raw.callId.trim().length > 0 ? raw.callId.trim() : null;
  const rawStatus = typeof raw.status === "string" ? raw.status : undefined;
  const status = normalizeToolCallStatus(rawStatus, error, output);

  return {
    callId,
    name: raw.toolName.trim(),
    input,
    output,
    error,
    metadata: raw.metadata,
    status,
  };
});

const OpencodeKnownToolNameSchema = z.union([
  z.literal("shell"),
  z.literal("bash"),
  z.literal("exec_command"),
  z.literal("read"),
  z.literal("read_file"),
  z.literal("write"),
  z.literal("write_file"),
  z.literal("create_file"),
  z.literal("edit"),
  z.literal("apply_patch"),
  z.literal("apply_diff"),
  z.literal("search"),
  z.literal("web_search"),
]);

const OpencodeToolCallPass2BaseSchema = z.object({
  callId: z.string().min(1),
  name: z.string().min(1),
  input: z.unknown().nullable(),
  output: z.unknown().nullable(),
  error: z.unknown().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  status: OpencodeToolCallStatusSchema,
  toolKind: z.enum(["known", "other"]),
});

const OpencodeToolCallPass2InputSchema = OpencodeToolCallPass2BaseSchema.omit({
  toolKind: true,
});

const OpencodeToolCallPass2EnvelopeSchema = z.union([
  OpencodeToolCallPass2InputSchema.extend({
    name: OpencodeKnownToolNameSchema,
  }).transform((normalized) => ({
    ...normalized,
    name: normalized.name.trim(),
    toolKind: "known" as const,
  })),
  OpencodeToolCallPass2InputSchema.transform((normalized) => ({
    ...normalized,
    name: normalized.name.trim(),
    toolKind: "other" as const,
  })),
]);

const OpencodeToolCallPass2Schema = z.discriminatedUnion("toolKind", [
  OpencodeToolCallPass2BaseSchema.extend({
    toolKind: z.literal("known"),
    name: OpencodeKnownToolNameSchema,
  }),
  OpencodeToolCallPass2BaseSchema.extend({
    toolKind: z.literal("other"),
  }),
]);

type OpencodeToolCallPass2 = z.infer<typeof OpencodeToolCallPass2Schema>;

function toToolCallTimelineItem(normalized: OpencodeToolCallPass2): ToolCallTimelineItem {
  const detail = deriveOpencodeToolDetail(normalized.name, normalized.input, normalized.output);
  if (normalized.status === "failed") {
    return {
      type: "tool_call",
      callId: normalized.callId,
      name: normalized.name,
      status: "failed",
      detail,
      error: normalized.error ?? { message: "Tool call failed" },
      ...(normalized.metadata ? { metadata: normalized.metadata } : {}),
    };
  }
  return {
    type: "tool_call",
    callId: normalized.callId,
    name: normalized.name,
    status: normalized.status,
    detail,
    error: null,
    ...(normalized.metadata ? { metadata: normalized.metadata } : {}),
  };
}

export function mapOpencodeToolCall(params: OpencodeToolCallParams): ToolCallTimelineItem | null {
  const pass1 = OpencodeNormalizedToolCallPass1Schema.safeParse(params);
  if (!pass1.success) {
    return null;
  }

  const pass2Envelope = OpencodeToolCallPass2EnvelopeSchema.safeParse(pass1.data);
  if (!pass2Envelope.success) {
    return null;
  }

  const pass2 = OpencodeToolCallPass2Schema.safeParse(pass2Envelope.data);
  if (!pass2.success) {
    return null;
  }

  return toToolCallTimelineItem(pass2.data);
}
