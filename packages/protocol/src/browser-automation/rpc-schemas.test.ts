import { describe, expect, test } from "vitest";

import {
  BrowserAutomationExecuteRequestSchema,
  BrowserAutomationExecuteResponseSchema,
} from "./rpc-schemas.js";

const BROWSER_ID = "11111111-1111-4111-8111-111111111111";
const FALLBACK_BROWSER_ID = "1777777777777-abcdef";
const BROWSER_ID_MESSAGE =
  "browserId must be a real id returned by browser_new_tab or browser_list_tabs";
const WAIT_CONDITION_MESSAGE = "browser_wait requires exactly one of text or url";

describe("browser automation execute RPC schemas", () => {
  test("list tabs reads workspace from the request envelope", () => {
    const parsed = BrowserAutomationExecuteRequestSchema.parse({
      type: "browser.automation.execute.request",
      requestId: "req-list-tabs",
      workspaceId: "workspace-1",
      command: { command: "list_tabs", args: {} },
    });

    expect(parsed).toEqual({
      type: "browser.automation.execute.request",
      requestId: "req-list-tabs",
      workspaceId: "workspace-1",
      command: { command: "list_tabs", args: {} },
    });
  });

  test("new tab reads workspace from the request envelope", () => {
    const parsed = BrowserAutomationExecuteRequestSchema.parse({
      type: "browser.automation.execute.request",
      requestId: "req-new-tab",
      workspaceId: "workspace-1",
      command: { command: "new_tab", args: { url: "https://example.com" } },
    });

    expect(parsed.command).toEqual({
      command: "new_tab",
      args: { url: "https://example.com" },
    });
  });

  test("tab commands require a browser id from browser_new_tab or browser_list_tabs", () => {
    const parsed = BrowserAutomationExecuteRequestSchema.safeParse({
      type: "browser.automation.execute.request",
      requestId: "req-snapshot",
      workspaceId: "workspace-1",
      command: { command: "snapshot", args: {} },
    });

    expect(parsed).toMatchObject({
      success: false,
      error: { issues: [expect.objectContaining({ message: BROWSER_ID_MESSAGE })] },
    });
  });

  test("tab commands reject hallucinated browser ids", () => {
    const parsed = BrowserAutomationExecuteRequestSchema.safeParse({
      type: "browser.automation.execute.request",
      requestId: "req-page-info",
      workspaceId: "workspace-1",
      command: { command: "page_info", args: { browserId: "default" } },
    });

    expect(parsed).toMatchObject({
      success: false,
      error: { issues: [expect.objectContaining({ message: BROWSER_ID_MESSAGE })] },
    });
  });

  test("tab commands parse browser ids produced by the fallback generator", () => {
    const parsed = BrowserAutomationExecuteRequestSchema.parse({
      type: "browser.automation.execute.request",
      requestId: "req-page-info",
      workspaceId: "workspace-1",
      command: { command: "page_info", args: { browserId: FALLBACK_BROWSER_ID } },
    });

    expect(parsed.command).toEqual({
      command: "page_info",
      args: { browserId: FALLBACK_BROWSER_ID },
    });
  });

  test("requests reject browser id in the envelope", () => {
    const parsed = BrowserAutomationExecuteRequestSchema.safeParse({
      type: "browser.automation.execute.request",
      requestId: "req-click",
      workspaceId: "workspace-1",
      browserId: BROWSER_ID,
      command: { command: "click", args: { browserId: BROWSER_ID, ref: "@e1" } },
    });

    expect(parsed).toMatchObject({
      success: false,
      error: { issues: [expect.objectContaining({ message: 'Unrecognized key: "browserId"' })] },
    });
  });

  test("tab commands reject workspace id in command args", () => {
    const parsed = BrowserAutomationExecuteRequestSchema.safeParse({
      type: "browser.automation.execute.request",
      requestId: "req-click",
      workspaceId: "workspace-1",
      command: {
        command: "click",
        args: { workspaceId: "workspace-1", browserId: BROWSER_ID, ref: "@e1" },
      },
    });

    expect(parsed).toMatchObject({
      success: false,
      error: { issues: [expect.objectContaining({ message: 'Unrecognized key: "workspaceId"' })] },
    });
  });

  test("wait rejects calls without exactly one condition", () => {
    const parsed = BrowserAutomationExecuteRequestSchema.safeParse({
      type: "browser.automation.execute.request",
      requestId: "req-wait",
      command: { command: "wait", args: { browserId: BROWSER_ID } },
    });

    expect(parsed).toMatchObject({
      success: false,
      error: { issues: [expect.objectContaining({ message: WAIT_CONDITION_MESSAGE })] },
    });
  });

  test("wait rejects calls with both text and url conditions", () => {
    const parsed = BrowserAutomationExecuteRequestSchema.safeParse({
      type: "browser.automation.execute.request",
      requestId: "req-wait",
      command: {
        command: "wait",
        args: { browserId: BROWSER_ID, text: "Ready", url: "/ready" },
      },
    });

    expect(parsed).toMatchObject({
      success: false,
      error: { issues: [expect.objectContaining({ message: WAIT_CONDITION_MESSAGE })] },
    });
  });

  test("wait accepts one text condition", () => {
    const parsed = BrowserAutomationExecuteRequestSchema.parse({
      type: "browser.automation.execute.request",
      requestId: "req-wait",
      command: {
        command: "wait",
        args: { browserId: BROWSER_ID, text: "Ready", timeoutMs: 1000 },
      },
    });

    expect(parsed.command).toEqual({
      command: "wait",
      args: { browserId: BROWSER_ID, text: "Ready", timeoutMs: 1000 },
    });
  });

  test("navigate rejects non-http URLs at the protocol boundary", () => {
    const parsed = BrowserAutomationExecuteRequestSchema.safeParse({
      type: "browser.automation.execute.request",
      requestId: "req-navigate",
      command: {
        command: "navigate",
        args: { browserId: BROWSER_ID, url: "file:///tmp/secret.txt" },
      },
    });

    expect(parsed).toMatchObject({
      success: false,
      error: { issues: [expect.objectContaining({ message: "URL must use http or https" })] },
    });
  });

  test("new tab responses declare the generated browser id shape", () => {
    const parsed = BrowserAutomationExecuteResponseSchema.parse({
      type: "browser.automation.execute.response",
      payload: {
        requestId: "req-new-tab",
        ok: true,
        result: {
          command: "new_tab",
          browserId: BROWSER_ID,
          workspaceId: "workspace-1",
          url: "https://example.com",
        },
      },
    });

    expect(parsed.payload).toEqual({
      requestId: "req-new-tab",
      ok: true,
      result: {
        command: "new_tab",
        browserId: BROWSER_ID,
        workspaceId: "workspace-1",
        url: "https://example.com",
      },
    });
  });

  test("responses reject hallucinated browser ids", () => {
    const parsed = BrowserAutomationExecuteResponseSchema.safeParse({
      type: "browser.automation.execute.response",
      payload: {
        requestId: "req-page-info",
        ok: true,
        result: {
          command: "page_info",
          tab: {
            browserId: "default",
            workspaceId: "workspace-1",
            url: "https://example.com",
            title: "Example",
          },
        },
      },
    });

    expect(parsed).toMatchObject({
      success: false,
      error: { issues: [expect.objectContaining({ message: BROWSER_ID_MESSAGE })] },
    });
  });
});
