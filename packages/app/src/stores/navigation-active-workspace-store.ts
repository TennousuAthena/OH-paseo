import { useSyncExternalStore } from "react";
import {
  buildHostWorkspaceRoute,
  decodeWorkspaceIdFromPathSegment,
  parseHostWorkspaceRouteFromPathname,
} from "@/utils/host-routes";
import { isWeb } from "@/constants/platform";

export interface ActiveWorkspaceSelection {
  serverId: string;
  workspaceId: string;
}

interface ActivateWorkspaceSelectionOptions {
  updateBrowserHistory?: boolean;
  historyMode?: "push" | "replace";
}

type NavigationRouteLike = {
  name?: unknown;
  params?: unknown;
  path?: unknown;
};

interface NavigationObserverRef {
  current: {
    getCurrentRoute(): unknown;
  } | null;
}

let snapshot: ActiveWorkspaceSelection | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): ActiveWorkspaceSelection | null {
  return snapshot;
}

function emitIfChanged(next: ActiveWorkspaceSelection | null) {
  if (snapshot?.serverId === next?.serverId && snapshot?.workspaceId === next?.workspaceId) {
    return;
  }
  snapshot = next;
  for (const listener of listeners) {
    listener();
  }
}

function getBrowserLocationWorkspace(): ActiveWorkspaceSelection | null {
  if (!isWeb || typeof window === "undefined") {
    return null;
  }
  return parseHostWorkspaceRouteFromPathname(window.location.pathname);
}

function writeBrowserWorkspaceUrl(
  next: ActiveWorkspaceSelection,
  options: ActivateWorkspaceSelectionOptions,
) {
  if (!options.updateBrowserHistory || !isWeb || typeof window === "undefined") {
    return;
  }

  const nextPath = buildHostWorkspaceRoute(next.serverId, next.workspaceId);
  const currentUrl = new URL(window.location.href);
  if (currentUrl.pathname === nextPath && !currentUrl.search && !currentUrl.hash) {
    return;
  }

  const nextUrl = new URL(nextPath, window.location.origin);
  const mode = options.historyMode ?? "push";
  if (mode === "replace") {
    window.history.replaceState(null, "", nextUrl.toString());
    return;
  }
  window.history.pushState(null, "", nextUrl.toString());
}

function extractActiveWorkspaceFromRoute(
  route: NavigationRouteLike | undefined,
): ActiveWorkspaceSelection | null {
  if (!route) {
    return null;
  }

  if (typeof route.path === "string") {
    const parsed = parseHostWorkspaceRouteFromPathname(route.path);
    if (parsed) {
      return parsed;
    }
  }

  const params =
    route.params && typeof route.params === "object"
      ? (route.params as {
          serverId?: string | string[];
          workspaceId?: string | string[];
        })
      : null;
  const serverValue = Array.isArray(params?.serverId) ? params?.serverId[0] : params?.serverId;
  const workspaceValue = Array.isArray(params?.workspaceId)
    ? params?.workspaceId[0]
    : params?.workspaceId;
  const serverId = typeof serverValue === "string" ? serverValue.trim() : "";
  const workspaceId =
    typeof workspaceValue === "string"
      ? (decodeWorkspaceIdFromPathSegment(workspaceValue) ?? "")
      : "";

  if (!serverId || !workspaceId) {
    return null;
  }

  return { serverId, workspaceId };
}

export function syncNavigationActiveWorkspace(navigationRef: NavigationObserverRef) {
  emitIfChanged(
    extractActiveWorkspaceFromRoute(
      navigationRef.current?.getCurrentRoute() as NavigationRouteLike | undefined,
    ),
  );
}

export function activateNavigationWorkspaceSelection(
  next: ActiveWorkspaceSelection,
  options: ActivateWorkspaceSelectionOptions = {},
) {
  emitIfChanged(next);
  writeBrowserWorkspaceUrl(next, options);
}

export function getNavigationActiveWorkspaceSelection(): ActiveWorkspaceSelection | null {
  return getSnapshot();
}

export function syncBrowserActiveWorkspaceFromLocation() {
  emitIfChanged(getBrowserLocationWorkspace());
}

export function addBrowserActiveWorkspaceLocationListener(): () => void {
  if (!isWeb || typeof window === "undefined") {
    return () => {};
  }

  const handlePopState = () => {
    syncBrowserActiveWorkspaceFromLocation();
  };
  window.addEventListener("popstate", handlePopState);
  return () => {
    window.removeEventListener("popstate", handlePopState);
  };
}

export function useNavigationActiveWorkspaceSelection(): ActiveWorkspaceSelection | null {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
