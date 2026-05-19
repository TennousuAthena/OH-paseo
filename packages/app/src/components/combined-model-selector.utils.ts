import type { AgentModelDefinition } from "@server/server/agent/agent-sdk-types";
import type { AgentProviderDefinition } from "@server/server/agent/provider-manifest";
import { buildFavoriteModelKey, type FavoriteModelRow } from "@/hooks/use-form-preferences";
import { compareMatchScores, scoreTextFields } from "@/utils/score-match";

export type SelectorModelRow = FavoriteModelRow;

export interface SelectorProviderGroup {
  providerId: string;
  providerLabel: string;
  rows: SelectorModelRow[];
  hasNoModels: boolean;
}

export function resolveProviderLabel(
  providerDefinitions: AgentProviderDefinition[],
  providerId: string,
): string {
  return (
    providerDefinitions.find((definition) => definition.id === providerId)?.label ?? providerId
  );
}

export function buildSelectedTriggerLabel(modelLabel: string): string {
  return modelLabel;
}

export function buildModelRows(
  providerDefinitions: AgentProviderDefinition[],
  allProviderModels: Map<string, AgentModelDefinition[]>,
): SelectorModelRow[] {
  const providerLabelMap = new Map(
    providerDefinitions.map((definition) => [definition.id, definition.label]),
  );
  const rows: SelectorModelRow[] = [];

  for (const definition of providerDefinitions) {
    const providerLabel = providerLabelMap.get(definition.id) ?? definition.label;
    for (const model of allProviderModels.get(definition.id) ?? []) {
      rows.push({
        favoriteKey: buildFavoriteModelKey({ provider: definition.id, modelId: model.id }),
        provider: definition.id,
        providerLabel,
        modelId: model.id,
        modelLabel: model.label,
        description: model.description,
      });
    }
  }

  return rows;
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

export function buildProviderGroups(
  providerDefinitions: AgentProviderDefinition[],
  allProviderModels: Map<string, AgentModelDefinition[]>,
  rows: SelectorModelRow[],
  normalizedQuery: string,
): SelectorProviderGroup[] {
  const rowsByProvider = new Map<string, SelectorModelRow[]>();
  for (const row of rows) {
    const providerRows = rowsByProvider.get(row.provider);
    if (providerRows) {
      providerRows.push(row);
    } else {
      rowsByProvider.set(row.provider, [row]);
    }
  }

  const groups: SelectorProviderGroup[] = [];
  for (const definition of providerDefinitions) {
    const providerRows = rowsByProvider.get(definition.id) ?? [];
    if (providerRows.length > 0) {
      groups.push({
        providerId: definition.id,
        providerLabel: definition.label,
        rows: providerRows,
        hasNoModels: false,
      });
      continue;
    }

    const models = allProviderModels.get(definition.id);
    if (!models || models.length > 0) {
      continue;
    }

    const providerMatches =
      !normalizedQuery ||
      scoreTextFields(normalizedQuery, [definition.label, definition.id]) !== null;
    if (!providerMatches) {
      continue;
    }

    groups.push({
      providerId: definition.id,
      providerLabel: definition.label,
      rows: [],
      hasNoModels: true,
    });
  }

  return groups;
}
