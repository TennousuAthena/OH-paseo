import { describe, expect, it, vi } from "vitest";
import { initializeHostRuntime } from "./host-runtime-bootstrap";

type BootstrapStore = Parameters<typeof initializeHostRuntime>[0]["store"];

function createSettings(input: { manageBuiltInDaemon: boolean }) {
  return {
    theme: "auto" as const,
    sendBehavior: "interrupt" as const,
    manageBuiltInDaemon: input.manageBuiltInDaemon,
    releaseChannel: "stable" as const,
  };
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function createStore(overrides: Partial<BootstrapStore> = {}): BootstrapStore {
  return {
    loadFromStorage: vi.fn(async () => {}),
    bootstrap: vi.fn(async () => {}),
    bootstrapDesktop: vi.fn(async () => ({
      ok: true as const,
      listenAddress: "127.0.0.1:6767",
      serverId: "srv_test",
      hostname: "test",
    })),
    addConnectionFromListenAndWaitForOnline: vi.fn(async () => {}),
    waitForAnyConnectionOnline: vi.fn(() => ({
      promise: Promise.resolve({ serverId: "srv_test" }),
      cancel: vi.fn(),
    })),
    ...overrides,
  };
}

describe("initializeHostRuntime", () => {
  it("uses effective desktop settings to skip desktop-managed bootstrap when daemon management is disabled", async () => {
    const store = createStore();
    const setPhase = vi.fn();
    const setError = vi.fn();

    const target = await initializeHostRuntime({
      shouldManageDesktop: true,
      loadSettings: async () => createSettings({ manageBuiltInDaemon: false }),
      loadStartupWorkspaceSelection: async () => null,
      store,
      setPhase,
      setError,
      isCancelled: () => false,
    });

    expect(store.bootstrap).toHaveBeenCalledWith({ manageBuiltInDaemon: false });
    expect(store.bootstrapDesktop).not.toHaveBeenCalled();
    expect(target).toEqual({ serverId: "srv_test" });
    expect(setPhase).toHaveBeenLastCalledWith("online");
    expect(setError).toHaveBeenLastCalledWith(null);
  });

  it("waits for any saved host after non-managed connection setup before setting online", async () => {
    const events: string[] = [];
    const wait = createDeferred<{ serverId: string } | null>();
    const store = createStore({
      bootstrap: vi.fn(async () => {
        events.push("bootstrap");
      }),
      waitForAnyConnectionOnline: vi.fn(() => {
        events.push("wait");
        return {
          promise: wait.promise,
          cancel: vi.fn(),
        };
      }),
    });
    const setPhase = vi.fn((phase: string) => events.push(`phase:${phase}`));

    const initPromise = initializeHostRuntime({
      shouldManageDesktop: false,
      loadSettings: async () => createSettings({ manageBuiltInDaemon: false }),
      loadStartupWorkspaceSelection: async () => {
        events.push("read-workspace-selection");
        return null;
      },
      store,
      setPhase,
      setError: vi.fn(),
      isCancelled: () => false,
    });

    await vi.waitFor(() => {
      expect(events).toEqual(["phase:connecting", "bootstrap", "read-workspace-selection", "wait"]);
    });
    expect(setPhase).not.toHaveBeenCalledWith("online");

    wait.resolve({ serverId: "srv_saved" });
    await expect(initPromise).resolves.toEqual({ serverId: "srv_saved" });
    expect(setPhase).toHaveBeenLastCalledWith("online");
  });

  it("passes the startup workspace server id into the shared wait", async () => {
    const store = createStore();

    await initializeHostRuntime({
      shouldManageDesktop: false,
      loadSettings: async () => createSettings({ manageBuiltInDaemon: false }),
      loadStartupWorkspaceSelection: async () => ({
        serverId: "srv_workspace",
        workspaceId: "workspace-1",
      }),
      store,
      setPhase: vi.fn(),
      setError: vi.fn(),
      isCancelled: () => false,
    });

    expect(store.waitForAnyConnectionOnline).toHaveBeenCalledWith({
      preferredServerId: "srv_workspace",
    });
  });

  it("passes a null preference into the shared wait when no startup workspace is persisted", async () => {
    const store = createStore();

    await initializeHostRuntime({
      shouldManageDesktop: false,
      loadSettings: async () => createSettings({ manageBuiltInDaemon: false }),
      loadStartupWorkspaceSelection: async () => null,
      store,
      setPhase: vi.fn(),
      setError: vi.fn(),
      isCancelled: () => false,
    });

    expect(store.waitForAnyConnectionOnline).toHaveBeenCalledWith({ preferredServerId: null });
  });

  it("uses desktop daemon startup only as the managed connection producer before the shared wait", async () => {
    const events: string[] = [];
    const store = createStore({
      bootstrapDesktop: vi.fn(async () => {
        events.push("bootstrap-desktop");
        return {
          ok: true as const,
          listenAddress: "127.0.0.1:6767",
          serverId: "srv_desktop",
          hostname: "desktop",
        };
      }),
      addConnectionFromListenAndWaitForOnline: vi.fn(async () => {
        events.push("add-connection");
      }),
      waitForAnyConnectionOnline: vi.fn(() => {
        events.push("wait");
        return {
          promise: Promise.resolve({ serverId: "srv_desktop" }),
          cancel: vi.fn(),
        };
      }),
    });
    const setPhase = vi.fn((phase: string) => events.push(`phase:${phase}`));

    const target = await initializeHostRuntime({
      shouldManageDesktop: true,
      loadSettings: async () => createSettings({ manageBuiltInDaemon: true }),
      loadStartupWorkspaceSelection: async () => {
        events.push("read-workspace-selection");
        return null;
      },
      store,
      setPhase,
      setError: vi.fn(),
      isCancelled: () => false,
    });

    expect(target).toEqual({ serverId: "srv_desktop" });
    expect(events).toEqual([
      "phase:starting-daemon",
      "bootstrap-desktop",
      "phase:connecting",
      "add-connection",
      "read-workspace-selection",
      "wait",
      "phase:online",
    ]);
    expect(store.bootstrap).not.toHaveBeenCalled();
  });

  it("returns null without waiting when there are no saved hosts", async () => {
    const store = createStore({
      waitForAnyConnectionOnline: vi.fn(() => ({
        promise: Promise.resolve(null),
        cancel: vi.fn(),
      })),
    });

    const target = await initializeHostRuntime({
      shouldManageDesktop: false,
      loadSettings: async () => createSettings({ manageBuiltInDaemon: false }),
      loadStartupWorkspaceSelection: async () => null,
      store,
      setPhase: vi.fn(),
      setError: vi.fn(),
      isCancelled: () => false,
    });

    expect(target).toBeNull();
    expect(store.waitForAnyConnectionOnline).toHaveBeenCalledWith({ preferredServerId: null });
  });

  it("cancels the shared wait while initialization is still pending", async () => {
    const abortController = new AbortController();
    const wait = createDeferred<{ serverId: string } | null>();
    const cancel = vi.fn();
    const store = createStore({
      waitForAnyConnectionOnline: vi.fn(() => ({
        promise: wait.promise,
        cancel,
      })),
    });
    const setPhase = vi.fn();

    const initPromise = initializeHostRuntime({
      shouldManageDesktop: false,
      loadSettings: async () => createSettings({ manageBuiltInDaemon: false }),
      loadStartupWorkspaceSelection: async () => null,
      store,
      setPhase,
      setError: vi.fn(),
      isCancelled: () => true,
      signal: abortController.signal,
    });

    await vi.waitFor(() => {
      expect(store.waitForAnyConnectionOnline).toHaveBeenCalled();
    });
    abortController.abort();

    await expect(initPromise).resolves.toBeNull();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(setPhase).not.toHaveBeenCalledWith("online");
  });
});
