import type {
  AgentModelDefinition,
  ProviderSnapshotEntry,
} from "@server/server/agent/agent-sdk-types";
import type { AgentProviderDefinition } from "@server/server/agent/provider-manifest";
import { buildFavoriteModelKey, type FavoriteModelRow } from "@/hooks/use-form-preferences";
import { compareMatchScores, scoreTextFields } from "@/utils/score-match";

export type SelectorModelRow = FavoriteModelRow & { isDefault?: boolean };

export interface ModelSelectorProvider {
  id: string;
  label: string;
  rows: SelectorModelRow[];
}

export function buildSelectedTriggerLabel(modelLabel: string): string {
  return modelLabel;
}

export function buildModelSelectorProviders(
  providerDefinitions: AgentProviderDefinition[],
  allProviderModels: Map<string, AgentModelDefinition[]>,
): ModelSelectorProvider[] {
  return providerDefinitions.map((definition) => ({
    id: definition.id,
    label: definition.label,
    rows: (allProviderModels.get(definition.id) ?? []).map((model) => ({
      favoriteKey: buildFavoriteModelKey({ provider: definition.id, modelId: model.id }),
      provider: definition.id,
      providerLabel: definition.label,
      modelId: model.id,
      modelLabel: model.label,
      description: model.description,
      isDefault: model.isDefault,
    })),
  }));
}

export function buildSelectableModelSelectorProviders(
  entries: ProviderSnapshotEntry[] | undefined,
): ModelSelectorProvider[] {
  return (entries ?? [])
    .filter((entry) => entry.enabled && entry.status === "ready")
    .map((entry) => ({
      id: entry.provider,
      label: entry.label ?? entry.provider,
      rows: (entry.models ?? []).map((model) => ({
        favoriteKey: buildFavoriteModelKey({ provider: entry.provider, modelId: model.id }),
        provider: entry.provider,
        providerLabel: entry.label ?? entry.provider,
        modelId: model.id,
        modelLabel: model.label,
        description: model.description,
        isDefault: model.isDefault,
      })),
    }));
}

export function matchesSearch(row: SelectorModelRow, normalizedQuery: string): boolean {
  return scoreModelRow(row, normalizedQuery) !== null;
}

function getModelRowSearchFields(row: SelectorModelRow): string[] {
  return [row.modelLabel, row.modelId, row.providerLabel, row.description ?? ""];
}

export function scoreModelRow(row: SelectorModelRow, normalizedQuery: string) {
  return scoreTextFields(normalizedQuery, getModelRowSearchFields(row));
}

export function filterAndRankModelRows(
  rows: SelectorModelRow[],
  normalizedQuery: string,
): SelectorModelRow[] {
  if (!normalizedQuery) return rows;
  const scored = rows
    .map((row) => ({ row, score: scoreModelRow(row, normalizedQuery) }))
    .filter((entry): entry is { row: SelectorModelRow; score: NonNullable<typeof entry.score> } =>
      Boolean(entry.score),
    );

  scored.sort((a, b) => {
    const cmp = compareMatchScores(a.score, b.score);
    if (cmp !== 0) return cmp;
    return a.row.modelLabel.localeCompare(b.row.modelLabel);
  });

  return scored.map((entry) => entry.row);
}
