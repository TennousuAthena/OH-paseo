import { AlertCircle, Plus, RotateCw, Search, Trash2 } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  type PressableStateCallbackType,
  ScrollView,
  Text,
  View,
} from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { AdaptiveModalSheet, AdaptiveTextInput } from "@/components/adaptive-modal-sheet";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { isWeb } from "@/constants/platform";
import { Fonts } from "@/constants/theme";
import { useDaemonConfig } from "@/hooks/use-daemon-config";
import { useProvidersSnapshot } from "@/hooks/use-providers-snapshot";
import { useHostRuntimeClient } from "@/runtime/host-runtime";
import { resolveProviderLabel } from "@/utils/provider-definitions";
import { formatTimeAgo } from "@/utils/time";
import type { AgentModelDefinition, AgentProvider } from "@server/server/agent/agent-sdk-types";
import type { ProviderProfileModel } from "@server/server/agent/provider-launch-config";

interface ProviderDiagnosticSheetProps {
  provider: string;
  visible: boolean;
  onClose: () => void;
  serverId: string;
}

function ModelRow({ model, isFirst }: { model: AgentModelDefinition; isFirst: boolean }) {
  const rowStyle = useMemo(
    () => [sheetStyles.modelRow, !isFirst && sheetStyles.modelRowBorder],
    [isFirst],
  );
  return (
    <View style={rowStyle}>
      <Text style={sheetStyles.modelLabel} numberOfLines={1}>
        {model.label}
      </Text>
      <Text style={sheetStyles.modelId} numberOfLines={1} selectable>
        {model.id}
      </Text>
    </View>
  );
}

