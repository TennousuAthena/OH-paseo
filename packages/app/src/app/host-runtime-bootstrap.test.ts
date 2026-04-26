import { describe, expect, it, vi } from "vitest";
import { initializeHostRuntime } from "./host-runtime-bootstrap";

describe("initializeHostRuntime", () => {
  it("uses effective desktop settings to skip desktop-managed bootstrap when daemon management is disabled", async () => {
    const loadFromStorage = vi.fn(async () => {});
    const bootstrap = vi.fn(async () => {});
    const bootstrapDesktop = vi.fn(async () => ({
      ok: true as const,
      listenAddress: "127.0.0.1:6767",
      serverId: "srv_test",
      hostname: "test",
    }));
    const addConnectionFromListenAndWaitForOnline = vi.fn(async () => {});
    const setPhase = vi.fn();
    const setError = vi.fn();

    await initializeHostRuntime({
      shouldManageDesktop: true,
      loadSettings: async () => ({
        theme: "auto",
        sendBehavior: "interrupt",
        manageBuiltInDaemon: false,
        releaseChannel: "stable",
      }),
      store: {
        loadFromStorage,
        bootstrap,
        bootstrapDesktop,
        addConnectionFromListenAndWaitForOnline,
        waitForAnyConnectionOnline: () => ({
          promise: new Promise<{ type: "online" }>(() => {}),
          cancel: vi.fn(),
        }),
      },
      setPhase,
      setError,
      isCancelled: () => false,
    });

    expect(bootstrap).toHaveBeenCalledWith({ manageBuiltInDaemon: false });
    expect(setPhase).toHaveBeenLastCalledWith("online");
    expect(setError).toHaveBeenLastCalledWith(null);
  });

  it("does not regress the phase to connecting when anyOnline wins the race before bootstrapDesktop returns", async () => {
    let resolveBootstrapDesktop!: () => void;
    const bootstrapDesktopGate = new Promise<void>((resolve) => {
      resolveBootstrapDesktop = resolve;
    });

    let resolveAddConnection!: () => void;
    const addConnectionCompleted = new Promise<void>((resolve) => {
      resolveAddConnection = resolve;
    });

    const setPhase = vi.fn();
    const setError = vi.fn();

    const initPromise = initializeHostRuntime({
      shouldManageDesktop: true,
      loadSettings: async () => ({
        theme: "auto",
        sendBehavior: "interrupt",
        manageBuiltInDaemon: true,
        releaseChannel: "stable",
      }),
      store: {
        loadFromStorage: async () => {},
        bootstrap: async () => {},
        bootstrapDesktop: async () => {
          await bootstrapDesktopGate;
          return {
            ok: true as const,
            listenAddress: "127.0.0.1:6767",
            serverId: "srv_test",
            hostname: "test",
          };
        },
        addConnectionFromListenAndWaitForOnline: async () => {
          resolveAddConnection();
        },
        waitForAnyConnectionOnline: () => ({
          promise: Promise.resolve(),
          cancel: vi.fn(),
        }),
      },
      setPhase,
      setError,
      isCancelled: () => false,
    });

    await initPromise;
    expect(setPhase).toHaveBeenLastCalledWith("online");

    resolveBootstrapDesktop();
    await addConnectionCompleted;
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(setPhase).not.toHaveBeenCalledWith("connecting");
    expect(setPhase).toHaveBeenLastCalledWith("online");
  });
});
