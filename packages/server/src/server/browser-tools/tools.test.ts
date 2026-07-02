import { describe, expect, test } from "vitest";
import { z } from "zod";
import type { BrowserToolsBroker, BrowserToolsExecuteInput } from "./broker.js";
import type { BrowserToolsResponsePayload } from "./errors.js";
import { registerBrowserTools, type RegisterBrowserToolsOptions } from "./tools.js";
import type {
  PaseoToolConfig,
  PaseoToolExecutionContext,
  PaseoToolResult,
} from "../agent/tools/types.js";

const BROWSER_ID = "11111111-1111-4111-8111-111111111111";
const BROWSER_ID_MESSAGE =
  "browserId must be a real id returned by browser_new_tab or browser_list_tabs";
const WAIT_CONDITION_MESSAGE = "browser_wait requires exactly one of text or url";

interface RegisteredTool {
  config: PaseoToolConfig;
  handler: (args: unknown, context: PaseoToolExecutionContext) => Promise<PaseoToolResult>;
}

class FakeBrowserBroker {
  public readonly calls: BrowserToolsExecuteInput[] = [];

  public constructor(private response: BrowserToolsResponsePayload = listTabsPayload()) {}

  public setResponse(response: BrowserToolsResponsePayload): void {
    this.response = response;
  }

  public async execute(input: BrowserToolsExecuteInput): Promise<BrowserToolsResponsePayload> {
    this.calls.push(input);
    return this.response;
  }
}

class BrowserToolHarness {
  public readonly broker = new FakeBrowserBroker();
  private readonly tools = new Map<string, RegisteredTool>();

  public constructor(
    private readonly callerAgent: ReturnType<RegisterBrowserToolsOptions["resolveCallerAgent"]> = {
      id: "agent-1",
      cwd: "/repo",
      workspaceId: "wks_workspace_a",
    },
    private readonly callerAgentId: string | null = "agent-1",
  ) {
    registerBrowserTools({
      registerTool: (name, config, handler) => {
        this.tools.set(name, { config, handler });
      },
      broker: this.broker as Pick<BrowserToolsBroker, "execute">,
      ...(this.callerAgentId ? { callerAgentId: this.callerAgentId } : {}),
      resolveCallerAgent: () => this.callerAgent,
    });
  }

  public validate(name: string, input: unknown) {
    return schemaFor(this.get(name).config.inputSchema).safeParse(input);
  }

  public async execute(name: string, input: unknown): Promise<PaseoToolResult> {
    const parsed = schemaFor(this.get(name).config.inputSchema).parse(input);
    return this.get(name).handler(parsed, {});
  }

