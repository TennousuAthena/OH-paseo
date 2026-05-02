import type { AgentTimelineItem } from "./agent-sdk-types.js";
import { isLikelyExternalToolName } from "./tool-name-normalization.js";
import { buildToolCallDisplayModel } from "../../shared/tool-call-display.js";
import { projectTimelineRows } from "./timeline-projection.js";

const DEFAULT_MAX_ITEMS = 0;
const MAX_TOOL_INPUT_CHARS = 400;
const MAX_TOOL_SUMMARY_CHARS = 200;

function appendText(buffer: string, text: string): string {
  const normalized = text.trim();
  if (!normalized) {
    return buffer;
  }
  if (!buffer) {
    return normalized;
  }
  return `${buffer}\n${normalized}`;
}

function flushBuffers(lines: string[], buffers: { message: string; thought: string }) {
  if (buffers.message.trim()) {
    lines.push(buffers.message.trim());
  }
  if (buffers.thought.trim()) {
    lines.push(`[Thought] ${buffers.thought.trim()}`);
  }
  buffers.message = "";
  buffers.thought = "";
}

function formatToolInputJson(input: unknown): string | null {
  if (input === undefined) {
    return null;
  }
  try {
    const encoded = JSON.stringify(input);
    if (!encoded) {
      return null;
    }
    if (encoded.length <= MAX_TOOL_INPUT_CHARS) {
      return encoded;
    }
    return `${encoded.slice(0, MAX_TOOL_INPUT_CHARS)}...`;
  } catch {
    return null;
  }
}

function formatToolSummary(summary: string | undefined): string | null {
  if (typeof summary !== "string") {
    return null;
  }
  const normalized = summary.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return null;
  }
  if (normalized.length <= MAX_TOOL_SUMMARY_CHARS) {
    return normalized;
  }
  return `${normalized.slice(0, MAX_TOOL_SUMMARY_CHARS - 3)}...`;
}

function inputFromUnknownDetail(
  detail: Extract<AgentTimelineItem, { type: "tool_call" }>["detail"],
): unknown {
  return detail.type === "unknown" ? detail.input : null;
}

function projectForCuration(items: readonly AgentTimelineItem[]): AgentTimelineItem[] {
  const rows = items.map((item, index) => ({
    seq: index + 1,
    timestamp: "",
    item,
  }));
  return projectTimelineRows({ rows, mode: "projected" }).map((entry) => entry.item);
}

/**
 * Convert normalized agent timeline items into a concise text summary.
 */
export function curateAgentActivity(
  timeline: AgentTimelineItem[],
  options?: { maxItems?: number },
): string {
  if (timeline.length === 0) {
    return "No activity to display.";
  }

  const collapsed = projectForCuration(timeline);

  const maxItems = options?.maxItems ?? DEFAULT_MAX_ITEMS;
  const recentItems =
    maxItems > 0 && collapsed.length > maxItems ? collapsed.slice(-maxItems) : collapsed;

  const lines: string[] = [];
  const buffers = { message: "", thought: "" };

  for (const item of recentItems) {
    switch (item.type) {
      case "user_message":
        flushBuffers(lines, buffers);
        lines.push(`[User] ${item.text.trim()}`);
        break;
      case "assistant_message":
        buffers.message = appendText(buffers.message, item.text);
        break;
      case "reasoning":
        buffers.thought = appendText(buffers.thought, item.text);
        break;
      case "tool_call": {
        flushBuffers(lines, buffers);
        const inputJson = formatToolInputJson(inputFromUnknownDetail(item.detail));
        const display = buildToolCallDisplayModel({
          name: item.name,
          status: item.status,
          error: item.error,
          detail: item.detail,
          metadata: item.metadata,
        });
        const displayName = display.displayName;
        const summary = formatToolSummary(display.summary);
        if (isLikelyExternalToolName(item.name) && inputJson) {
          lines.push(`[${displayName}] ${inputJson}`);
          break;
        }
        if (summary) {
          lines.push(`[${displayName}] ${summary}`);
        } else {
          lines.push(`[${displayName}]`);
        }
        break;
      }
      case "todo":
        flushBuffers(lines, buffers);
        lines.push("[Tasks]");
        for (const entry of item.items) {
          const checkbox = entry.completed ? "[x]" : "[ ]";
          lines.push(`- ${checkbox} ${entry.text}`);
        }
        break;
      case "error":
        flushBuffers(lines, buffers);
        lines.push(`[Error] ${item.message}`);
        break;
      case "compaction":
        flushBuffers(lines, buffers);
        lines.push("[Compacted]");
        break;
    }
  }

  flushBuffers(lines, buffers);

  return lines.length > 0 ? lines.join("\n") : "No activity to display.";
}
