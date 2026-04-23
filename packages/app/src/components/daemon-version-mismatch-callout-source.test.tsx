/**
 * @vitest-environment jsdom
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SidebarCalloutProvider } from "@/contexts/sidebar-callout-context";
import { SidebarCalloutSlot } from "./sidebar-callout-slot";

const { theme } = vi.hoisted(() => ({
  theme: {
    spacing: { 0: 0, 1: 4, 2: 8, 3: 12, 4: 16 },
    borderWidth: { 1: 1 },
    borderRadius: { md: 6 },
    fontSize: { xs: 11, sm: 13 },
    fontWeight: { medium: "500", semibold: "600" },
    colors: {
      surface0: "#000",
      foreground: "#fff",
      foregroundMuted: "#aaa",
      border: "#555",
      destructive: "#f44",
    },
  },
}));

const asyncStorage = vi.hoisted(() => ({
  values: new Map<string, string>(),
  getItem: vi.fn(async (key: string) => asyncStorage.values.get(key) ?? null),
  setItem: vi.fn(async (key: string, value: string) => {
    asyncStorage.values.set(key, value);
  }),
}));

const hostsState = vi.hoisted(() => ({
  value: [{ serverId: "server-1", label: "Local daemon" }],
}));

const sessionState = vi.hoisted(() => ({
  value: {
    sessions: {
      "server-1": {
        serverInfo: {
          serverId: "server-1",
          hostname: "MacBook",
          version: "1.2.2",
        },
      },
    },
  },
}));

const router = vi.hoisted(() => ({
  navigate: vi.fn(),
}));

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: asyncStorage,
}));

vi.mock("expo-router", () => ({
  useRouter: () => router,
}));

vi.mock("@/runtime/host-runtime", () => ({
  useHosts: () => hostsState.value,
}));

vi.mock("@/stores/session-store", () => ({
  useSessionStore: (selector: (state: typeof sessionState.value) => unknown) =>
    selector(sessionState.value),
}));

vi.mock("@/utils/app-version", () => ({
  resolveAppVersion: () => "1.2.3",
}));

vi.mock("react-native-unistyles", () => ({
  StyleSheet: {
    create: (factory: unknown) =>
      typeof factory === "function" ? (factory as (t: typeof theme) => unknown)(theme) : factory,
  },
  useUnistyles: () => ({ theme }),
}));

vi.mock("lucide-react-native", () => {
  const X = (props: Record<string, unknown>) => React.createElement("span", props);
  return { X };
});

vi.stubGlobal("React", React);
vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

import { DaemonVersionMismatchCalloutSource } from "./daemon-version-mismatch-callout-source";

function Harness() {
  return (
    <SidebarCalloutProvider>
      <DaemonVersionMismatchCalloutSource />
      <SidebarCalloutSlot />
    </SidebarCalloutProvider>
  );
}

async function renderHarness(root: Root): Promise<void> {
  await act(async () => {
    root.render(<Harness />);
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("DaemonVersionMismatchCalloutSource", () => {
  let root: Root | null = null;
  let container: HTMLElement | null = null;

  beforeEach(() => {
    hostsState.value = [{ serverId: "server-1", label: "Local daemon" }];
    sessionState.value = {
      sessions: {
        "server-1": {
          serverInfo: {
            serverId: "server-1",
            hostname: "MacBook",
            version: "1.2.2",
          },
        },
      },
    };
    router.navigate.mockClear();
    asyncStorage.values.clear();
    asyncStorage.getItem.mockClear();
    asyncStorage.setItem.mockClear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
    }
    root = null;
    container?.remove();
    container = null;
  });

  it("registers a daemon mismatch sidebar callout", async () => {
    await renderHarness(root!);

    expect(
      container?.querySelector('[data-testid="daemon-version-mismatch-callout-server-1"]'),
    ).not.toBeNull();
    expect(container?.textContent).toContain("Daemon version mismatch");
    expect(container?.textContent).toContain("Local daemon is running v1.2.2");
    expect(container?.textContent).toContain("This app is v1.2.3");
    expect(container?.textContent).toContain(
      "For the best experience, keep the daemon and client on the same version.",
    );
  });

  it("does not register a callout when versions match", async () => {
    sessionState.value.sessions["server-1"]!.serverInfo!.version = "1.2.3";

    await renderHarness(root!);

    expect(
      container?.querySelector('[data-testid="daemon-version-mismatch-callout-server-1"]'),
    ).toBeNull();
  });

  it("opens host settings from the callout action", async () => {
    await renderHarness(root!);

    const action = container?.querySelector(
      '[data-testid="daemon-version-mismatch-callout-server-1-action-0"]',
    ) as HTMLElement | null;
    expect(action).not.toBeNull();

    act(() => {
      action?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(router.navigate).toHaveBeenCalledWith("/settings/hosts/server-1");
  });

  it("persists dismissal for the current app-daemon version pair", async () => {
    await renderHarness(root!);

    const dismiss = container?.querySelector(
      '[data-testid="daemon-version-mismatch-callout-server-1-dismiss"]',
    ) as HTMLElement | null;
    expect(dismiss).not.toBeNull();

    act(() => {
      dismiss?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(asyncStorage.setItem).toHaveBeenCalledWith(
      "@paseo:sidebar-callout-dismissals",
      JSON.stringify(["daemon-version-mismatch:server-1:1.2.3:1.2.2"]),
    );
    expect(
      container?.querySelector('[data-testid="daemon-version-mismatch-callout-server-1"]'),
    ).toBeNull();
  });
});
