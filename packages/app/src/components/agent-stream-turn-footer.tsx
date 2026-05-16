import React, { memo, useCallback, useMemo, type ReactNode } from "react";
import { View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { MAX_CONTENT_WIDTH } from "@/constants/layout";
import type { Theme } from "@/styles/theme";
import type { TurnTiming } from "@/timeline/turn-time";
import type { StreamItem } from "@/types/stream";
import {
  collectAssistantTurnContentForStreamRenderStrategy,
  type StreamStrategy,
} from "./agent-stream-render-strategy";
import { AssistantTurnFooter, LiveElapsed, STREAM_METADATA_FONT_SIZE } from "./message";
import { SyncedLoader } from "./synced-loader";

const ThemedSyncedLoader = withUnistyles(SyncedLoader);
const workingIndicatorColorMapping = (theme: Theme) => ({
  color:
    theme.colorScheme === "light"
      ? theme.colors.palette.amber[700]
      : theme.colors.palette.amber[500],
});

export type TurnContentStrategy = StreamStrategy;

export interface TurnFooterHost {
  itemId: string;
  items: StreamItem[];
  timing?: TurnTiming;
  startIndex: number;
}

export function resolveBottomTurnFooterHost(input: {
  agentStatus: string;
  history: StreamItem[];
  liveHead: StreamItem[];
  isInverted: boolean;
  timingByAssistantId: Map<string, TurnTiming>;
}): TurnFooterHost | null {
  if (input.agentStatus === "running") {
    return null;
  }
  const usesLiveHead = input.liveHead.length > 0;
  const footerItems = usesLiveHead ? input.liveHead : input.history;
  const startIndex = input.isInverted ? 0 : footerItems.length - 1;
  const item = footerItems[startIndex];
  if (!item || item.kind !== "assistant_message") {
    return null;
  }
  return {
    itemId: item.id,
    items: footerItems,
    timing: input.timingByAssistantId.get(item.id),
    startIndex,
  };
}

export function shouldRenderCompletedTurnFooter(input: {
  item: StreamItem;
  belowItem: StreamItem | undefined;
  agentStatus: string;
  suppressTurnFooter: boolean | undefined;
}): boolean {
  return (
    input.item.kind === "assistant_message" &&
    !input.suppressTurnFooter &&
    (input.belowItem?.kind === "user_message" ||
      (input.belowItem === undefined && input.agentStatus !== "running"))
  );
}

export const TurnFooter = memo(function TurnFooter({
  isRunning,
  inFlightTurnStartedAt,
  host,
  strategy,
}: {
  isRunning: boolean;
  inFlightTurnStartedAt: Date | null;
  host: TurnFooterHost | null;
  strategy: TurnContentStrategy;
}) {
  if (isRunning) {
    return (
      <TurnFooterRow>
        <RunningTurnFooter inFlightTurnStartedAt={inFlightTurnStartedAt} />
      </TurnFooterRow>
    );
  }
  if (!host) {
    return null;
  }
  return (
    <CompletedTurnFooterRow
      strategy={strategy}
      items={host.items}
      timing={host.timing}
      startIndex={host.startIndex}
    />
  );
});

export const CompletedTurnFooterRow = memo(function CompletedTurnFooterRow({
  strategy,
  items,
  timing,
  startIndex,
}: {
  strategy: TurnContentStrategy;
  items: StreamItem[];
  timing?: TurnTiming;
  startIndex: number;
}) {
  return (
    <TurnFooterRow>
      <CompletedTurnFooter
        strategy={strategy}
        items={items}
        timing={timing}
        startIndex={startIndex}
      />
    </TurnFooterRow>
  );
});

const WorkingIndicator = memo(function WorkingIndicator({
  inFlightTurnStartedAt = null,
}: {
  inFlightTurnStartedAt?: Date | null;
}) {
  return (
    <View style={stylesheet.turnFooterContent}>
      <View style={stylesheet.workingLoader}>
        <ThemedSyncedLoader size={14} uniProps={workingIndicatorColorMapping} />
      </View>
      {inFlightTurnStartedAt ? (
        <LiveElapsed
          startedAt={inFlightTurnStartedAt}
          style={stylesheet.workingElapsed}
          testID="turn-working-elapsed"
        />
      ) : null}
    </View>
  );
});

function RunningTurnFooter({ inFlightTurnStartedAt }: { inFlightTurnStartedAt: Date | null }) {
  return (
    <View style={stylesheet.turnFooterSlot} testID="turn-working-indicator">
      <WorkingIndicator inFlightTurnStartedAt={inFlightTurnStartedAt} />
    </View>
  );
}

function CompletedTurnFooter({
  strategy,
  items,
  timing,
  startIndex,
}: {
  strategy: TurnContentStrategy;
  items: StreamItem[];
  timing?: TurnTiming;
  startIndex: number;
}) {
  const getContent = useCallback(
    () =>
      collectAssistantTurnContentForStreamRenderStrategy({
        strategy,
        items,
        startIndex,
      }),
    [strategy, items, startIndex],
  );
  return (
    <View style={stylesheet.turnFooterSlot}>
      <AssistantTurnFooter
        getContent={getContent}
        completedAt={timing?.completedAt}
        durationMs={timing?.durationMs}
      />
    </View>
  );
}

function TurnFooterRow({ children }: { children: ReactNode }) {
  const rowStyle = useMemo(() => [stylesheet.streamItemWrapper, stylesheet.turnFooterRow], []);
  return <View style={rowStyle}>{children}</View>;
}

const stylesheet = StyleSheet.create((theme) => ({
  streamItemWrapper: {
    width: "100%",
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: "center",
    paddingHorizontal: theme.spacing[2],
  },
  turnFooterRow: {
    marginTop: theme.spacing[4],
  },
  turnFooterSlot: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    minHeight: 24,
    paddingBottom: theme.spacing[6],
  },
  turnFooterContent: {
    height: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: theme.spacing[3],
  },
  workingElapsed: {
    color: theme.colors.foregroundMuted,
    fontSize: STREAM_METADATA_FONT_SIZE,
    fontVariant: ["tabular-nums"],
  },
  workingLoader: {
    marginLeft: -2,
  },
}));
