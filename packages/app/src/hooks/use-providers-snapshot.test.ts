/**
 * @vitest-environment jsdom
 */
import React from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DaemonClient } from "@server/client/daemon-client";
import { useSessionStore } from "@/stores/session-store";
import {
  providersSnapshotQueryKey,
  shouldApplyProvidersSnapshotUpdate,
  useProvidersSnapshot,
} from "./use-providers-snapshot";

const { mockClient, mockRuntime } = vi.hoisted(() => {
  const mockClient = {
    getProvidersSnapshot: vi.fn(),
    refreshProvidersSnapshot: vi.fn(),
    on: vi.fn(() => () => {}),
  };
  return {
    mockClient,
    mockRuntime: {
      client: mockClient,
      isConnected: true,
    },
  };
});

vi.mock("@/runtime/host-runtime", () => ({
  useHostRuntimeClient: () => mockRuntime.client,
  useHostRuntimeIsConnected: () => mockRuntime.isConnected,
}));

const serverId = "server-1";

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

function enableProvidersSnapshot(): void {
  act(() => {
    useSessionStore.getState().initializeSession(serverId, mockClient as unknown as DaemonClient);
    useSessionStore.getState().updateSessionServerInfo(serverId, {
      serverId,
      hostname: "localhost",
      version: "test",
      features: { providersSnapshot: true },
    } as never);
  });
}

function renderProvidersSnapshotHook(cwd?: string | null) {
  const queryClient = createQueryClient();
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);

  return renderHook(() => useProvidersSnapshot(serverId, cwd), { wrapper });
}

afterEach(() => {
  act(() => {
    useSessionStore.getState().clearSession(serverId);
  });
  vi.clearAllMocks();
});

describe("providers snapshot hook cache scope", () => {
  it("uses no cwd in the settings query key", () => {
    expect(providersSnapshotQueryKey(serverId)).toEqual(["providersSnapshot", serverId, null]);
  });

  it("accepts concrete home update events for settings snapshots", () => {
    expect(shouldApplyProvidersSnapshotUpdate(undefined, "/Users/alex")).toBe(true);
    expect(shouldApplyProvidersSnapshotUpdate(null, "/home/alex")).toBe(true);
  });

  it("keeps workspace snapshot updates scoped to matching cwd keys", () => {
    expect(shouldApplyProvidersSnapshotUpdate("/Users/alex/project", "/Users/alex/project")).toBe(
      true,
    );
    expect(
      shouldApplyProvidersSnapshotUpdate("/Users/alex/project-a", "/Users/alex/project-b"),
    ).toBe(false);
    expect(shouldApplyProvidersSnapshotUpdate("/Users/alex/project", "/Users/alex")).toBe(false);
  });

  it("sends no cwd for settings snapshot loads and refreshes", async () => {
    enableProvidersSnapshot();
    mockClient.getProvidersSnapshot.mockResolvedValue({
      entries: [],
      generatedAt: "2026-01-01T00:00:00.000Z",
      requestId: "settings",
    });
    mockClient.refreshProvidersSnapshot.mockResolvedValue({
      acknowledged: true,
      requestId: "settings-refresh",
    });

    const { result } = renderProvidersSnapshotHook();

    await waitFor(() => {
      expect(mockClient.getProvidersSnapshot).toHaveBeenCalledWith({});
    });

    await act(async () => {
      await result.current.refresh(["codex"]);
    });

    expect(mockClient.refreshProvidersSnapshot).toHaveBeenCalledWith({ providers: ["codex"] });
    expect(mockClient.getProvidersSnapshot).toHaveBeenLastCalledWith({});
  });

  it("sends cwd for workspace snapshot loads and refreshes", async () => {
    enableProvidersSnapshot();
    mockClient.getProvidersSnapshot.mockResolvedValue({
      entries: [],
      generatedAt: "2026-01-01T00:00:00.000Z",
      requestId: "workspace",
    });
    mockClient.refreshProvidersSnapshot.mockResolvedValue({
      acknowledged: true,
      requestId: "workspace-refresh",
    });

    const { result } = renderProvidersSnapshotHook("/repo");

    await waitFor(() => {
      expect(mockClient.getProvidersSnapshot).toHaveBeenCalledWith({ cwd: "/repo" });
    });

    await act(async () => {
      await result.current.refresh(["codex"]);
    });

    expect(mockClient.refreshProvidersSnapshot).toHaveBeenCalledWith({
      cwd: "/repo",
      providers: ["codex"],
    });
    expect(mockClient.getProvidersSnapshot).toHaveBeenLastCalledWith({ cwd: "/repo" });
  });
});
