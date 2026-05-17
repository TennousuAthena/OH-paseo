import { describe, expect, it, vi } from "vitest";
import {
  createAssistantFileLinkResolver,
  getAssistantFileLinkToken,
  type AssistantFileLinkContext,
  type DirectorySuggestionEntry,
  type DirectorySuggestionResult,
} from "./resolver";
import type { OpenFileDisposition } from "@/workspace/file-open";
import type { InlinePathTarget } from "./parse";

const CONTEXT: AssistantFileLinkContext = {
  serverId: "server-1",
  workspaceRoot: "/Users/test/project",
};

function resolvedSuggestions(
  entries: DirectorySuggestionResult["entries"],
): DirectorySuggestionResult {
  return { entries, error: null };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}

interface DirectorySearch {
  query: string;
  cwd: string;
  includeFiles: true;
  includeDirectories: false;
  matchMode: "suffix";
  limit: number;
}

interface OpenedFile {
  target: InlinePathTarget;
  disposition: OpenFileDisposition;
}

class FakeWorkspaceFiles {
  readonly searches: DirectorySearch[] = [];
  readonly openedFiles: OpenedFile[] = [];
  readonly unresolvedTokens: string[] = [];

  constructor(private readonly entriesByQuery: Record<string, DirectorySuggestionEntry[]>) {}

  createResolver() {
    return createAssistantFileLinkResolver({
      getDirectorySuggestions: this.getDirectorySuggestions,
      openWorkspaceFile: this.openWorkspaceFile,
      openExternalUrl: async () => {},
      onUnresolvedFileCandidate: this.onUnresolvedFileCandidate,
    });
  }

  private getDirectorySuggestions = async (
    search: DirectorySearch,
  ): Promise<DirectorySuggestionResult> => {
    this.searches.push(search);
    return resolvedSuggestions(this.entriesByQuery[search.query] ?? []);
  };

  private openWorkspaceFile = (
    target: InlinePathTarget,
    disposition: OpenFileDisposition,
  ): void => {
    this.openedFiles.push({ target, disposition });
  };

  private onUnresolvedFileCandidate = (token: string): void => {
    this.unresolvedTokens.push(token);
  };
}

