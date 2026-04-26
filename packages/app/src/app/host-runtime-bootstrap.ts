import type { HostRuntimeBootstrapResult } from "@/runtime/host-runtime";
import type { Settings } from "@/hooks/use-settings";
import type { ActiveWorkspaceSelection } from "@/stores/navigation-active-workspace-store";
import {
  getLastNavigationWorkspaceRouteSelection,
  hydrateLastNavigationWorkspaceRouteSelection,
} from "@/stores/navigation-active-workspace-store";

type HostRuntimeBootstrapPhase = "starting-daemon" | "connecting" | "online" | "error";

export type StartupNavigationTarget = { serverId: string } | null;

interface HostRuntimeBootstrapStore {
  loadFromStorage: () => Promise<void>;
  bootstrap: (options?: { manageBuiltInDaemon?: boolean }) => Promise<void>;
  bootstrapDesktop: () => Promise<HostRuntimeBootstrapResult>;
  addConnectionFromListenAndWaitForOnline: (input: {
    listenAddress: string;
    serverId: string;
    hostname: string | null;
  }) => Promise<unknown>;
  waitForAnyConnectionOnline: (input?: { preferredServerId?: string | null }) => {
    promise: Promise<StartupNavigationTarget>;
    cancel: () => void;
  };
}

export async function initializeHostRuntime(args: {
  shouldManageDesktop: boolean;
  loadSettings: () => Promise<Settings>;
  loadStartupWorkspaceSelection?: () => Promise<ActiveWorkspaceSelection | null>;
  store: HostRuntimeBootstrapStore;
  setPhase: (phase: HostRuntimeBootstrapPhase) => void;
  setError: (error: string | null) => void;
  isCancelled: () => boolean;
  signal?: AbortSignal;
}): Promise<StartupNavigationTarget> {
  const {
    shouldManageDesktop,
    loadSettings,
    loadStartupWorkspaceSelection = readStartupWorkspaceSelection,
    store,
    setPhase,
    setError,
    isCancelled,
    signal,
  } = args;

  const settings = await loadSettings();
  const isDesktopManaged = shouldManageDesktop && settings.manageBuiltInDaemon;
  await store.loadFromStorage();

  if (!isDesktopManaged) {
    setPhase("connecting");
    setError(null);
    await store.bootstrap({ manageBuiltInDaemon: settings.manageBuiltInDaemon });
  } else {
    const setupResult = await setupDesktopManagedConnection({
      store,
      setPhase,
      setError,
      isCancelled,
    });
    if (setupResult.type === "error") {
      return null;
    }
  }

  const startupWorkspaceSelection = await loadStartupWorkspaceSelection();

  const target = await waitForStartupNavigationTarget({
    store,
    preferredServerId: startupWorkspaceSelection?.serverId ?? null,
    signal,
  });

  if (!isCancelled()) {
    setPhase("online");
    setError(null);
  }

  return target;
}

async function setupDesktopManagedConnection(input: {
  store: HostRuntimeBootstrapStore;
  setPhase: (phase: HostRuntimeBootstrapPhase) => void;
  setError: (error: string | null) => void;
  isCancelled: () => boolean;
}): Promise<BootstrapOutcome> {
  const { store, setPhase, setError, isCancelled } = input;

  setPhase("starting-daemon");
  setError(null);

  try {
    const bootstrapResult = await store.bootstrapDesktop();
    if (!bootstrapResult.ok) {
      if (!isCancelled()) {
        setPhase("error");
        setError(bootstrapResult.error);
      }
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
    const message = error instanceof Error ? error.message : String(error);
    if (!isCancelled()) {
      setPhase("error");
      setError(message);
    }
    return { type: "error", error: message };
  }
}

function waitForStartupNavigationTarget(input: {
  store: HostRuntimeBootstrapStore;
  preferredServerId: string | null;
  signal?: AbortSignal;
}): Promise<StartupNavigationTarget> {
  const { store, preferredServerId, signal } = input;

  if (signal?.aborted) {
    return Promise.resolve(null);
  }

  const onlineWait = store.waitForAnyConnectionOnline({ preferredServerId });

  return new Promise<StartupNavigationTarget>((resolve) => {
    let settled = false;

    const settle = (target: StartupNavigationTarget): void => {
      if (settled) {
        return;
      }
      settled = true;
      signal?.removeEventListener("abort", abort);
      onlineWait.cancel();
      resolve(target);
    };

    const abort = (): void => {
      settle(null);
    };

    signal?.addEventListener("abort", abort, { once: true });
    onlineWait.promise.then((target) => {
      settle(target);
      return undefined;
    });
  });
}

type BootstrapOutcome = { type: "online" } | { type: "error"; error: string };

async function readStartupWorkspaceSelection(): Promise<ActiveWorkspaceSelection | null> {
  await hydrateLastNavigationWorkspaceRouteSelection();
  return getLastNavigationWorkspaceRouteSelection();
}
