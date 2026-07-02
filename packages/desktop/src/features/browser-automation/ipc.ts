import type { WebContents } from "electron";
import { ipcMain } from "electron";
import { BrowserAutomationExecuteRequestSchema } from "@getpaseo/protocol/browser-automation/rpc-schemas";
import type { BrowserAutomationConsoleLogEntry } from "@getpaseo/protocol/browser-automation/rpc-schemas";
import type { TabContents, BrowserRegistry } from "./service.js";
import { executeAutomationCommand } from "./service.js";
import {
  listRegisteredPaseoBrowserIds,
  listRegisteredPaseoBrowserIdsForWorkspace,
  getPaseoBrowserWebContents,
  getWorkspaceActivePaseoBrowserId,
  getPaseoBrowserWorkspaceId,
} from "../browser-webviews/index.js";

const MAX_CONSOLE_MESSAGES_PER_TAB = 200;
const consoleMessagesByContentsId = new Map<number, BrowserAutomationConsoleLogEntry[]>();
const observedContentsIds = new Set<number>();

interface IpcHandlerRegistry {
  handle(channel: string, listener: (event: unknown, ...args: unknown[]) => unknown): void;
}

function adaptWebContents(contents: WebContents): TabContents {
  observeConsoleMessages(contents);
  return {
    id: contents.id,
    getURL: () => contents.getURL(),
    getTitle: () => contents.getTitle(),
    canGoBack: () => contents.canGoBack(),
    canGoForward: () => contents.canGoForward(),
    isLoading: () => contents.isLoading(),
    isDestroyed: () => contents.isDestroyed(),
    executeJavaScript: (code: string) => contents.executeJavaScript(code),
    loadURL: (url: string) => contents.loadURL(url),
    goBack: () => contents.goBack(),
    goForward: () => contents.goForward(),
    reload: () => contents.reload(),
    capturePage: (options) => contents.capturePage(undefined, options),
    invalidate: () => contents.invalidate(),
    isBackgroundThrottlingAllowed: () => contents.getBackgroundThrottling(),
    setBackgroundThrottling: (allowed) => contents.setBackgroundThrottling(allowed),
    getConsoleMessages: () => consoleMessagesByContentsId.get(contents.id) ?? [],
    sendDebugCommand: async (command: string, params?: Record<string, unknown>) => {
      if (!contents.debugger.isAttached()) {
        contents.debugger.attach("1.3");
      }
      return contents.debugger.sendCommand(command, params ?? {});
    },
  };
}

function observeConsoleMessages(contents: WebContents): void {
  if (observedContentsIds.has(contents.id)) {
    return;
  }
  observedContentsIds.add(contents.id);
  contents.on("console-message", (_event, level, message, line, sourceId) => {
    const entry = normalizeConsoleMessage({ level, message, line, sourceId });
    const messages = consoleMessagesByContentsId.get(contents.id) ?? [];
    messages.push(entry);
    consoleMessagesByContentsId.set(contents.id, messages.slice(-MAX_CONSOLE_MESSAGES_PER_TAB));
  });
  contents.once("destroyed", () => {
    observedContentsIds.delete(contents.id);
    consoleMessagesByContentsId.delete(contents.id);
  });
}

function normalizeConsoleMessage(input: {
  level: unknown;
  message: unknown;
  line: unknown;
  sourceId: unknown;
}): BrowserAutomationConsoleLogEntry {
  return {
    level: typeof input.level === "string" ? input.level : String(input.level ?? "log"),
    message: typeof input.message === "string" ? input.message : String(input.message ?? ""),
    ...(typeof input.sourceId === "string" && input.sourceId.length > 0
      ? { source: input.sourceId }
      : {}),
    ...(typeof input.line === "number" ? { line: input.line } : {}),
    timestamp: Date.now(),
  };
}

function createRegistry(): BrowserRegistry {
  return {
    listRegisteredBrowserIds: listRegisteredPaseoBrowserIds,
    listRegisteredBrowserIdsForWorkspace: listRegisteredPaseoBrowserIdsForWorkspace,
    getTabContents(browserId: string): TabContents | null {
      const contents = getPaseoBrowserWebContents(browserId);
      return contents ? adaptWebContents(contents) : null;
    },
    getBrowserWorkspaceId: getPaseoBrowserWorkspaceId,
    getWorkspaceActiveBrowserId: getWorkspaceActivePaseoBrowserId,
  };
}

export function registerBrowserAutomationIpc(options?: { ipc?: IpcHandlerRegistry }): void {
  const ipc = options?.ipc ?? ipcMain;
  const registry = createRegistry();

  ipc.handle("paseo:browser:execute-automation-command", async (_event, rawRequest: unknown) => {
    const parsed = BrowserAutomationExecuteRequestSchema.safeParse(rawRequest);
    if (!parsed.success) {
      return {
        requestId: readRequestId(rawRequest),
        ok: false as const,
        error: {
          code: "browser_unsupported" as const,
          message: `Invalid automation request: ${parsed.error.message}`,
          retryable: false,
        },
      };
    }
    return executeAutomationCommand(parsed.data, registry);
  });
}

function readRequestId(rawRequest: unknown): string {
  if (typeof rawRequest !== "object" || rawRequest === null || Array.isArray(rawRequest)) {
    return "unknown";
  }
  const requestId = (rawRequest as Record<string, unknown>).requestId;
  return typeof requestId === "string" && requestId.length > 0 ? requestId : "unknown";
}