describe("assistant file link resolver", () => {
  it("dedupes in-flight prefetches and serves the click from cache", async () => {
    const suggestions = vi.fn(async () =>
      resolvedSuggestions([{ path: "src/dumm.md", kind: "file" }]),
    );
    const openWorkspaceFile = vi.fn();
    const openExternalUrl = vi.fn();
    const resolver = createAssistantFileLinkResolver({
      getDirectorySuggestions: suggestions,
      openWorkspaceFile,
      openExternalUrl,
    });
    const source = { href: "http://dumm.md", text: "dumm.md", markup: "linkify" };

    await Promise.all([
      resolver.prefetch({ context: CONTEXT, source }),
      resolver.prefetch({ context: CONTEXT, source }),
    ]);
    const result = await resolver.open({ context: CONTEXT, source, disposition: "main" });

    expect(suggestions).toHaveBeenCalledTimes(1);
    expect(suggestions).toHaveBeenCalledWith({
      query: "dumm.md",
      cwd: "/Users/test/project",
      includeFiles: true,
      includeDirectories: false,
      matchMode: "suffix",
      limit: 1,
    });
    expect(openWorkspaceFile).toHaveBeenCalledWith(
      {
        raw: "dumm.md",
        path: "/Users/test/project/src/dumm.md",
        lineStart: undefined,
        lineEnd: undefined,
      },
      "main",
    );
    expect(openExternalUrl).not.toHaveBeenCalled();
    expect(result.opened).toBe(true);
  });

  it("click consumes an in-flight hover resolution", async () => {
    const deferred = createDeferred<DirectorySuggestionResult>();
    const suggestions = vi.fn(() => deferred.promise);
    const openWorkspaceFile = vi.fn();
    const resolver = createAssistantFileLinkResolver({
      getDirectorySuggestions: suggestions,
      openWorkspaceFile,
      openExternalUrl: vi.fn(),
    });
    const source = { href: "http://dumm.md", text: "dumm.md", sourceInfo: "auto" };

    const prefetch = resolver.prefetch({ context: CONTEXT, source });
    const opened = resolver.open({ context: CONTEXT, source, disposition: "main" });
    deferred.resolve(resolvedSuggestions([{ path: "docs/dumm.md", kind: "file" }]));

    await prefetch;
    const result = await opened;

    expect(suggestions).toHaveBeenCalledTimes(1);
    expect(openWorkspaceFile).toHaveBeenCalledWith(
      {
        raw: "dumm.md",
        path: "/Users/test/project/docs/dumm.md",
        lineStart: undefined,
        lineEnd: undefined,
      },
      "main",
    );
    expect(result.opened).toBe(true);
  });

  it("retries a click after hover prefetch fails to query suggestions", async () => {
    const suggestions = vi
      .fn()
      .mockRejectedValueOnce(new Error("daemon unavailable"))
      .mockResolvedValueOnce(resolvedSuggestions([{ path: "docs/dumm.md", kind: "file" }]));
    const openWorkspaceFile = vi.fn();
    const openExternalUrl = vi.fn();
    const resolver = createAssistantFileLinkResolver({
      getDirectorySuggestions: suggestions,
      openWorkspaceFile,
      openExternalUrl,
    });
    const source = { href: "http://dumm.md", text: "dumm.md", markup: "linkify" };

    const prefetchResult = await resolver.prefetch({ context: CONTEXT, source });
    const openResult = await resolver.open({ context: CONTEXT, source, disposition: "main" });

    expect(prefetchResult).toEqual({
      kind: "unresolvedFileCandidate",
      token: "dumm.md",
    });
    expect(suggestions).toHaveBeenCalledTimes(2);
    expect(openWorkspaceFile).toHaveBeenCalledWith(
      {
        raw: "dumm.md",
        path: "/Users/test/project/docs/dumm.md",
        lineStart: undefined,
        lineEnd: undefined,
      },
      "main",
    );
    expect(openExternalUrl).not.toHaveBeenCalled();
    expect(openResult.opened).toBe(true);
  });

  it("does not cache unresolved candidates", async () => {
    const suggestions = vi
      .fn()
      .mockResolvedValueOnce(resolvedSuggestions([]))
      .mockResolvedValueOnce(resolvedSuggestions([{ path: "docs/dumm.md", kind: "file" }]));
    const openWorkspaceFile = vi.fn();
    const openExternalUrl = vi.fn();
    const onUnresolvedFileCandidate = vi.fn();
    const resolver = createAssistantFileLinkResolver({
      getDirectorySuggestions: suggestions,
      openWorkspaceFile,
      openExternalUrl,
      onUnresolvedFileCandidate,
    });
    const source = { href: "http://dumm.md", text: "dumm.md", markup: "linkify" };

    const first = await resolver.open({ context: CONTEXT, source, disposition: "main" });
    const second = await resolver.open({ context: CONTEXT, source, disposition: "main" });

    expect(first).toEqual({
      kind: "unresolvedFileCandidate",
      token: "dumm.md",
      opened: false,
    });
    expect(second.opened).toBe(true);
    expect(suggestions).toHaveBeenCalledTimes(2);
    expect(openWorkspaceFile).toHaveBeenCalledWith(
      {
        raw: "dumm.md",
        path: "/Users/test/project/docs/dumm.md",
        lineStart: undefined,
        lineEnd: undefined,
      },
      "main",
    );
    expect(openExternalUrl).not.toHaveBeenCalled();
    expect(onUnresolvedFileCandidate).toHaveBeenCalledTimes(1);
  });

  it("keys cache entries by server, workspace, and token", async () => {
    const suggestions = vi
      .fn()
      .mockResolvedValueOnce(resolvedSuggestions([{ path: "one/dumm.md", kind: "file" }]))
      .mockResolvedValueOnce(resolvedSuggestions([{ path: "two/dumm.md", kind: "file" }]));
    const openWorkspaceFile = vi.fn();
    const resolver = createAssistantFileLinkResolver({
      getDirectorySuggestions: suggestions,
      openWorkspaceFile,
      openExternalUrl: vi.fn(),
    });
    const source = { href: "http://dumm.md", text: "dumm.md", markup: "linkify" };

    await resolver.open({ context: CONTEXT, source, disposition: "main" });
    await resolver.open({
      context: { serverId: "server-1", workspaceRoot: "/Users/test/other" },
      source,
      disposition: "main",
    });

    expect(suggestions).toHaveBeenCalledTimes(2);
    expect(openWorkspaceFile).toHaveBeenLastCalledWith(
      {
        raw: "dumm.md",
        path: "/Users/test/other/two/dumm.md",
        lineStart: undefined,
        lineEnd: undefined,
      },
      "main",
    );
  });

  it("does not apply stale async results after the active context changes", async () => {
    const deferred = createDeferred<DirectorySuggestionResult>();
    let isCurrent = true;
    const openWorkspaceFile = vi.fn();
    const resolver = createAssistantFileLinkResolver({
      getDirectorySuggestions: vi.fn(() => deferred.promise),
      openWorkspaceFile,
      openExternalUrl: vi.fn(),
      isCurrentContext: () => isCurrent,
    });

    const opened = resolver.open({
      context: CONTEXT,
      source: { href: "http://dumm.md", text: "dumm.md", markup: "linkify" },
      disposition: "main",
    });
    isCurrent = false;
    deferred.resolve(resolvedSuggestions([{ path: "dumm.md", kind: "file" }]));
    const result = await opened;

    expect(openWorkspaceFile).not.toHaveBeenCalled();
    expect(result.opened).toBe(false);
    expect(result.kind).toBe("file");
  });

  it("opens direct workspace file links without querying suggestions", async () => {
    const suggestions = vi.fn(async () => resolvedSuggestions([]));
    const openWorkspaceFile = vi.fn();
    const resolver = createAssistantFileLinkResolver({
      getDirectorySuggestions: suggestions,
      openWorkspaceFile,
      openExternalUrl: vi.fn(),
    });

    const result = await resolver.open({
      context: CONTEXT,
      source: { href: "src/components/message.tsx#L33" },
      disposition: "main",
    });

    expect(suggestions).not.toHaveBeenCalled();
    expect(openWorkspaceFile).toHaveBeenCalledWith(
      {
        raw: "src/components/message.tsx#L33",
        path: "/Users/test/project/src/components/message.tsx",
        lineStart: 33,
        lineEnd: undefined,
      },
      "main",
    );
    expect(result.opened).toBe(true);
  });

  it("preserves direct workspace file line ranges", async () => {
    const openWorkspaceFile = vi.fn();
    const resolver = createAssistantFileLinkResolver({
      getDirectorySuggestions: vi.fn(async () => resolvedSuggestions([])),
      openWorkspaceFile,
      openExternalUrl: vi.fn(),
    });

    await resolver.open({
      context: CONTEXT,
      source: { href: "src/components/message.tsx:33-40" },
      disposition: "main",
    });

    expect(openWorkspaceFile).toHaveBeenCalledWith(
      {
        raw: "src/components/message.tsx:33-40",
        path: "/Users/test/project/src/components/message.tsx",
        lineStart: 33,
        lineEnd: 40,
      },
      "main",
    );
  });

  it("opens basename line refs when the daemon returns that exact filename", async () => {
    const workspaceFiles = new FakeWorkspaceFiles({
      "file.ts": [{ path: "packages/app/src/file.ts", kind: "file" }],
    });
    const resolver = workspaceFiles.createResolver();

    const result = await resolver.open({
      context: { ...CONTEXT, workspaceRoot: "/Users/test/project" },
      source: {
        href: "file.ts:12",
        text: "file.ts:12",
        sourceType: "inline-code",
      },
      disposition: "main",
    });

    expect(workspaceFiles.searches).toEqual([
      {
        query: "file.ts",
        cwd: "/Users/test/project",
        includeFiles: true,
        includeDirectories: false,
        matchMode: "suffix",
        limit: 1,
      },
    ]);
    expect(workspaceFiles.openedFiles).toEqual([
      {
        target: {
          raw: "file.ts:12",
          path: "/Users/test/project/packages/app/src/file.ts",
          lineStart: 12,
          lineEnd: undefined,
        },
        disposition: "main",
      },
    ]);
    expect(result.opened).toBe(true);
  });

  it("reports inline-code subpaths as unresolved when suffix suggestions find no file", async () => {
    const workspaceFiles = new FakeWorkspaceFiles({});
    const resolver = workspaceFiles.createResolver();

    const result = await resolver.open({
      context: { ...CONTEXT, workspaceRoot: "/Users/test/project" },
      source: {
        href: "src/file.ts",
        text: "src/file.ts",
        sourceType: "inline-code",
      },
      disposition: "main",
    });

    expect(workspaceFiles.searches).toEqual([
      {
        query: "src/file.ts",
        cwd: "/Users/test/project",
        includeFiles: true,
        includeDirectories: false,
        matchMode: "suffix",
        limit: 1,
      },
    ]);
    expect(workspaceFiles.openedFiles).toEqual([]);
    expect(workspaceFiles.unresolvedTokens).toEqual(["src/file.ts"]);
    expect(result).toEqual({
      kind: "unresolvedFileCandidate",
      token: "src/file.ts",
      opened: false,
    });
  });

  it("passes side open disposition to workspace file links", async () => {
    const openWorkspaceFile = vi.fn();
    const resolver = createAssistantFileLinkResolver({
      getDirectorySuggestions: vi.fn(async () => resolvedSuggestions([])),
      openWorkspaceFile,
      openExternalUrl: vi.fn(),
    });

    await resolver.open({
      context: CONTEXT,
      source: { href: "src/components/message.tsx#L33" },
      disposition: "side",
    });

    expect(openWorkspaceFile).toHaveBeenCalledWith(
      {
        raw: "src/components/message.tsx#L33",
        path: "/Users/test/project/src/components/message.tsx",
        lineStart: 33,
        lineEnd: undefined,
      },
      "side",
    );
  });

  it("keeps explicit external URLs external", async () => {
    const openExternalUrl = vi.fn();
    const resolver = createAssistantFileLinkResolver({
      getDirectorySuggestions: vi.fn(async () => resolvedSuggestions([])),
      openWorkspaceFile: vi.fn(),
      openExternalUrl,
    });

    const result = await resolver.open({
      context: CONTEXT,
      source: { href: "http://dumm.md", text: "dumm.md" },
      disposition: "main",
    });

    expect(openExternalUrl).toHaveBeenCalledWith("http://dumm.md");
    expect(result).toEqual({
      kind: "external",
      url: "http://dumm.md",
      opened: true,
    });
  });

  it("keeps auto-linkified normal domains external", async () => {
    const suggestions = vi.fn(async () => resolvedSuggestions([]));
    const openExternalUrl = vi.fn();
    const resolver = createAssistantFileLinkResolver({
      getDirectorySuggestions: suggestions,
      openWorkspaceFile: vi.fn(),
      openExternalUrl,
    });

    const result = await resolver.open({
      context: CONTEXT,
      source: { href: "http://google.com", text: "google.com", markup: "linkify" },
      disposition: "main",
    });

    expect(suggestions).not.toHaveBeenCalled();
    expect(openExternalUrl).toHaveBeenCalledWith("http://google.com");
    expect(result).toEqual({
      kind: "external",
      url: "http://google.com",
      opened: true,
    });
  });

  it("keeps auto-linkified normal domain paths external", async () => {
    const suggestions = vi.fn(async () => resolvedSuggestions([]));
    const openExternalUrl = vi.fn();
    const resolver = createAssistantFileLinkResolver({
      getDirectorySuggestions: suggestions,
      openWorkspaceFile: vi.fn(),
      openExternalUrl,
    });

    const result = await resolver.open({
      context: CONTEXT,
      source: { href: "http://openai.com/path", text: "openai.com/path", sourceInfo: "auto" },
      disposition: "main",
    });

    expect(suggestions).not.toHaveBeenCalled();
    expect(openExternalUrl).toHaveBeenCalledWith("http://openai.com/path");
    expect(result).toEqual({
      kind: "external",
      url: "http://openai.com/path",
      opened: true,
    });
  });

  it("does not open unresolved linkified markdown filenames in the browser", async () => {
    const openWorkspaceFile = vi.fn();
    const openExternalUrl = vi.fn();
    const onUnresolvedFileCandidate = vi.fn();
    const resolver = createAssistantFileLinkResolver({
      getDirectorySuggestions: vi.fn(async () => resolvedSuggestions([])),
      openWorkspaceFile,
      openExternalUrl,
      onUnresolvedFileCandidate,
    });

    const prefetchResult = await resolver.prefetch({
      context: CONTEXT,
      source: { href: "http://dumm.md", text: "dumm.md", sourceInfo: "auto" },
    });
    const result = await resolver.open({
      context: CONTEXT,
      source: { href: "http://dumm.md", text: "dumm.md", sourceInfo: "auto" },
      disposition: "main",
    });

    expect(openWorkspaceFile).not.toHaveBeenCalled();
    expect(openExternalUrl).not.toHaveBeenCalled();
    expect(prefetchResult).toEqual({
      kind: "unresolvedFileCandidate",
      token: "dumm.md",
    });
    expect(onUnresolvedFileCandidate).toHaveBeenCalledTimes(1);
    expect(onUnresolvedFileCandidate).toHaveBeenCalledWith("dumm.md");
    expect(result).toEqual({
      kind: "unresolvedFileCandidate",
      token: "dumm.md",
      opened: false,
    });
  });

  it("keeps failed ambiguous resolution out of the browser", async () => {
    const openExternalUrl = vi.fn();
    const onUnresolvedFileCandidate = vi.fn();
    const resolver = createAssistantFileLinkResolver({
      getDirectorySuggestions: vi.fn(async () => {
        throw new Error("daemon unavailable");
      }),
      openWorkspaceFile: vi.fn(),
      openExternalUrl,
      onUnresolvedFileCandidate,
    });

    const result = await resolver.open({
      context: CONTEXT,
      source: { href: "http://dumm.md", text: "dumm.md", markup: "linkify" },
      disposition: "main",
    });

    expect(openExternalUrl).not.toHaveBeenCalled();
    expect(onUnresolvedFileCandidate).toHaveBeenCalledWith("dumm.md");
    expect(result).toEqual({
      kind: "unresolvedFileCandidate",
      token: "dumm.md",
      opened: false,
    });
  });

  it("uses rendered text for markdown-it linkified tokens and href for explicit links", () => {
    expect(
      getAssistantFileLinkToken({
        href: "http://dumm.md",
        text: "dumm.md",
        markup: "linkify",
        sourceInfo: "auto",
      }),
    ).toBe("dumm.md");
    expect(
      getAssistantFileLinkToken({
        href: "http://google.com",
        text: "google.com",
        markup: "linkify",
        sourceInfo: "auto",
      }),
    ).toBe("http://google.com");
    expect(
      getAssistantFileLinkToken({
        href: "http://dumm.md",
        text: "dumm.md",
        markup: "",
        sourceInfo: "",
      }),
    ).toBe("http://dumm.md");
    expect(
      getAssistantFileLinkToken({
        href: "workspace-git-service.ts:1553",
        text: "workspace-git-service.ts:1553",
        sourceType: "inline-code",
      }),
    ).toBe("workspace-git-service.ts:1553");
  });
});
