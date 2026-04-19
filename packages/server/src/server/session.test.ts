import pino from "pino";
import { afterEach, describe, expect, test, vi } from "vitest";

import { CheckoutPrStatusSchema } from "../shared/messages.js";
import { normalizeCheckoutPrStatusPayload, Session } from "./session.js";

const checkoutGitMocks = vi.hoisted(() => ({
  getCheckoutStatus: vi.fn(),
  mergeToBase: vi.fn(),
}));

vi.mock("../utils/checkout-git.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../utils/checkout-git.js")>();
  return {
    ...actual,
    getCheckoutStatus: checkoutGitMocks.getCheckoutStatus,
    mergeToBase: checkoutGitMocks.mergeToBase,
  };
});

function createSessionForTest(options?: {
  github?: {
    invalidate: ReturnType<typeof vi.fn>;
    isAuthenticated?: ReturnType<typeof vi.fn>;
    getPullRequestTimeline?: ReturnType<typeof vi.fn>;
  };
  checkoutDiffManager?: { scheduleRefreshForCwd: ReturnType<typeof vi.fn> };
  messages?: unknown[];
}): Session {
  const logger = pino({ level: "silent" });
  const github = options?.github ?? { invalidate: vi.fn() };
  const checkoutDiffManager = options?.checkoutDiffManager ?? {
    scheduleRefreshForCwd: vi.fn(),
  };
  const messages = options?.messages ?? [];

  return new Session({
    clientId: "test-client",
    onMessage: (message) => messages.push(message),
    logger,
    downloadTokenStore: {} as any,
    pushTokenStore: {} as any,
    paseoHome: "/tmp/paseo-home",
    agentManager: {
      subscribe: vi.fn(() => () => {}),
    } as any,
    agentStorage: {} as any,
    projectRegistry: {} as any,
    workspaceRegistry: {} as any,
    chatService: {} as any,
    scheduleService: {} as any,
    loopService: {} as any,
    checkoutDiffManager: checkoutDiffManager as any,
    github: github as any,
    workspaceGitService: {} as any,
    daemonConfigStore: {} as any,
    stt: null,
    tts: null,
    terminalManager: null,
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("session PR status payload normalization", () => {
  test("includes repository identity fields on the wire", () => {
    const payload = normalizeCheckoutPrStatusPayload({
      number: 123,
      repoOwner: "internal-owner",
      repoName: "internal-repo",
      url: "https://github.com/getpaseo/paseo/pull/123",
      title: "Ship PR pane",
      state: "open",
      baseRefName: "main",
      headRefName: "feature/pr-pane",
      isMerged: false,
      isDraft: true,
      checks: [
        {
          name: "typecheck",
          status: "success",
          url: "https://github.com/getpaseo/paseo/actions/runs/1",
          workflow: "CI",
          duration: "1m 20s",
        },
      ],
      checksStatus: "success",
      reviewDecision: "approved",
    });

    expect(payload).toHaveProperty("repoOwner", "internal-owner");
    expect(payload).toHaveProperty("repoName", "internal-repo");
    expect(CheckoutPrStatusSchema.parse(payload)).toEqual(payload);
  });
});

describe("session checkout merge handling", () => {
  test("invalidates the cwd mutated by merge-to-base", async () => {
    const messages: unknown[] = [];
    const github = { invalidate: vi.fn() };
    const checkoutDiffManager = { scheduleRefreshForCwd: vi.fn() };
    const session = createSessionForTest({ github, checkoutDiffManager, messages });

    checkoutGitMocks.getCheckoutStatus.mockResolvedValue({
      isGit: true,
      baseRef: "main",
    });
    checkoutGitMocks.mergeToBase.mockResolvedValue("/tmp/base-worktree");

    await (session as any).handleCheckoutMergeRequest({
      type: "checkout_merge_request",
      cwd: "/tmp/request-worktree",
      baseRef: "main",
      requestId: "request-1",
    });

    expect(checkoutGitMocks.mergeToBase).toHaveBeenCalledWith(
      "/tmp/request-worktree",
      {
        baseRef: "main",
        mode: "merge",
      },
      { paseoHome: "/tmp/paseo-home" },
    );
    expect(github.invalidate).toHaveBeenCalledTimes(1);
    expect(github.invalidate).toHaveBeenCalledWith({ cwd: "/tmp/base-worktree" });
    expect(checkoutDiffManager.scheduleRefreshForCwd).toHaveBeenCalledWith("/tmp/request-worktree");
    expect(messages).toContainEqual({
      type: "checkout_merge_response",
      payload: {
        cwd: "/tmp/request-worktree",
        success: true,
        error: null,
        requestId: "request-1",
      },
    });
  });
});

describe("session pull request timeline handling", () => {
  test("passes request identity to GitHubService and emits timeline items", async () => {
    const messages: unknown[] = [];
    const github = {
      invalidate: vi.fn(),
      isAuthenticated: vi.fn().mockResolvedValue(true),
      getPullRequestTimeline: vi.fn().mockResolvedValue({
        prNumber: 42,
        repoOwner: "getpaseo",
        repoName: "paseo",
        items: [
          {
            id: "review-1",
            kind: "review",
            author: "octocat",
            authorUrl: "https://github.com/octocat",
            body: "Looks good",
            createdAt: 1710000000000,
            url: "https://github.com/getpaseo/paseo/pull/42#pullrequestreview-1",
            reviewState: "approved",
          },
        ],
        truncated: false,
        error: null,
      }),
    };
    const session = createSessionForTest({ github, messages });

    await session.handleMessage({
      type: "pull_request_timeline_request",
      cwd: "/tmp/repo",
      prNumber: 42,
      repoOwner: "getpaseo",
      repoName: "paseo",
      requestId: "request-1",
    });

    expect(github.getPullRequestTimeline).toHaveBeenCalledWith({
      cwd: "/tmp/repo",
      prNumber: 42,
      repoOwner: "getpaseo",
      repoName: "paseo",
    });
    expect(messages).toContainEqual({
      type: "pull_request_timeline_response",
      payload: {
        cwd: "/tmp/repo",
        prNumber: 42,
        items: [
          {
            id: "review-1",
            kind: "review",
            author: "octocat",
            body: "Looks good",
            createdAt: 1710000000000,
            url: "https://github.com/getpaseo/paseo/pull/42#pullrequestreview-1",
            reviewState: "approved",
          },
        ],
        truncated: false,
        error: null,
        requestId: "request-1",
        githubFeaturesEnabled: true,
      },
    });
  });

  test.each([
    { prNumber: 0, repoOwner: "getpaseo", repoName: "paseo" },
    { prNumber: -1, repoOwner: "getpaseo", repoName: "paseo" },
    { prNumber: 42, repoOwner: "get paseo", repoName: "paseo" },
    { prNumber: 42, repoOwner: "getpaseo/cli", repoName: "paseo" },
    { prNumber: 42, repoOwner: "get$paseo", repoName: "paseo" },
    { prNumber: 42, repoOwner: "getpaseo", repoName: "pa seo" },
    { prNumber: 42, repoOwner: "getpaseo", repoName: "paseo/app" },
    { prNumber: 42, repoOwner: "getpaseo", repoName: "paseo!" },
  ])("returns an unknown error when request identity is invalid: %j", async (identity) => {
    const messages: unknown[] = [];
    const github = {
      invalidate: vi.fn(),
      isAuthenticated: vi.fn().mockResolvedValue(true),
      getPullRequestTimeline: vi.fn(),
    };
    const session = createSessionForTest({ github, messages });

    await session.handleMessage({
      type: "pull_request_timeline_request",
      cwd: "/tmp/repo",
      ...identity,
      requestId: "request-invalid",
    });

    expect(github.isAuthenticated).not.toHaveBeenCalled();
    expect(github.getPullRequestTimeline).not.toHaveBeenCalled();
    expect(messages).toContainEqual({
      type: "pull_request_timeline_response",
      payload: {
        cwd: "/tmp/repo",
        prNumber: identity.prNumber,
        items: [],
        truncated: false,
        error: {
          kind: "unknown",
          message: "Pull request timeline request has invalid PR identity",
        },
        requestId: "request-invalid",
        githubFeaturesEnabled: true,
      },
    });
  });

  test("disables GitHub features when gh auth is unavailable", async () => {
    const messages: unknown[] = [];
    const github = {
      invalidate: vi.fn(),
      isAuthenticated: vi.fn().mockResolvedValue(false),
      getPullRequestTimeline: vi.fn(),
    };
    const session = createSessionForTest({ github, messages });

    await session.handleMessage({
      type: "pull_request_timeline_request",
      cwd: "/tmp/repo",
      prNumber: 42,
      repoOwner: "getpaseo",
      repoName: "paseo",
      requestId: "request-3",
    });

    expect(github.getPullRequestTimeline).not.toHaveBeenCalled();
    expect(messages).toContainEqual({
      type: "pull_request_timeline_response",
      payload: {
        cwd: "/tmp/repo",
        prNumber: 42,
        items: [],
        truncated: false,
        error: {
          kind: "unknown",
          message: "GitHub CLI is unavailable or not authenticated",
        },
        requestId: "request-3",
        githubFeaturesEnabled: false,
      },
    });
  });
});
