import { useCallback } from "react";
import { router } from "expo-router";
import {
  activateNavigationWorkspaceSelection,
  getNavigationActiveWorkspaceSelection,
} from "@/stores/navigation-active-workspace-store";
import { buildHostWorkspaceRoute } from "@/utils/host-routes";

/**
 * Open a workspace. Once the workspace shell is mounted, switching workspaces
 * is app-level state so native-stack does not rebuild every retained screen.
 */
export function navigateToWorkspace(serverId: string, workspaceId: string) {
  const activeWorkspace = getNavigationActiveWorkspaceSelection();
  if (activeWorkspace) {
    activateNavigationWorkspaceSelection(
      { serverId, workspaceId },
      { updateBrowserHistory: true, historyMode: "push" },
    );
    return;
  }

  const href = buildHostWorkspaceRoute(serverId, workspaceId);
  router.navigate(href as any);
}

export function useWorkspaceNavigation() {
  return {
    navigateToWorkspace: useCallback((serverId: string, workspaceId: string) => {
      navigateToWorkspace(serverId, workspaceId);
    }, []),
  };
}