  private get(name: string): RegisteredTool {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool not registered: ${name}`);
    }
    return tool;
  }
}

function schemaFor(inputSchema: PaseoToolConfig["inputSchema"]): z.ZodType {
  if (!inputSchema) {
    return z.object({}).passthrough();
  }
  if (typeof (inputSchema as { safeParse?: unknown }).safeParse === "function") {
    return inputSchema as z.ZodType;
  }
  return z.object(inputSchema as z.ZodRawShape).passthrough();
}

function listTabsPayload(): Extract<BrowserToolsResponsePayload, { ok: true }> {
  return {
    requestId: "req-list-tabs",
    ok: true,
    result: {
      command: "list_tabs",
      tabs: [
        {
          browserId: BROWSER_ID,
          url: "https://example.com",
          title: "Example",
          isActive: true,
          isLoading: false,
        },
      ],
    },
  };
}

describe("registerBrowserTools", () => {
  test("list tabs sends workspace in the request envelope", async () => {
    const harness = new BrowserToolHarness();

    const response = await harness.execute("browser_list_tabs", {});

    expect(harness.broker.calls).toEqual([
      {
        agentId: "agent-1",
        cwd: "/repo",
        workspaceId: "wks_workspace_a",
        command: { command: "list_tabs", args: {} },
      },
    ]);
    expect(response.content).toEqual([
      {
        type: "text",
        text: `Found 1 Paseo browser tab. Use these browserId values for tab-scoped browser tools.\n- browserId=${BROWSER_ID} active title="Example" url=https://example.com`,
      },
    ]);
  });

  test("new tab sends workspace in the request envelope", async () => {
    const harness = new BrowserToolHarness();
    harness.broker.setResponse({
      requestId: "req-new-tab",
      ok: true,
      result: {
        command: "new_tab",
        browserId: BROWSER_ID,
        workspaceId: "wks_workspace_a",
        url: "https://example.com",
      },
    });

    const response = await harness.execute("browser_new_tab", { url: "https://example.com" });

    expect(harness.broker.calls).toEqual([
      {
        agentId: "agent-1",
        cwd: "/repo",
        workspaceId: "wks_workspace_a",
        command: { command: "new_tab", args: { url: "https://example.com" } },
      },
    ]);
    expect(response.content).toEqual([
      {
        type: "text",
        text: `Created browser tab browserId=${BROWSER_ID} url=https://example.com. Use this browserId for tab-scoped browser tools.`,
      },
    ]);
  });

  test("snapshot rejects calls without a browser id", () => {
    const harness = new BrowserToolHarness();

    const parsed = harness.validate("browser_snapshot", {});

    expect(parsed).toMatchObject({
      success: false,
      error: { issues: [expect.objectContaining({ message: BROWSER_ID_MESSAGE })] },
    });
  });

  test("snapshot rejects hallucinated browser ids", () => {
    const harness = new BrowserToolHarness();

    const parsed = harness.validate("browser_snapshot", { browserId: "default" });

    expect(parsed).toMatchObject({
      success: false,
      error: { issues: [expect.objectContaining({ message: BROWSER_ID_MESSAGE })] },
    });
  });

  test("snapshot sends browser id in command args only", async () => {
    const harness = new BrowserToolHarness();
    harness.broker.setResponse({
      requestId: "req-snapshot",
      ok: true,
      result: {
        command: "snapshot",
        browserId: BROWSER_ID,
        workspaceId: "wks_workspace_a",
        url: "https://example.com",
        title: "Example",
        elements: [],
      },
    });

    const response = await harness.execute("browser_snapshot", { browserId: BROWSER_ID });

    expect(harness.broker.calls).toEqual([
      {
        agentId: "agent-1",
        cwd: "/repo",
        workspaceId: "wks_workspace_a",
        command: { command: "snapshot", args: { browserId: BROWSER_ID } },
      },
    ]);
    expect(response.structuredContent).toEqual({
      ok: true,
      result: {
        command: "snapshot",
        browserId: BROWSER_ID,
        workspaceId: "wks_workspace_a",
        url: "https://example.com",
        title: "Example",
        elements: [],
      },
      context: {
        agentId: "agent-1",
        cwd: "/repo",
        workspaceId: "wks_workspace_a",
        browserId: BROWSER_ID,
      },
    });
  });

  test("wait rejects calls without a condition", () => {
    const harness = new BrowserToolHarness();

    const parsed = harness.validate("browser_wait", { browserId: BROWSER_ID });

    expect(parsed).toMatchObject({
      success: false,
      error: { issues: [expect.objectContaining({ message: WAIT_CONDITION_MESSAGE })] },
    });
  });

  test("wait rejects empty calls", () => {
    const harness = new BrowserToolHarness();

    const parsed = harness.validate("browser_wait", {});

    expect(parsed).toMatchObject({
      success: false,
      error: { issues: [expect.objectContaining({ message: BROWSER_ID_MESSAGE })] },
    });
  });

  test("wait rejects calls with both text and url", () => {
    const harness = new BrowserToolHarness();

    const parsed = harness.validate("browser_wait", {
      browserId: BROWSER_ID,
      text: "Ready",
      url: "/ready",
    });

    expect(parsed).toMatchObject({
      success: false,
      error: { issues: [expect.objectContaining({ message: WAIT_CONDITION_MESSAGE })] },
    });
  });

  test("wait sends the text condition and extends the broker timeout", async () => {
    const harness = new BrowserToolHarness();
    harness.broker.setResponse({
      requestId: "req-wait",
      ok: true,
      result: { command: "wait", browserId: BROWSER_ID, matched: "text" },
    });

    const response = await harness.execute("browser_wait", {
      browserId: BROWSER_ID,
      text: "Ready",
      timeoutMs: 1000,
    });

    expect(harness.broker.calls).toEqual([
      {
        agentId: "agent-1",
        cwd: "/repo",
        workspaceId: "wks_workspace_a",
        timeoutMs: 2000,
        command: {
          command: "wait",
          args: { browserId: BROWSER_ID, text: "Ready", timeoutMs: 1000 },
        },
      },
    ]);
    expect(response.content).toEqual([{ type: "text", text: "Browser wait matched text." }]);
  });

  test("tools keep empty context when there is no caller agent", async () => {
    const harness = new BrowserToolHarness(null, null);

    const response = await harness.execute("browser_list_tabs", {});

    expect(harness.broker.calls).toEqual([{ command: { command: "list_tabs", args: {} } }]);
    expect(response.structuredContent).toEqual({
      ok: true,
      result: listTabsPayload().result,
      context: {},
    });
  });
});
