import { router, type Href } from "expo-router";
import { useSessionStore } from "@/stores/session-store";
import { getHostRuntimeStore, isHostRuntimeConnected } from "@/runtime/host-runtime";
import { resolveNavigateToAgent, type NavigateToAgentInput } from "./resolve";
import { navigateToPreparedWorkspaceTab } from "@/utils/workspace-navigation";

export type { NavigateToAgentInput } from "./resolve";

// Clears the transient restoring state if the daemon resolves refreshAgent without
// re-emitting a workspace_update (the directory-gone case), so the gate never spins forever.
const RESTORE_TIMEOUT_MS = 7000;

function restoreArchivedWorkspace(serverId: string, agentId: string, workspaceId: string): void {
  const snapshot = getHostRuntimeStore().getSnapshot(serverId);
  const client = snapshot?.client ?? null;
  if (!client || !isHostRuntimeConnected(snapshot)) {
    return;
  }

  const store = useSessionStore.getState();
  const session = store.sessions[serverId];
  // Self-gate: only an archived agent whose workspace is absent needs restoring.
  // A still-present workspace or an in-flight restore is a no-op; fire-once is
  // derived from store state.
  const agent = session?.agents.get(agentId) ?? session?.agentDetails.get(agentId);
  if (!agent?.archivedAt) {
    return;
  }
  if (session?.workspaces.has(workspaceId)) {
    return;
  }
  if (session?.restoringWorkspaces.get(workspaceId) === "restoring") {
    return;
  }

  store.setWorkspaceRestoreStatus(serverId, workspaceId, "restoring");
  // The reducer guards "failed" so a late timeout after the descriptor lands is a no-op.
  setTimeout(
    () => useSessionStore.getState().setWorkspaceRestoreStatus(serverId, workspaceId, "failed"),
    RESTORE_TIMEOUT_MS,
  );
  client
    .refreshAgent(agentId)
    .catch(() =>
      useSessionStore.getState().setWorkspaceRestoreStatus(serverId, workspaceId, "failed"),
    );
}

export function navigateToAgent(input: NavigateToAgentInput): string {
  return resolveNavigateToAgent(input, {
    readAgentNavTarget: ({ serverId, agentId }) => {
      const session = useSessionStore.getState().sessions[serverId];
      const agent = session?.agents.get(agentId) ?? session?.agentDetails.get(agentId);
      return {
        agentWorkspaceId: agent?.workspaceId,
      };
    },
    navigateToHostAgent: (route) => {
      router.navigate(route as Href);
    },
    navigateToPreparedWorkspaceTab,
    restoreArchivedWorkspace: ({ serverId, agentId, workspaceId }) => {
      restoreArchivedWorkspace(serverId, agentId, workspaceId);
    },
  });
}
