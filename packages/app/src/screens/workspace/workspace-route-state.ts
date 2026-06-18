import type { HostRuntimeConnectionStatus } from "@/runtime/host-runtime";
import type { WorkspaceDescriptor } from "@/stores/session-store";

export type WorkspaceRouteState =
  | { kind: "ready" }
  | {
      kind: "reconnecting";
      hostName: string;
      connectionStatus: Exclude<HostRuntimeConnectionStatus, "online">;
      lastError: string | null;
    }
  | {
      kind: "unreachable";
      hostName: string;
      connectionStatus: Exclude<HostRuntimeConnectionStatus, "online">;
      lastError: string | null;
    }
  | { kind: "loading"; hostName: string }
  | { kind: "restoring"; hostName: string }
  | { kind: "missing"; hostName: string; restoreFailed: boolean };

export function resolveWorkspaceRouteState(input: {
  hostName: string;
  connectionStatus: HostRuntimeConnectionStatus;
  lastError: string | null;
  workspace: WorkspaceDescriptor | null;
  hasHydratedWorkspaces: boolean;
  restoreStatus: "restoring" | "failed" | null;
}): WorkspaceRouteState {
  if (input.workspace) {
    if (input.connectionStatus === "online") {
      return { kind: "ready" };
    }

    return {
      kind: "reconnecting",
      hostName: input.hostName,
      connectionStatus: input.connectionStatus,
      lastError: input.lastError,
    };
  }

  if (input.connectionStatus === "online") {
    if (input.restoreStatus === "restoring") {
      return { kind: "restoring", hostName: input.hostName };
    }

    if (input.hasHydratedWorkspaces) {
      return {
        kind: "missing",
        hostName: input.hostName,
        restoreFailed: input.restoreStatus === "failed",
      };
    }

    return { kind: "loading", hostName: input.hostName };
  }

  return {
    kind: "unreachable",
    hostName: input.hostName,
    connectionStatus: input.connectionStatus,
    lastError: input.lastError,
  };
}
