import { Text, View } from "react-native";
import { ArrowLeftToLine, RotateCw, Settings } from "lucide-react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatConnectionStatus } from "@/utils/daemons";
import type { WorkspaceRouteState } from "@/screens/workspace/workspace-route-state";

interface WorkspaceRouteStateActions {
  onRetryHost: () => void;
  onManageHost: () => void;
  onDismissMissingWorkspace: () => void;
}

export function renderWorkspaceRouteGate(input: {
  state: WorkspaceRouteState;
  actions: WorkspaceRouteStateActions;
}): React.ReactNode {
  switch (input.state.kind) {
    case "loading":
      return <WorkspaceConnecting hostName={input.state.hostName} />;
    case "unreachable":
      return (
        <WorkspaceUnreachable
          state={input.state}
          onRetry={input.actions.onRetryHost}
          onManageHost={input.actions.onManageHost}
        />
      );
    case "missing":
      return (
        <WorkspaceMissing
          hostName={input.state.hostName}
          onDismiss={input.actions.onDismissMissingWorkspace}
        />
      );
    case "ready":
    case "reconnecting":
      return null;
  }
}

export function renderWorkspaceReconnectIndicator(input: {
  state: WorkspaceRouteState;
  onRetryHost: () => void;
}): React.ReactNode {
  if (input.state.kind !== "reconnecting") {
    return null;
  }
  return <WorkspaceReconnectBanner state={input.state} onRetry={input.onRetryHost} />;
}

function getWorkspaceHostStateTitle(
  state: Extract<WorkspaceRouteState, { kind: "unreachable" }>,
): string {
  if (state.connectionStatus === "connecting" || state.connectionStatus === "idle") {
    return `Connecting to ${state.hostName}`;
  }
  if (state.connectionStatus === "offline") {
    return `${state.hostName} is offline`;
  }
  return `Cannot reach ${state.hostName}`;
}

function getReconnectBannerCopy(
  state: Extract<WorkspaceRouteState, { kind: "reconnecting" }>,
): string {
  if (state.connectionStatus === "connecting" || state.connectionStatus === "idle") {
    return `Reconnecting to ${state.hostName}...`;
  }
  return `${state.hostName} is offline`;
}

function WorkspaceConnecting({ hostName }: { hostName: string }) {
  const { theme } = useUnistyles();

  return (
    <View style={styles.emptyState}>
      <LoadingSpinner size="small" color={theme.colors.foregroundMuted} />
      <View style={styles.textStack}>
        <Text style={styles.title}>Loading workspace</Text>
        <Text style={styles.description}>{hostName}</Text>
      </View>
    </View>
  );
}

function WorkspaceUnreachable({
  state,
  onRetry,
  onManageHost,
}: {
  state: Extract<WorkspaceRouteState, { kind: "unreachable" }>;
  onRetry: () => void;
  onManageHost: () => void;
}) {
  const { theme } = useUnistyles();
  const canRetry = state.connectionStatus === "offline" || state.connectionStatus === "error";

  return (
    <View style={styles.emptyState}>
      {state.connectionStatus === "connecting" || state.connectionStatus === "idle" ? (
        <LoadingSpinner size="small" color={theme.colors.foregroundMuted} />
      ) : null}
      <View style={styles.textStack}>
        <Text style={styles.title}>{getWorkspaceHostStateTitle(state)}</Text>
        <Text style={styles.description}>
          Host status: {formatConnectionStatus(state.connectionStatus)}
        </Text>
        {state.lastError ? (
          <Tooltip delayDuration={0} enabledOnDesktop enabledOnMobile={false}>
            <TooltipTrigger asChild>
              <Text style={styles.error} numberOfLines={3}>
                {state.lastError}
              </Text>
            </TooltipTrigger>
            <TooltipContent side="top" align="center" offset={8}>
              <Text style={styles.errorTooltip}>{state.lastError}</Text>
            </TooltipContent>
          </Tooltip>
        ) : null}
      </View>
      {canRetry ? (
        <View style={styles.actions}>
          <Button size="sm" variant="default" leftIcon={RotateCw} onPress={onRetry}>
            Retry
          </Button>
          <Button size="sm" variant="outline" leftIcon={Settings} onPress={onManageHost}>
            Manage host
          </Button>
        </View>
      ) : null}
    </View>
  );
}

function WorkspaceReconnectBanner({
  state,
  onRetry,
}: {
  state: Extract<WorkspaceRouteState, { kind: "reconnecting" }>;
  onRetry: () => void;
}) {
  const { theme } = useUnistyles();
  const canRetry = state.connectionStatus === "offline" || state.connectionStatus === "error";
  const showSpinner = state.connectionStatus === "connecting" || state.connectionStatus === "idle";
  const isErrorState = state.connectionStatus === "offline" || state.connectionStatus === "error";

  return (
    <View style={styles.reconnectBanner} testID="workspace-reconnect-banner">
      {showSpinner ? <LoadingSpinner size="small" color={theme.colors.foregroundMuted} /> : null}
      <Text style={isErrorState ? styles.reconnectTextDestructive : styles.reconnectText}>
        {getReconnectBannerCopy(state)}
      </Text>
      {canRetry ? (
        <Button size="sm" variant="outline" leftIcon={RotateCw} onPress={onRetry}>
          Retry
        </Button>
      ) : null}
    </View>
  );
}

function WorkspaceMissing({ hostName, onDismiss }: { hostName: string; onDismiss: () => void }) {
  return (
    <View style={styles.emptyState}>
      <View style={styles.textStack}>
        <Text style={styles.title}>Workspace not found</Text>
        <Text style={styles.description}>{hostName}</Text>
      </View>
      <View style={styles.actions}>
        <Button size="sm" variant="default" leftIcon={ArrowLeftToLine} onPress={onDismiss}>
          Back
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[3],
    paddingHorizontal: theme.spacing[6],
  },
  textStack: {
    alignItems: "center",
    gap: theme.spacing[2],
    maxWidth: 520,
  },
  title: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.normal,
    textAlign: "center",
  },
  description: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    textAlign: "center",
  },
  error: {
    color: theme.colors.destructive,
    fontSize: theme.fontSize.sm,
    lineHeight: Math.round(theme.fontSize.sm * 1.4),
    textAlign: "center",
  },
  errorTooltip: {
    color: theme.colors.popoverForeground,
    fontSize: theme.fontSize.sm,
    maxWidth: 420,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: theme.spacing[2],
  },
  reconnectBanner: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.surface1,
  },
  reconnectText: {
    minWidth: 0,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    flexShrink: 1,
  },
  reconnectTextDestructive: {
    minWidth: 0,
    color: theme.colors.destructive,
    fontSize: theme.fontSize.sm,
    flexShrink: 1,
  },
}));
