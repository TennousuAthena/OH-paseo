import { describe, expect, it } from "vitest";
import type { AgentModelDefinition } from "@server/server/agent/agent-sdk-types";
import {
  buildModelRows,
  buildProviderGroups,
  buildSelectedTriggerLabel,
  filterAndRankModelRows,
  matchesSearch,
  resolveProviderLabel,
} from "./combined-model-selector.utils";

describe("combined model selector helpers", () => {
  const providerDefinitions = [
    {
      id: "claude",
      label: "Claude",
      description: "Claude provider",
      defaultModeId: "default",
      modes: [],
    },
    {
      id: "codex",
      label: "Codex",
      description: "Codex provider",
      defaultModeId: "auto",
      modes: [],
    },
    {
      id: "deepseek-tui",
      label: "DeepSeek TUI",
      description: "DeepSeek TUI provider",
      defaultModeId: "default",
      modes: [],
    },
  ];

  const claudeModels: AgentModelDefinition[] = [
    {
      provider: "claude",
      id: "sonnet-4.6",
      label: "Sonnet 4.6",
    },
  ];

  const codexModels: AgentModelDefinition[] = [
    {
      provider: "codex",
      id: "gpt-5.4",
      label: "GPT-5.4",
    },
  ];

  it("keeps enough data to search by model and provider name", async () => {
    const rows = buildModelRows(
      providerDefinitions,
      new Map([
        ["claude", claudeModels],
        ["codex", codexModels],
      ]),
    );

    expect(rows).toEqual([
      expect.objectContaining({
        providerLabel: "Claude",
        modelLabel: "Sonnet 4.6",
        modelId: "sonnet-4.6",
      }),
      expect.objectContaining({
        providerLabel: "Codex",
        modelLabel: "GPT-5.4",
        modelId: "gpt-5.4",
      }),
    ]);

    expect(matchesSearch(rows[0], "claude")).toBe(true);
    expect(matchesSearch(rows[1], "gpt-5.4")).toBe(true);
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

  it("includes providers that expose no models", () => {
    const rows = buildModelRows(
      providerDefinitions,
      new Map([
        ["claude", claudeModels],
        ["deepseek-tui", []],
      ]),
    );

    const groups = buildProviderGroups(
      providerDefinitions,
      new Map([
        ["claude", claudeModels],
        ["deepseek-tui", []],
      ]),
      rows,
      "",
    );

    expect(groups).toEqual([
      expect.objectContaining({
        providerId: "claude",
        hasNoModels: false,
      }),
      expect.objectContaining({
        providerId: "deepseek-tui",
        providerLabel: "DeepSeek TUI",
        rows: [],
        hasNoModels: true,
      }),
    ]);
  });

  it("matches model-less providers by provider name", () => {
    const groups = buildProviderGroups(
      providerDefinitions,
      new Map([
        ["claude", claudeModels],
        ["deepseek-tui", []],
      ]),
      [],
      "deepseek",
    );

    expect(groups.map((group) => group.providerId)).toEqual(["deepseek-tui"]);
  });

  it("keeps the selected trigger label model-only", () => {
    expect(resolveProviderLabel(providerDefinitions, "codex")).toBe("Codex");
    expect(buildSelectedTriggerLabel("GPT-5.4")).toBe("GPT-5.4");
  });
});
