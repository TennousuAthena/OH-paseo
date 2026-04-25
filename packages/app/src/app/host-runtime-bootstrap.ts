import type { HostRuntimeBootstrapResult } from "@/runtime/host-runtime";
import type { Settings } from "@/hooks/use-settings";

type HostRuntimeBootstrapPhase = "starting-daemon" | "connecting" | "online" | "error";

interface HostRuntimeBootstrapStore {
  loadFromStorage: () => Promise<void>;
  bootstrap: (options?: { manageBuiltInDaemon?: boolean }) => Promise<void>;
  bootstrapDesktop: () => Promise<HostRuntimeBootstrapResult>;
  addConnectionFromListenAndWaitForOnline: (input: {
    listenAddress: string;
    serverId: string;
    hostname: string | null;
  }) => Promise<unknown>;
  waitForAnyConnectionOnline: () => {
    promise: Promise<unknown>;
    cancel: () => void;
  };
}

export async function initializeHostRuntime(args: {
  shouldManageDesktop: boolean;
  loadSettings: () => Promise<Settings>;
  store: HostRuntimeBootstrapStore;
  setPhase: (phase: HostRuntimeBootstrapPhase) => void;
  setError: (error: string | null) => void;
  isCancelled: () => boolean;
}): Promise<() => void> {
  const { shouldManageDesktop, loadSettings, store, setPhase, setError, isCancelled } = args;

  const settings = await loadSettings();
  const isDesktopManaged = shouldManageDesktop && settings.manageBuiltInDaemon;
  await store.loadFromStorage();

  if (!isDesktopManaged) {
    setPhase("connecting");
    setError(null);
    await store.bootstrap({ manageBuiltInDaemon: settings.manageBuiltInDaemon });
    if (!isCancelled()) {
      setPhase("online");
      setError(null);
    }
    return () => {};
  }

  setPhase("starting-daemon");
  setError(null);

  const anyOnline = store.waitForAnyConnectionOnline();

  const bootstrapPromise = (async (): Promise<BootstrapOutcome> => {
    try {
      const bootstrapResult = await store.bootstrapDesktop();
      if (!bootstrapResult.ok) {
        return { type: "error", error: bootstrapResult.error };
      }
      if (!isCancelled()) {
        setPhase("connecting");
      }
      await store.addConnectionFromListenAndWaitForOnline({
        listenAddress: bootstrapResult.listenAddress,
        serverId: bootstrapResult.serverId,
        hostname: bootstrapResult.hostname,
      });
      return { type: "online" };
    } catch (error) {
      return {
        type: "error",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  })();

  const onlineFromAny: Promise<BootstrapOutcome> = anyOnline.promise.then(() => ({
    type: "online",
  }));
  const result = await Promise.race([onlineFromAny, bootstrapPromise]);

  anyOnline.cancel();

  if (!isCancelled()) {
    if (result.type === "online") {
      setPhase("online");
      setError(null);
    } else {
      setPhase("error");
      setError(result.error);
    }
  }

  return () => {
    anyOnline.cancel();
  };
}

type BootstrapOutcome = { type: "online" } | { type: "error"; error: string };
