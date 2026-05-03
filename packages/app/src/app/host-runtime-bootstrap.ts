import type { ActiveWorkspaceSelection } from "@/stores/navigation-active-workspace-store";
import type { DaemonStartResult } from "@/runtime/daemon-start-service";
import type { Href } from "expo-router";
import { buildHostRootRoute, buildHostWorkspaceRoute } from "@/utils/host-routes";

export interface HostRuntimeBootstrapStore {
  boot: () => void;
}

export interface HostRuntimeBootstrapDaemonStartService {
  start: () => Promise<DaemonStartResult>;
}

type HostRuntimeBootstrapStartGate = boolean | (() => boolean | Promise<boolean>);

export interface StartHostRuntimeBootstrapInput {
  store: HostRuntimeBootstrapStore;
  daemonStartService: HostRuntimeBootstrapDaemonStartService;
  shouldStartDaemon: HostRuntimeBootstrapStartGate;
}

export function startHostRuntimeBootstrap(input: StartHostRuntimeBootstrapInput): void {
  input.store.boot();
  startDaemonIfGateAllows({
    daemonStartService: input.daemonStartService,
    shouldStartDaemon: input.shouldStartDaemon,
  });
}

export function startDaemonIfGateAllows(input: {
  daemonStartService: HostRuntimeBootstrapDaemonStartService;
  shouldStartDaemon: HostRuntimeBootstrapStartGate;
}): void {
  if (typeof input.shouldStartDaemon === "boolean") {
    if (input.shouldStartDaemon) {
      void input.daemonStartService.start();
    }
    return;
  }

  void Promise.resolve(input.shouldStartDaemon()).then((shouldStartDaemon) => {
    if (shouldStartDaemon) {
      void input.daemonStartService.start();
    }
    return;
  });
}

export const WELCOME_ROUTE: Href = "/welcome";

export interface ResolveStartupRedirectInput {
  pathname: string;
  anyOnlineHostServerId: string | null;
  workspaceSelection: ActiveWorkspaceSelection | null;
  isWorkspaceSelectionLoaded: boolean;
  hasGivenUpWaitingForHost: boolean;
}

export function resolveStartupRedirectRoute(input: ResolveStartupRedirectInput): Href | null {
  if (input.pathname !== "/" && input.pathname !== "") {
    return null;
  }
  if (!input.isWorkspaceSelectionLoaded) {
    return null;
  }

  if (input.anyOnlineHostServerId) {
    if (
      input.workspaceSelection &&
      input.workspaceSelection.serverId === input.anyOnlineHostServerId
    ) {
      return buildHostWorkspaceRoute(
        input.workspaceSelection.serverId,
        input.workspaceSelection.workspaceId,
      );
    }
    return buildHostRootRoute(input.anyOnlineHostServerId);
  }

  if (input.hasGivenUpWaitingForHost) {
    return WELCOME_ROUTE;
  }

  return null;
}
