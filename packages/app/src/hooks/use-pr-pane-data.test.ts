import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  CheckoutPrStatusResponse,
  PullRequestTimelineResponse,
} from "@server/shared/messages";
import {
  prPaneTimelineQueryKey,
  usePrPaneData,
  type UsePrPaneDataResult,
} from "./use-pr-pane-data";
import { useWorkspacePrHint } from "./use-checkout-pr-status-query";

type CheckoutPrStatus = NonNullable<CheckoutPrStatusResponse["payload"]["status"]>;
type CheckoutPrStatusPayload = CheckoutPrStatusResponse["payload"];
type PullRequestTimelinePayload = PullRequestTimelineResponse["payload"];

const { mockRuntime, mockClient } = vi.hoisted(() => {
  const mockClient = {
    checkoutPrStatus: vi.fn(),
    pullRequestTimeline: vi.fn(),
  };

  return {
    mockClient,
    mockRuntime: {
      client: mockClient,
      isConnected: true,
    },
  };
});

vi.mock("@/runtime/host-runtime", () => ({
  useHostRuntimeClient: () => mockRuntime.client,
  useHostRuntimeIsConnected: () => mockRuntime.isConnected,
}));

const cwd = "/repo";
const serverId = "server-1";

function status(overrides: Partial<CheckoutPrStatus> = {}): CheckoutPrStatus {
  return {
    number: 42,
    url: "https://github.com/getpaseo/paseo/pull/42",
    title: "Wire real PR pane data",
    state: "open",
    baseRefName: "main",
    headRefName: "feature/pr-pane",
    isMerged: false,
    isDraft: false,
    checks: [],
    reviewDecision: null,
    repoOwner: "getpaseo",
    repoName: "paseo",
    ...overrides,
  };
}

function statusPayload(overrides: Partial<CheckoutPrStatusPayload> = {}): CheckoutPrStatusPayload {
  return {
    cwd,
    status: status(),
    githubFeaturesEnabled: true,
    error: null,
    requestId: "status-1",
    ...overrides,
  };
}

function timelinePayload(
  overrides: Partial<PullRequestTimelinePayload> = {},
): PullRequestTimelinePayload {
  return {
    cwd,
    prNumber: 42,
    items: [],
    truncated: false,
    error: null,
    requestId: "timeline-1",
    githubFeaturesEnabled: true,
    ...overrides,
  };
}

function unsupportedTimelineError(): Error {
  const error = new Error(
    "Unknown request schema requestType=pull_request_timeline_request code=unknown_schema",
  ) as Error & { code: string; requestType: string };
  error.name = "DaemonRpcError";
  error.code = "unknown_schema";
  error.requestType = "pull_request_timeline_request";
  return error;
}

function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

function renderPrPaneHook({
  queryClient = createTestQueryClient(),
  options = { serverId, cwd },
}: {
  queryClient?: QueryClient;
  options?: Parameters<typeof usePrPaneData>[0];
} = {}) {
  let latest: UsePrPaneDataResult | null = null;
  let currentOptions = options;

  function Probe({ hookOptions }: { hookOptions: Parameters<typeof usePrPaneData>[0] }) {
    latest = usePrPaneData(hookOptions);
    return null;
  }

  const container = document.getElementById("root");
  if (!container) {
    throw new Error("Missing root container");
  }

  const root = createRoot(container);

  function render() {
    root.render(
      React.createElement(
        QueryClientProvider,
        { client: queryClient },
        React.createElement(Probe, { hookOptions: currentOptions }),
      ),
    );
  }

  return {
    get latest() {
      if (!latest) {
        throw new Error("Expected hook result");
      }
      return latest;
    },
    queryClient,
    async mount() {
      await act(async () => {
        render();
      });
    },
    async rerender(nextOptions: Parameters<typeof usePrPaneData>[0]) {
      currentOptions = nextOptions;
      await act(async () => {
        render();
      });
    },
    async unmount() {
      await act(async () => {
        root.unmount();
      });
    },
  };
}

