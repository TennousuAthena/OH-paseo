import { describe, expect, test } from "vitest";
import { BrowserSnapshotEngine } from "./snapshot-engine.js";
import type { BrowserRegistry, TabContents, TabImage } from "./service.js";
import { executeAutomationCommand } from "./service.js";

const BROWSER_A = "11111111-1111-4111-8111-111111111111";
const BROWSER_B = "22222222-2222-4222-8222-222222222222";

class FakeImage implements TabImage {
  public toPNG(): Uint8Array {
    return new Uint8Array([137, 80, 78, 71]);
  }

  public getSize(): { width: number; height: number } {
    return { width: 10, height: 5 };
  }
}

class FakeTab implements TabContents {
  public readonly loadedUrls: string[] = [];
  public readonly scripts: string[] = [];
  public readonly actions: string[] = [];
  public readonly capturedViewports: Array<{ stayHidden?: boolean }> = [];
  public destroyed = false;
  public bodyText = "";
  public snapshotElements: unknown[] = [];

  public constructor(
    public readonly id: number,
    private readonly url: string,
    private readonly title: string,
  ) {}

  public getURL(): string {
    return this.loadedUrls.at(-1) ?? this.url;
  }

  public getTitle(): string {
    return this.title;
  }

  public canGoBack(): boolean {
    return true;
  }

  public canGoForward(): boolean {
    return false;
  }

  public isLoading(): boolean {
    return false;
  }

  public isDestroyed(): boolean {
    return this.destroyed;
  }

  public async executeJavaScript(code: string): Promise<unknown> {
    this.scripts.push(code);
    if (code.includes("document.body.innerText")) {
      return this.bodyText;
    }
    if (code.includes("querySelectorAll")) {
      return JSON.stringify(this.snapshotElements);
    }
    return true;
  }

  public async loadURL(url: string): Promise<void> {
    this.loadedUrls.push(url);
  }

  public goBack(): void {
    this.actions.push("back");
  }

  public goForward(): void {
    this.actions.push("forward");
  }

  public reload(): void {
    this.actions.push("reload");
  }

  public async capturePage(options?: { stayHidden?: boolean }): Promise<TabImage> {
    this.capturedViewports.push(options ?? {});
    return new FakeImage();
  }

  public invalidate(): void {
    this.actions.push("invalidate");
  }

  public isBackgroundThrottlingAllowed(): boolean {
    return true;
  }

  public setBackgroundThrottling(allowed: boolean): void {
    this.actions.push(`background:${allowed}`);
  }
}

class FakeRegistry implements BrowserRegistry {
  private readonly tabs = new Map<string, { workspaceId: string; tab: FakeTab }>();

  public activeBrowserId: string | null = null;

  public register(browserId: string, workspaceId: string, tab: FakeTab): void {
    this.tabs.set(browserId, { workspaceId, tab });
  }

  public listRegisteredBrowserIds(): string[] {
    return Array.from(this.tabs.keys());
  }

  public listRegisteredBrowserIdsForWorkspace(workspaceId: string): string[] {
    return Array.from(this.tabs.entries())
      .filter((entry) => entry[1].workspaceId === workspaceId)
      .map((entry) => entry[0]);
  }

  public getTabContents(browserId: string): TabContents | null {
    return this.tabs.get(browserId)?.tab ?? null;
  }

  public getBrowserWorkspaceId(browserId: string): string | null {
    return this.tabs.get(browserId)?.workspaceId ?? null;
  }

  public getWorkspaceActiveBrowserId(): string | null {
    return this.activeBrowserId;
  }
}

function pageRequest(command: { command: "page_info"; args: { browserId: string } }) {
  return {
    type: "browser.automation.execute.request" as const,
    requestId: "req-page",
    workspaceId: "workspace-a",
    command,
  };
}

