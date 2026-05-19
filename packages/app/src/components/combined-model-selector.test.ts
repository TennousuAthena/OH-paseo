import { describe, expect, it } from "vitest";
import type {
  AgentModelDefinition,
  ProviderSnapshotEntry,
} from "@server/server/agent/agent-sdk-types";
import type { AgentProviderDefinition } from "@server/server/agent/provider-manifest";
import {
  buildModelSelectorProviders,
  buildSelectableModelSelectorProviders,
  buildSelectedTriggerLabel,
  filterAndRankModelRows,
  matchesSearch,
} from "./combined-model-selector.utils";

describe("combined model selector data", () => {
  const codexModel: AgentModelDefinition = {
    provider: "codex",
    id: "gpt-5.4",
    label: "GPT-5.4",
  };

  function snapshotEntry(
    overrides: Partial<ProviderSnapshotEntry> & Pick<ProviderSnapshotEntry, "provider">,
  ): ProviderSnapshotEntry {
    return {
      ...overrides,
      provider: overrides.provider,
      status: overrides.status ?? "ready",
      enabled: overrides.enabled ?? true,
      label: overrides.label ?? overrides.provider,
      description: overrides.description ?? `${overrides.provider} provider`,
      defaultModeId: overrides.defaultModeId ?? "default",
      modes: overrides.modes ?? [],
      models: overrides.models ?? [codexModel],
    };
  }

  it("builds selector providers from ready enabled snapshot entries", () => {
    expect(
      buildSelectableModelSelectorProviders([
        snapshotEntry({
          provider: "codex",
          label: "Codex",
          models: [codexModel],
        }),
      ]),
    ).toEqual([
      {
        id: "codex",
        label: "Codex",
        rows: [
          {
            favoriteKey: "codex:gpt-5.4",
            provider: "codex",
            providerLabel: "Codex",
            modelId: "gpt-5.4",
            modelLabel: "GPT-5.4",
            description: undefined,
            isDefault: undefined,
          },
        ],
      },
    ]);
  });

  it("keeps ready enabled providers with no models as model-less providers", () => {
    expect(
      buildSelectableModelSelectorProviders([
        snapshotEntry({
          provider: "deepseek-tui",
          label: "DeepSeek TUI",
          models: [],
        }),
      ]),
    ).toEqual([
      {
        id: "deepseek-tui",
        label: "DeepSeek TUI",
        rows: [],
      },
    ]);
  });

  it("excludes disabled providers from selector data", () => {
    expect(
      buildSelectableModelSelectorProviders([
        snapshotEntry({
          provider: "deepseek-tui",
          label: "DeepSeek TUI",
          enabled: false,
          models: [],
        }),
      ]),
    ).toEqual([]);
  });

  it("excludes providers that are not ready", () => {
    expect(
      buildSelectableModelSelectorProviders([
        snapshotEntry({ provider: "loading-provider", status: "loading", models: [] }),
        snapshotEntry({ provider: "error-provider", status: "error", models: [] }),
        snapshotEntry({ provider: "unavailable-provider", status: "unavailable", models: [] }),
      ]),
    ).toEqual([]);
  });

  it("builds selector providers from an already-curated provider list", () => {
    const providerDefinitions: AgentProviderDefinition[] = [
      {
        id: "codex",
        label: "Codex",
        description: "Codex provider",
        defaultModeId: "auto",
        modes: [],
      },
    ];

    expect(
      buildModelSelectorProviders(providerDefinitions, new Map([["codex", [codexModel]]])),
    ).toEqual([
      {
        id: "codex",
        label: "Codex",
        rows: [
          expect.objectContaining({
            provider: "codex",
            providerLabel: "Codex",
            modelId: "gpt-5.4",
            modelLabel: "GPT-5.4",
          }),
        ],
      },
    ]);
  });

  it("matches across label, provider, and description with multi-token fuzzy search", () => {
    const row = {
      favoriteKey: "opencode:opencode-zen/kimi-k2.5",
      provider: "opencode",
      providerLabel: "OpenCode",
      modelId: "opencode-zen/kimi-k2.5",
      modelLabel: "Kimi K2.5",
      description: "OpenCode Zen - kimi",
    };

    expect(matchesSearch(row, "kimi zen")).toBe(true);
    expect(matchesSearch(row, "zen kimi")).toBe(true);
    expect(matchesSearch(row, "k2.5 zen")).toBe(true);
    expect(matchesSearch(row, "kimi gemini")).toBe(false);
  });

  it("ranks model search results by fuzzy match quality", () => {
    const rows = [
      {
        favoriteKey: "openai:gpt-4.1",
        provider: "openai",
        providerLabel: "OpenAI",
        modelId: "gpt-4.1",
        modelLabel: "GPT-4.1",
      },
      {
        favoriteKey: "openai:gpt-5.4",
        provider: "openai",
        providerLabel: "OpenAI",
        modelId: "gpt-5.4",
        modelLabel: "GPT-5.4",
      },
      {
        favoriteKey: "google:gemini",
        provider: "google",
        providerLabel: "Google",
        modelId: "gemini",
        modelLabel: "Gemini",
      },
    ];

    expect(filterAndRankModelRows(rows, "gpt54").map((row) => row.modelId)).toEqual(["gpt-5.4"]);
  });

  it("keeps the selected trigger label model-only", () => {
    expect(buildSelectedTriggerLabel("GPT-5.4")).toBe("GPT-5.4");
  });
});