function AdditionalModelRow(props: {
  model: ProviderProfileModel;
  isFirst: boolean;
  deleting: boolean;
  onDelete: (modelId: string) => void;
}) {
  const { theme } = useUnistyles();
  const { model, isFirst, deleting, onDelete } = props;
  const rowStyle = useMemo(
    () => [sheetStyles.additionalModelRow, !isFirst && sheetStyles.modelRowBorder],
    [isFirst],
  );
  const handleDelete = useCallback(() => onDelete(model.id), [model.id, onDelete]);
  const deleteButtonStyle = useCallback(
    ({ hovered, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      sheetStyles.iconButton,
      (Boolean(hovered) || pressed) && sheetStyles.iconButtonHovered,
      deleting ? sheetStyles.disabled : null,
    ],
    [deleting],
  );

  return (
    <View style={rowStyle}>
      <View style={sheetStyles.additionalModelText}>
        <Text style={sheetStyles.modelLabel} numberOfLines={1}>
          {model.label}
        </Text>
        <Text style={sheetStyles.modelId} numberOfLines={1} selectable>
          {model.id}
        </Text>
      </View>
      <Pressable
        onPress={handleDelete}
        disabled={deleting}
        hitSlop={8}
        style={deleteButtonStyle}
        accessibilityRole="button"
        accessibilityLabel={`Remove ${model.id}`}
      >
        <Trash2 size={theme.iconSize.sm} color={theme.colors.destructive} />
      </Pressable>
    </View>
  );
}

function AdditionalModelsEditor(props: {
  provider: string;
  serverId: string;
  refresh: (providers?: AgentProvider[]) => Promise<void>;
}) {
  const { provider, serverId, refresh } = props;
  const { theme } = useUnistyles();
  const { config, patchConfig } = useDaemonConfig(serverId);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingModelId, setDeletingModelId] = useState<string | null>(null);
  const providerConfig = config?.providers?.[provider];
  const additionalModels = useMemo(
    () => providerConfig?.additionalModels ?? [],
    [providerConfig?.additionalModels],
  );
  const trimmedInput = input.trim();
  const canAdd =
    trimmedInput.length > 0 && !additionalModels.some((model) => model.id === trimmedInput);

  const patchAdditionalModels = useCallback(
    async (nextModels: ProviderProfileModel[]) => {
      await patchConfig({
        providers: {
          [provider]: {
            additionalModels: nextModels,
          },
        },
      });
      await refresh([provider as AgentProvider]);
    },
    [patchConfig, provider, refresh],
  );

  const handleAdd = useCallback(() => {
    if (!canAdd) {
      return;
    }

    setError(null);
    setSaving(true);
    void patchAdditionalModels([
      ...additionalModels,
      {
        id: trimmedInput,
        label: trimmedInput,
      },
    ])
      .then(() => setInput(""))
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to save model");
      })
      .finally(() => setSaving(false));
  }, [additionalModels, canAdd, patchAdditionalModels, trimmedInput]);

  const handleDelete = useCallback(
    (modelId: string) => {
      setError(null);
      setDeletingModelId(modelId);
      void patchAdditionalModels(additionalModels.filter((model) => model.id !== modelId))
        .catch((err) => {
          setError(err instanceof Error ? err.message : "Failed to delete model");
        })
        .finally(() => {
          setDeletingModelId((current) => (current === modelId ? null : current));
        });
    },
    [additionalModels, patchAdditionalModels],
  );

  const addButtonStyle = useCallback(
    ({ hovered, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      sheetStyles.addModelButton,
      (Boolean(hovered) || pressed) && sheetStyles.addModelButtonHovered,
      !canAdd || saving ? sheetStyles.disabled : null,
    ],
    [canAdd, saving],
  );

  return (
    <View style={sheetStyles.section}>
      <Text style={sheetStyles.sectionTitle}>Additional Models</Text>
      <View style={sheetStyles.addModelRow}>
        <View style={sheetStyles.addModelInputContainer}>
          <AdaptiveTextInput
            value={input}
            onChangeText={setInput}
            onSubmitEditing={handleAdd}
            placeholder="Model ID"
            placeholderTextColor={theme.colors.foregroundMuted}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            // @ts-expect-error - outlineStyle is web-only
            style={DIAGNOSTIC_ADD_MODEL_INPUT_STYLE}
          />
        </View>
        <Pressable
          onPress={handleAdd}
          disabled={!canAdd || saving}
          style={addButtonStyle}
          accessibilityRole="button"
          accessibilityLabel="Add model"
        >
          {saving ? (
            <LoadingSpinner size={theme.iconSize.sm} color={theme.colors.accentForeground} />
          ) : (
            <Plus size={theme.iconSize.sm} color={theme.colors.accentForeground} />
          )}
        </Pressable>
      </View>
      {error ? <Text style={sheetStyles.errorText}>{error}</Text> : null}
      {additionalModels.length > 0 ? (
        <View style={sheetStyles.additionalModelsList}>
          {additionalModels.map((model, index) => (
            <AdditionalModelRow
              key={model.id}
              model={model}
              isFirst={index === 0}
              deleting={deletingModelId === model.id}
              onDelete={handleDelete}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function DiagnosticCodeBlock(props: {
  loading: boolean;
  diagnostic: string | null;
  foregroundMutedColor: string;
}) {
  if (props.loading && !props.diagnostic) {
    return (
      <View style={sheetStyles.codeBlockLoading}>
        <ActivityIndicator size="small" color={props.foregroundMutedColor} />
        <Text style={sheetStyles.mutedText}>Running diagnostic…</Text>
      </View>
    );
  }
  if (props.diagnostic) {
    return (
      <ScrollView
        style={sheetStyles.codeScroll}
        contentContainerStyle={sheetStyles.codeContent}
        showsVerticalScrollIndicator={false}
      >
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <Text style={sheetStyles.codeText} selectable>
            {props.diagnostic}
          </Text>
        </ScrollView>
      </ScrollView>
    );
  }
  return (
    <View style={sheetStyles.codeBlockLoading}>
      <Text style={sheetStyles.mutedText}>No diagnostic available.</Text>
    </View>
  );
}

export function ProviderDiagnosticSheet({
  provider,
  visible,
  onClose,
  serverId,
}: ProviderDiagnosticSheetProps) {
  const { theme } = useUnistyles();
  const client = useHostRuntimeClient(serverId);
  const { entries: snapshotEntries, refresh, isRefreshing } = useProvidersSnapshot(serverId);
  const [diagnostic, setDiagnostic] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");

  const providerLabel = resolveProviderLabel(provider, snapshotEntries);
  const providerEntry = useMemo(
    () => snapshotEntries?.find((entry) => entry.provider === provider),
    [snapshotEntries, provider],
  );
  const models = providerEntry?.models ?? [];
  const providerSnapshotRefreshing = providerEntry?.status === "loading";
  const providerErrorMessage =
    providerEntry?.status === "error" ? (providerEntry.error ?? "Unknown error") : null;
  const refreshInFlight = isRefreshing || providerSnapshotRefreshing || loading;

  const [clockTick, setClockTick] = useState(0);
  useEffect(() => {
    if (!visible) return;
    const id = setInterval(() => setClockTick((t) => t + 1), 10_000);
    return () => clearInterval(id);
  }, [visible]);
  const fetchedAtLabel = useMemo(() => {
    if (!providerEntry?.fetchedAt) return null;
    // clockTick is referenced so the label recomputes each timer tick.
    void clockTick;
    return formatTimeAgo(new Date(providerEntry.fetchedAt));
  }, [providerEntry?.fetchedAt, clockTick]);

  const q = query.trim().toLowerCase();
  const filteredModels = q
    ? models.filter((m) => m.label.toLowerCase().includes(q) || m.id.toLowerCase().includes(q))
    : models;

  const fetchDiagnostic = useCallback(
    async (options?: { keepCurrent?: boolean }) => {
      if (!client || !provider) return;

      setLoading(true);
      if (!options?.keepCurrent) {
        setDiagnostic(null);
      }

      try {
        const result = await client.getProviderDiagnostic(provider as AgentProvider);
        setDiagnostic(result.diagnostic);
      } catch (err) {
        setDiagnostic(err instanceof Error ? err.message : "Failed to fetch diagnostic");
      } finally {
        setLoading(false);
      }
    },
    [client, provider],
  );

  const refreshButtonStyle = useCallback(
    ({ hovered, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      sheetStyles.iconButton,
      (Boolean(hovered) || pressed) && sheetStyles.iconButtonHovered,
      refreshInFlight ? sheetStyles.disabled : null,
    ],
    [refreshInFlight],
  );

  const handleRefresh = useCallback(() => {
    if (!provider) {
      return;
    }
    void Promise.all([refresh([provider as AgentProvider]), fetchDiagnostic()]).catch((err) => {
      setDiagnostic(err instanceof Error ? err.message : "Failed to refresh provider");
    });
  }, [fetchDiagnostic, provider, refresh]);

  const headerActions = useMemo(
    () => (
      <Pressable
        onPress={handleRefresh}
        disabled={refreshInFlight}
        hitSlop={8}
        style={refreshButtonStyle}
        accessibilityRole="button"
        accessibilityLabel={
          refreshInFlight ? `Refreshing ${providerLabel}` : `Refresh ${providerLabel}`
        }
      >
        {refreshInFlight ? (
          <LoadingSpinner size={theme.iconSize.sm} color={theme.colors.foregroundMuted} />
        ) : (
          <RotateCw size={theme.iconSize.sm} color={theme.colors.foregroundMuted} />
        )}
      </Pressable>
    ),
    [
      handleRefresh,
      refreshInFlight,
      refreshButtonStyle,
      providerLabel,
      theme.iconSize.sm,
      theme.colors.foregroundMuted,
    ],
  );

  useEffect(() => {
    if (visible) {
      fetchDiagnostic();
    } else {
      setDiagnostic(null);
      setQuery("");
    }
  }, [visible, fetchDiagnostic]);

  function renderModelsBody() {
    if (models.length === 0 && providerSnapshotRefreshing) {
      return (
        <View style={sheetStyles.emptyState}>
          <ActivityIndicator size="small" color={theme.colors.foregroundMuted} />
          <Text style={sheetStyles.mutedText}>Loading models…</Text>
        </View>
      );
    }
    if (models.length === 0 && providerErrorMessage) {
      return (
        <View style={sheetStyles.emptyState}>
          <AlertCircle size={theme.iconSize.md} color={theme.colors.foregroundMuted} />
          <Text style={sheetStyles.mutedText}>{providerErrorMessage}</Text>
        </View>
      );
    }
    if (models.length === 0) {
      return (
        <View style={sheetStyles.emptyState}>
          <Text style={sheetStyles.mutedText}>No models detected.</Text>
        </View>
      );
    }
    if (filteredModels.length === 0) {
      return (
        <View style={sheetStyles.emptyState}>
          <Search size={theme.iconSize.md} color={theme.colors.foregroundMuted} />
          <Text style={sheetStyles.mutedText}>No models match your search</Text>
        </View>
      );
    }
    return filteredModels.map((model: AgentModelDefinition, index) => (
      <ModelRow key={model.id} model={model} isFirst={index === 0} />
    ));
  }

  return (
    <AdaptiveModalSheet
      title={providerLabel}
      visible={visible}
      onClose={onClose}
      snapPoints={DIAGNOSTIC_SHEET_SNAP_POINTS}
      scrollable={false}
      headerActions={headerActions}
    >
      <View style={sheetStyles.section}>
        <Text style={sheetStyles.sectionTitle}>Diagnostic</Text>
        <View style={sheetStyles.codeBlock}>
          <DiagnosticCodeBlock
            loading={loading}
            diagnostic={diagnostic}
            foregroundMutedColor={theme.colors.foregroundMuted}
          />
        </View>
      </View>

      <View style={sheetStyles.modelsSection}>
        <AdditionalModelsEditor provider={provider} serverId={serverId} refresh={refresh} />

        <View style={sheetStyles.modelsHeader}>
          <Text style={sheetStyles.sectionTitle}>Models</Text>
          <View style={sheetStyles.modelsHeaderMeta}>
            <Text style={sheetStyles.countText}>{models.length}</Text>
            {fetchedAtLabel ? (
              <>
                <Text style={sheetStyles.metaDot}>·</Text>
                <Text style={sheetStyles.countText}>Updated {fetchedAtLabel}</Text>
              </>
            ) : null}
          </View>
        </View>
        {models.length > 0 ? (
          <View style={sheetStyles.searchContainer}>
            <Search size={theme.iconSize.md} color={theme.colors.foregroundMuted} />
            <AdaptiveTextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search models"
              placeholderTextColor={theme.colors.foregroundMuted}
              autoCapitalize="none"
              autoCorrect={false}
              // @ts-expect-error - outlineStyle is web-only
              style={DIAGNOSTIC_SEARCH_INPUT_STYLE}
            />
          </View>
        ) : null}
        <ScrollView
          style={sheetStyles.modelsScroll}
          contentContainerStyle={sheetStyles.modelsScrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {renderModelsBody()}
        </ScrollView>
      </View>
    </AdaptiveModalSheet>
  );
}

const sheetStyles = StyleSheet.create((theme) => ({
  section: {
    gap: theme.spacing[2],
  },
  sectionTitle: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.normal,
  },
  mutedText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
  },
  errorText: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.destructive,
  },
  iconButton: {
    width: 30,
    height: 30,
    borderRadius: theme.borderRadius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  iconButtonHovered: {
    backgroundColor: theme.colors.surface2,
  },
  disabled: {
    opacity: 0.5,
  },
  codeBlock: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.base,
    backgroundColor: theme.colors.surface2,
    overflow: "hidden",
    maxHeight: 180,
  },
  codeScroll: {
    maxHeight: 180,
  },
  codeContent: {
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[3],
  },
  codeText: {
    fontFamily: Fonts.mono,
    fontSize: theme.fontSize.xs,
    color: theme.colors.foreground,
    lineHeight: 18,
  },
  codeBlockLoading: {
    paddingVertical: theme.spacing[4],
    paddingHorizontal: theme.spacing[3],
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  modelsSection: {
    flex: 1,
    minHeight: 0,
    gap: theme.spacing[2],
  },
  modelsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modelsHeaderMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
  metaDot: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.foregroundMuted,
  },
  countText: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.foregroundMuted,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    backgroundColor: theme.colors.surface2,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing[3],
  },
  addModelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  addModelInputContainer: {
    flex: 1,
    minWidth: 0,
    backgroundColor: theme.colors.surface2,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing[3],
  },
  addModelInput: {
    paddingVertical: theme.spacing[2],
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  addModelButton: {
    width: 34,
    height: 34,
    borderRadius: theme.borderRadius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.accent,
  },
  addModelButtonHovered: {
    backgroundColor: theme.colors.accentBright,
  },
  additionalModelsList: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  additionalModelRow: {
    minHeight: 48,
    paddingVertical: theme.spacing[2],
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
  },
  additionalModelText: {
    flex: 1,
    minWidth: 0,
  },
  searchInput: {
    flex: 1,
    paddingVertical: theme.spacing[2],
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  modelsScroll: {
    flex: 1,
    minHeight: 0,
  },
  modelsScrollContent: {
    paddingBottom: theme.spacing[2],
  },
  modelRow: {
    paddingVertical: theme.spacing[3],
  },
  modelRowBorder: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  modelLabel: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foreground,
  },
  modelId: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.foregroundMuted,
    fontFamily: Fonts.mono,
    marginTop: 2,
  },
  emptyState: {
    paddingVertical: theme.spacing[6],
    alignItems: "center",
    gap: theme.spacing[2],
  },
}));

const DIAGNOSTIC_SHEET_SNAP_POINTS = ["50%", "85%"];
const DIAGNOSTIC_SEARCH_INPUT_STYLE = [sheetStyles.searchInput, isWeb && { outlineStyle: "none" }];
const DIAGNOSTIC_ADD_MODEL_INPUT_STYLE = [
  sheetStyles.addModelInput,
  isWeb && { outlineStyle: "none" },
];