function renderSharedStatusConsumers({ queryClient = createTestQueryClient() } = {}) {
  let latest: UsePrPaneDataResult | null = null;

  function Probe() {
    latest = usePrPaneData({ serverId, cwd });
    useWorkspacePrHint({ serverId, cwd });
    return null;
  }

  const container = document.getElementById("root");
  if (!container) {
    throw new Error("Missing root container");
  }

  const root = createRoot(container);

  return {
    get latest() {
      if (!latest) {
        throw new Error("Expected hook result");
      }
      return latest;
    },
    async mount() {
      await act(async () => {
        root.render(
          React.createElement(
            QueryClientProvider,
            { client: queryClient },
            React.createElement(Probe),
          ),
        );
      });
    },
  };
}

async function waitForExpectation(assertion: () => void): Promise<void> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
    }
  }

  throw lastError;
}

describe("usePrPaneData", () => {
  beforeEach(() => {
    const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", {
      url: "http://localhost",
    });

    Object.defineProperty(globalThis, "document", {
      value: dom.window.document,
      configurable: true,
    });
    Object.defineProperty(globalThis, "window", {
      value: dom.window,
      configurable: true,
    });
    Object.defineProperty(globalThis, "navigator", {
      value: dom.window.navigator,
      configurable: true,
    });
    Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
      value: true,
      configurable: true,
    });

    mockRuntime.client = mockClient;
    mockRuntime.isConnected = true;
    mockClient.checkoutPrStatus.mockReset();
    mockClient.pullRequestTimeline.mockReset();
  });

  it("returns null when status has no PR number", async () => {
    const statusWithoutNumber = status();
    delete statusWithoutNumber.number;
    mockClient.checkoutPrStatus.mockResolvedValue(statusPayload({ status: statusWithoutNumber }));
    mockClient.pullRequestTimeline.mockResolvedValue(timelinePayload());

    const hook = renderPrPaneHook();
    await hook.mount();

    await waitForExpectation(() => {
      expect(hook.latest.isLoading).toBe(false);
    });

    expect(hook.latest.data).toBeNull();
    expect(mockClient.pullRequestTimeline).not.toHaveBeenCalled();
  });

  it("wires the timeline query only when a PR number is known", async () => {
    mockClient.checkoutPrStatus.mockResolvedValue(statusPayload({ status: null }));
    mockClient.pullRequestTimeline.mockResolvedValue(timelinePayload());

    const hook = renderPrPaneHook();
    await hook.mount();

    await waitForExpectation(() => {
      expect(hook.latest.isLoading).toBe(false);
    });

    expect(mockClient.pullRequestTimeline).not.toHaveBeenCalled();
    expect(
      hook.queryClient.getQueryState(prPaneTimelineQueryKey({ serverId, cwd, prNumber: 42 })),
    ).toBeUndefined();

    mockClient.checkoutPrStatus.mockResolvedValue(statusPayload());
    hook.queryClient.invalidateQueries({ queryKey: ["checkoutPrStatus", serverId, cwd] });

    await waitForExpectation(() => {
      expect(mockClient.pullRequestTimeline).toHaveBeenCalledWith({
        cwd,
        prNumber: 42,
        repoOwner: "getpaseo",
        repoName: "paseo",
      });
    });
  });

  it("checks PR status while timeline activity is disabled", async () => {
    mockClient.checkoutPrStatus.mockResolvedValue(statusPayload());
    mockClient.pullRequestTimeline.mockResolvedValue(timelinePayload());

    const hook = renderPrPaneHook({
      options: { serverId, cwd, enabled: true, timelineEnabled: false },
    });
    await hook.mount();

    await waitForExpectation(() => {
      expect(hook.latest.prNumber).toBe(42);
    });

    expect(hook.latest.data).toBeNull();
    expect(mockClient.checkoutPrStatus).toHaveBeenCalledTimes(1);
    expect(mockClient.pullRequestTimeline).not.toHaveBeenCalled();
  });

  it("does not request timeline activity until the PR repo identity is known", async () => {
    mockClient.checkoutPrStatus.mockResolvedValue(
      statusPayload({
        status: status({
          repoOwner: undefined,
          repoName: undefined,
        }),
      }),
    );
    mockClient.pullRequestTimeline.mockResolvedValue(timelinePayload());

    const hook = renderPrPaneHook();
    await hook.mount();

    await waitForExpectation(() => {
      expect(hook.latest.isLoading).toBe(false);
    });

    expect(hook.latest.data?.number).toBe(42);
    expect(hook.latest.data?.activity).toEqual([]);
    expect(mockClient.pullRequestTimeline).not.toHaveBeenCalled();
  });

  it("shares the checkout PR status query with workspace hint consumers", async () => {
    mockClient.checkoutPrStatus.mockResolvedValue(statusPayload());
    mockClient.pullRequestTimeline.mockResolvedValue(timelinePayload());

    const hook = renderSharedStatusConsumers();
    await hook.mount();

    await waitForExpectation(() => {
      expect(hook.latest.data?.number).toBe(42);
    });

    expect(mockClient.checkoutPrStatus).toHaveBeenCalledTimes(1);
  });

  it("passes repoOwner and repoName to the timeline request when present", async () => {
    mockClient.checkoutPrStatus.mockResolvedValue(
      statusPayload({
        status: {
          ...status(),
          repoOwner: "fork-parent",
          repoName: "paseo",
        },
      }),
    );
    mockClient.pullRequestTimeline.mockResolvedValue(timelinePayload());

    const hook = renderPrPaneHook();
    await hook.mount();

    await waitForExpectation(() => {
      expect(mockClient.pullRequestTimeline).toHaveBeenCalledWith({
        cwd,
        prNumber: 42,
        repoOwner: "fork-parent",
        repoName: "paseo",
      });
    });
  });

  it("lets the mapper reject stale timeline activity for a mismatched PR number", async () => {
    mockClient.checkoutPrStatus.mockResolvedValue(statusPayload());
    mockClient.pullRequestTimeline.mockResolvedValue(
      timelinePayload({
        prNumber: 41,
        items: [
          {
            id: "comment-1",
            kind: "comment",
            author: "octocat",
            body: "This belongs to another PR",
            createdAt: Date.now(),
            url: "https://github.com/getpaseo/paseo/pull/41#issuecomment-1",
          },
        ],
      }),
    );

    const hook = renderPrPaneHook();
    await hook.mount();

    await waitForExpectation(() => {
      expect(hook.latest.data?.number).toBe(42);
    });

    expect(hook.latest.data?.activity).toEqual([]);
  });

  it("suppresses old-daemon errors and prevents future timeline requests for that tuple", async () => {
    const unsupportedError = unsupportedTimelineError();
    mockClient.checkoutPrStatus.mockResolvedValue(
      statusPayload({ status: status({ number: 99 }) }),
    );
    mockClient.pullRequestTimeline.mockRejectedValue(unsupportedError);

    const hook = renderPrPaneHook();
    await hook.mount();

    await waitForExpectation(() => {
      expect(mockClient.pullRequestTimeline).toHaveBeenCalledTimes(1);
    });

    await waitForExpectation(() => {
      expect(hook.latest.error).toBeNull();
    });

    await hook.rerender({ serverId, cwd });
    await hook.queryClient.invalidateQueries({
      queryKey: prPaneTimelineQueryKey({ serverId, cwd, prNumber: 99 }),
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(mockClient.pullRequestTimeline).toHaveBeenCalledTimes(1);
    expect(hook.latest.data?.number).toBe(99);
  });

  it("surfaces checkout PR status payload errors", async () => {
    mockClient.checkoutPrStatus.mockResolvedValue(
      statusPayload({
        error: {
          code: "UNKNOWN",
          message: "bad daemon payload",
        },
      }),
    );
    mockClient.pullRequestTimeline.mockResolvedValue(timelinePayload());

    const hook = renderPrPaneHook();
    await hook.mount();

    await waitForExpectation(() => {
      expect(hook.latest.error).not.toBeNull();
      expect(hook.latest.error?.message).toContain("bad daemon payload");
    });
  });

  it("retries timeline requests when the unsupported timeline tuple changes", async () => {
    const cwdA = "/repo-a";
    const cwdB = "/repo-b";
    const prNumberA = 123;
    const prNumberB = 124;
    const unsupportedError = unsupportedTimelineError();

    mockClient.checkoutPrStatus.mockImplementation(async (requestedCwd: string) =>
      statusPayload({
        cwd: requestedCwd,
        status: status({ number: requestedCwd === cwdA ? prNumberA : prNumberB }),
      }),
    );
    mockClient.pullRequestTimeline.mockImplementation(async (input: { cwd: string }) => {
      if (input.cwd === cwdA) {
        throw unsupportedError;
      }
      return timelinePayload({ cwd: input.cwd, prNumber: prNumberB });
    });

    const hook = renderPrPaneHook({ options: { serverId, cwd: cwdA } });
    await hook.mount();

    await waitForExpectation(() => {
      expect(countTimelineCalls({ cwd: cwdA, prNumber: prNumberA })).toBe(1);
    });

    await hook.rerender({ serverId, cwd: cwdA });
    await hook.queryClient.invalidateQueries({
      queryKey: prPaneTimelineQueryKey({ serverId, cwd: cwdA, prNumber: prNumberA }),
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(countTimelineCalls({ cwd: cwdA, prNumber: prNumberA })).toBe(1);

    await hook.rerender({ serverId, cwd: cwdB });

    await waitForExpectation(() => {
      expect(countTimelineCalls({ cwd: cwdB, prNumber: prNumberB })).toBe(1);
    });
    expect(countTimelineCalls({ cwd: cwdA, prNumber: prNumberA })).toBe(1);
  });

  it("disables the timeline query when githubFeaturesEnabled is false", async () => {
    mockClient.checkoutPrStatus.mockResolvedValue(
      statusPayload({ githubFeaturesEnabled: false, status: status() }),
    );
    mockClient.pullRequestTimeline.mockResolvedValue(timelinePayload());

    const hook = renderPrPaneHook();
    await hook.mount();

    await waitForExpectation(() => {
      expect(hook.latest.data?.number).toBe(42);
    });

    expect(hook.latest.githubFeaturesEnabled).toBe(false);
    expect(hook.latest.data?.activity).toEqual([]);
    expect(mockClient.pullRequestTimeline).not.toHaveBeenCalled();
  });

  it("reports first-load, background refresh, and non-suppressed errors", async () => {
    const statusDeferred = createDeferred<CheckoutPrStatusPayload>();
    mockClient.checkoutPrStatus.mockReturnValue(statusDeferred.promise);
    mockClient.pullRequestTimeline.mockResolvedValue(
      timelinePayload({
        error: {
          kind: "unknown",
          message: "rate limited",
        },
      }),
    );

    const hook = renderPrPaneHook();
    await hook.mount();

    expect(hook.latest.isLoading).toBe(true);
    expect(hook.latest.isRefreshing).toBe(false);

    await act(async () => {
      statusDeferred.resolve(statusPayload());
    });

    await waitForExpectation(() => {
      expect(hook.latest.data?.number).toBe(42);
      expect(hook.latest.error?.message).toBe("rate limited");
    });

    const refreshDeferred = createDeferred<CheckoutPrStatusPayload>();
    mockClient.checkoutPrStatus.mockReturnValue(refreshDeferred.promise);
    hook.queryClient.invalidateQueries({ queryKey: ["checkoutPrStatus", serverId, cwd] });

    await waitForExpectation(() => {
      expect(hook.latest.isLoading).toBe(false);
      expect(hook.latest.isRefreshing).toBe(true);
    });

    await act(async () => {
      refreshDeferred.resolve(statusPayload());
    });

    await waitForExpectation(() => {
      expect(hook.latest.isRefreshing).toBe(false);
    });
  });
});

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });

  return { promise, resolve };
}

function countTimelineCalls({ cwd, prNumber }: { cwd: string; prNumber: number }): number {
  return mockClient.pullRequestTimeline.mock.calls.filter(([input]) => {
    const request = input as { cwd?: string; prNumber?: number | null };
    return request.cwd === cwd && request.prNumber === prNumber;
  }).length;
}
