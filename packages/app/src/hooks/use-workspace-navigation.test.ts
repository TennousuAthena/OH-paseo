import { beforeEach, describe, expect, it, vi } from "vitest";

const { dismissToMock } = vi.hoisted(() => ({
  dismissToMock: vi.fn(),
}));

vi.mock("expo-router", () => ({
  router: {
    dismissTo: dismissToMock,
  },
}));

import { navigateToWorkspace } from "@/hooks/use-workspace-navigation";
import {
  activateNavigationWorkspaceSelection,
  getNavigationActiveWorkspaceSelection,
  syncNavigationActiveWorkspace,
} from "@/stores/navigation-active-workspace-store";

describe("navigateToWorkspace", () => {
  beforeEach(() => {
    dismissToMock.mockReset();
    syncNavigationActiveWorkspace({ current: null });
  });

  it("dismisses to the workspace route from a non-workspace route even when active selection is stale", () => {
    activateNavigationWorkspaceSelection({
      serverId: "server-1",
      workspaceId: "workspace-a",
    });

    navigateToWorkspace("server-1", "workspace-b", {
      currentPathname: "/h/server-1/sessions",
    });

    expect(dismissToMock).toHaveBeenCalledWith("/h/server-1/workspace/workspace-b");
    expect(getNavigationActiveWorkspaceSelection()).toEqual({
      serverId: "server-1",
      workspaceId: "workspace-a",
    });
  });

  it("keeps retained workspace switching on a workspace route", () => {
    activateNavigationWorkspaceSelection({
      serverId: "server-1",
      workspaceId: "workspace-a",
    });

    navigateToWorkspace("server-1", "workspace-b", {
      currentPathname: "/h/server-1/workspace/workspace-a",
    });

    expect(dismissToMock).not.toHaveBeenCalled();
    expect(getNavigationActiveWorkspaceSelection()).toEqual({
      serverId: "server-1",
      workspaceId: "workspace-b",
    });
  });
});