describe("executeAutomationCommand", () => {
  test("list tabs reports workspace ownership and active tab information", () => {
    const tabA = new FakeTab(1, "https://a.test", "A");
    const tabB = new FakeTab(2, "https://b.test", "B");
    const registry = new FakeRegistry();
    registry.register(BROWSER_A, "workspace-a", tabA);
    registry.register(BROWSER_B, "workspace-b", tabB);
    registry.activeBrowserId = BROWSER_A;

    const result = executeAutomationCommand(
      {
        type: "browser.automation.execute.request",
        requestId: "req-list",
        workspaceId: "workspace-a",
        command: { command: "list_tabs", args: {} },
      },
      registry,
    );

    expect(result).toEqual({
      requestId: "req-list",
      ok: true,
      result: {
        command: "list_tabs",
        tabs: [
          {
            browserId: BROWSER_A,
            workspaceId: "workspace-a",
            url: "https://a.test",
            title: "A",
            isActive: true,
            isLoading: false,
            canGoBack: true,
            canGoForward: false,
          },
        ],
      },
    });
  });

  test("page info reads the explicit browser id from command args", () => {
    const tab = new FakeTab(1, "https://a.test", "A");
    const registry = new FakeRegistry();
    registry.register(BROWSER_A, "workspace-a", tab);

    const result = executeAutomationCommand(
      pageRequest({ command: "page_info", args: { browserId: BROWSER_A } }),
      registry,
    );

    expect(result).toEqual({
      requestId: "req-page",
      ok: true,
      result: {
        command: "page_info",
        tab: {
          browserId: BROWSER_A,
          workspaceId: "workspace-a",
          url: "https://a.test",
          title: "A",
          isActive: false,
          isLoading: false,
          canGoBack: true,
          canGoForward: false,
        },
      },
    });
  });

  test("page info returns tab not found for an id in another workspace", () => {
    const registry = new FakeRegistry();
    registry.register(BROWSER_A, "workspace-b", new FakeTab(1, "https://a.test", "A"));

    const result = executeAutomationCommand(
      pageRequest({ command: "page_info", args: { browserId: BROWSER_A } }),
      registry,
    );

    expect(result).toEqual({
      requestId: "req-page",
      ok: false,
      error: {
        code: "browser_tab_not_found",
        message: `No browser tab found for ID: ${BROWSER_A}`,
        retryable: false,
      },
    });
  });

  test("page info returns tab closed for a destroyed explicit tab", () => {
    const tab = new FakeTab(1, "https://a.test", "A");
    tab.destroyed = true;
    const registry = new FakeRegistry();
    registry.register(BROWSER_A, "workspace-a", tab);

    const result = executeAutomationCommand(
      pageRequest({ command: "page_info", args: { browserId: BROWSER_A } }),
      registry,
    );

    expect(result).toEqual({
      requestId: "req-page",
      ok: false,
      error: {
        code: "browser_tab_closed",
        message: `Browser tab ${BROWSER_A} has been closed`,
        retryable: false,
      },
    });
  });

  test("snapshot and click use refs from the same explicit tab", async () => {
    const tab = new FakeTab(1, "https://a.test/form", "Form");
    tab.snapshotElements = [
      {
        role: "button",
        tagName: "button",
        text: "Submit",
        selector: "#submit",
        attributes: { id: "submit" },
      },
    ];
    const registry = new FakeRegistry();
    registry.register(BROWSER_A, "workspace-a", tab);
    const snapshotEngine = new BrowserSnapshotEngine();

    const snapshot = await executeAutomationCommand(
      {
        type: "browser.automation.execute.request",
        requestId: "req-snapshot",
        workspaceId: "workspace-a",
        command: { command: "snapshot", args: { browserId: BROWSER_A } },
      },
      registry,
      { snapshotEngine },
    );
    const click = await executeAutomationCommand(
      {
        type: "browser.automation.execute.request",
        requestId: "req-click",
        workspaceId: "workspace-a",
        command: { command: "click", args: { browserId: BROWSER_A, ref: "@e1" } },
      },
      registry,
      { snapshotEngine },
    );

    expect(snapshot).toEqual({
      requestId: "req-snapshot",
      ok: true,
      result: {
        command: "snapshot",
        browserId: BROWSER_A,
        workspaceId: "workspace-a",
        url: "https://a.test/form",
        title: "Form",
        elements: [
          {
            ref: "@e1",
            role: "button",
            tagName: "button",
            text: "Submit",
            selector: "#submit",
            attributes: { id: "submit" },
          },
        ],
      },
    });
    expect(click).toEqual({
      requestId: "req-click",
      ok: true,
      result: { command: "click", browserId: BROWSER_A, ref: "@e1" },
    });
  });

  test("wait resolves when the explicit tab contains the requested text", async () => {
    const tab = new FakeTab(1, "https://a.test", "A");
    tab.bodyText = "Ready";
    const registry = new FakeRegistry();
    registry.register(BROWSER_A, "workspace-a", tab);

    const result = await executeAutomationCommand(
      {
        type: "browser.automation.execute.request",
        requestId: "req-wait",
        workspaceId: "workspace-a",
        command: {
          command: "wait",
          args: { browserId: BROWSER_A, text: "Ready", timeoutMs: 100 },
        },
      },
      registry,
    );

    expect(result).toEqual({
      requestId: "req-wait",
      ok: true,
      result: { command: "wait", browserId: BROWSER_A, matched: "text" },
    });
  });

  test("navigate loads the requested URL in the explicit tab", async () => {
    const tab = new FakeTab(1, "https://a.test", "A");
    const registry = new FakeRegistry();
    registry.register(BROWSER_A, "workspace-a", tab);

    const result = await executeAutomationCommand(
      {
        type: "browser.automation.execute.request",
        requestId: "req-navigate",
        workspaceId: "workspace-a",
        command: {
          command: "navigate",
          args: { browserId: BROWSER_A, url: "https://example.com/next" },
        },
      },
      registry,
    );

    expect(result).toEqual({
      requestId: "req-navigate",
      ok: true,
      result: { command: "navigate", browserId: BROWSER_A, url: "https://example.com/next" },
    });
    expect(tab.loadedUrls).toEqual(["https://example.com/next"]);
  });

  test("navigation actions dispatch to the explicit tab", () => {
    const tab = new FakeTab(1, "https://a.test", "A");
    const registry = new FakeRegistry();
    registry.register(BROWSER_A, "workspace-a", tab);

    const back = executeAutomationCommand(
      {
        type: "browser.automation.execute.request",
        requestId: "req-back",
        workspaceId: "workspace-a",
        command: { command: "back", args: { browserId: BROWSER_A } },
      },
      registry,
    );
    const forward = executeAutomationCommand(
      {
        type: "browser.automation.execute.request",
        requestId: "req-forward",
        workspaceId: "workspace-a",
        command: { command: "forward", args: { browserId: BROWSER_A } },
      },
      registry,
    );
    const reload = executeAutomationCommand(
      {
        type: "browser.automation.execute.request",
        requestId: "req-reload",
        workspaceId: "workspace-a",
        command: { command: "reload", args: { browserId: BROWSER_A } },
      },
      registry,
    );

    expect(back).toEqual({
      requestId: "req-back",
      ok: true,
      result: { command: "back", browserId: BROWSER_A },
    });
    expect(forward).toEqual({
      requestId: "req-forward",
      ok: true,
      result: { command: "forward", browserId: BROWSER_A },
    });
    expect(reload).toEqual({
      requestId: "req-reload",
      ok: true,
      result: { command: "reload", browserId: BROWSER_A },
    });
    expect(tab.actions).toEqual(["back", "forward", "reload"]);
  });

  test("screenshot captures the explicit tab viewport", async () => {
    const tab = new FakeTab(1, "https://a.test", "A");
    const registry = new FakeRegistry();
    registry.register(BROWSER_A, "workspace-a", tab);

    const result = await executeAutomationCommand(
      {
        type: "browser.automation.execute.request",
        requestId: "req-screenshot",
        workspaceId: "workspace-a",
        command: { command: "screenshot", args: { browserId: BROWSER_A } },
      },
      registry,
    );

    expect(result).toEqual({
      requestId: "req-screenshot",
      ok: true,
      result: {
        command: "screenshot",
        browserId: BROWSER_A,
        mimeType: "image/png",
        dataBase64: "iVBORw==",
        width: 10,
        height: 5,
      },
    });
    expect(tab.capturedViewports).toEqual([{ stayHidden: false }]);
  });
});
