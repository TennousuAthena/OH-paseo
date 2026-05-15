import React, { memo, useCallback, useEffect, useMemo, type ReactNode } from "react";
import { View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";
import { MAX_CONTENT_WIDTH } from "@/constants/layout";
import { findTurnHeaderForAssistantTurn } from "@/timeline/turn-time";
import type { StreamItem } from "@/types/stream";
import {
  getWorkingIndicatorDotStrength,
  WORKING_INDICATOR_CYCLE_MS,
  WORKING_INDICATOR_OFFSETS,
} from "@/utils/working-indicator";
import {
  collectAssistantTurnContentForStreamRenderStrategy,
  type StreamStrategy,
} from "./agent-stream-render-strategy";
import { AssistantTurnFooter, LiveElapsed, STREAM_METADATA_FONT_SIZE } from "./message";

export type TurnContentStrategy = StreamStrategy;

export interface TurnFooterHost {
  itemId: string;
  items: StreamItem[];
  startIndex: number;
}

export function resolveBottomTurnFooterHost(input: {
  agentStatus: string;
  history: StreamItem[];
  liveHead: StreamItem[];
  isInverted: boolean;
}): TurnFooterHost | null {
  if (input.agentStatus === "running") {
    return null;
  }
  const footerItems = input.liveHead.length > 0 ? input.liveHead : input.history;
  const startIndex = input.isInverted ? 0 : footerItems.length - 1;
  const item = footerItems[startIndex];
  if (!item || item.kind !== "assistant_message") {
    return null;
  }
  return {
    itemId: item.id,
    items: footerItems,
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
    <CompletedTurnFooterRow strategy={strategy} items={host.items} startIndex={host.startIndex} />
  );
});

export const CompletedTurnFooterRow = memo(function CompletedTurnFooterRow({
  strategy,
  items,
  startIndex,
}: {
  strategy: TurnContentStrategy;
  items: StreamItem[];
  startIndex: number;
}) {
  return (
    <TurnFooterRow>
      <CompletedTurnFooter strategy={strategy} items={items} startIndex={startIndex} />
    </TurnFooterRow>
  );
});

const WorkingIndicator = memo(function WorkingIndicator({
  inFlightTurnStartedAt = null,
}: {
  inFlightTurnStartedAt?: Date | null;
}) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = 0;
    progress.value = withRepeat(
      withTiming(1, {
        duration: WORKING_INDICATOR_CYCLE_MS,
        easing: Easing.linear,
      }),
      -1,
      false,
    );

    return () => {
      cancelAnimation(progress);
      progress.value = 0;
    };
  }, [progress]);

  const translateDistance = -2;
  const dotOneStyle = useAnimatedStyle(() => {
    const strength = getWorkingIndicatorDotStrength(progress.value, WORKING_INDICATOR_OFFSETS[0]);
    return {
      opacity: 0.3 + strength * 0.7,
      transform: [{ translateY: strength * translateDistance }],
    };
  });

  const dotTwoStyle = useAnimatedStyle(() => {
    const strength = getWorkingIndicatorDotStrength(progress.value, WORKING_INDICATOR_OFFSETS[1]);
    return {
      opacity: 0.3 + strength * 0.7,
      transform: [{ translateY: strength * translateDistance }],
    };
  });

  const dotThreeStyle = useAnimatedStyle(() => {
    const strength = getWorkingIndicatorDotStrength(progress.value, WORKING_INDICATOR_OFFSETS[2]);
    return {
      opacity: 0.3 + strength * 0.7,
      transform: [{ translateY: strength * translateDistance }],
    };
  });

  const dotOneCombinedStyle = useMemo(() => [stylesheet.workingDot, dotOneStyle], [dotOneStyle]);
  const dotTwoCombinedStyle = useMemo(() => [stylesheet.workingDot, dotTwoStyle], [dotTwoStyle]);
  const dotThreeCombinedStyle = useMemo(
    () => [stylesheet.workingDot, dotThreeStyle],
    [dotThreeStyle],
  );

  return (
    <View style={stylesheet.turnFooterContent}>
      <View style={stylesheet.workingDotsRow}>
        <Animated.View style={dotOneCombinedStyle} />
        <Animated.View style={dotTwoCombinedStyle} />
        <Animated.View style={dotThreeCombinedStyle} />
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
  startIndex,
}: {
  strategy: TurnContentStrategy;
  items: StreamItem[];
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
  const header = useMemo(
    () => findTurnHeaderForAssistantTurn({ strategy, items, startIndex }),
    [strategy, items, startIndex],
  );
  return (
    <View style={stylesheet.turnFooterSlot}>
      <AssistantTurnFooter
        getContent={getContent}
        startedAt={header?.startedAt}
        durationMs={header?.durationMs}
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
  workingDotsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    transform: [{ translateY: 1 }],
  },
  workingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.foregroundMuted,
  },
}));
