import { test, expect } from "./fixtures";
import {
  expectComposerEditable,
  expectComposerVisible,
  fillComposerDraft,
} from "./helpers/composer";
import { clickNewChat, gotoWorkspace } from "./helpers/launcher";
import { connectNewWorkspaceDaemonClient } from "./helpers/new-workspace";
import { seedWorkspace, type SeededWorkspace } from "./helpers/seed-client";
import { getVisibleWorkspaceAgentTabIds } from "./helpers/workspace-tabs";

type NewWorkspaceDaemonClient = Awaited<ReturnType<typeof connectNewWorkspaceDaemonClient>>;

test.describe("Workspace model regressions", () => {
  let client: NewWorkspaceDaemonClient;

  test.describe.configure({ timeout: 240_000 });

  test.beforeEach(async () => {
    client = await connectNewWorkspaceDaemonClient();
  });

  test.afterEach(async () => {
    await client?.close().catch(() => undefined);
  });

  test("same-directory workspace does not inherit legacy cwd-only agent tabs", async ({ page }) => {
    const seeded = await seedWorkspace({ repoPrefix: "workspace-legacy-agents-" });

    try {
      const legacyAgent = await seeded.client.createAgent({
        provider: "mock",
        cwd: seeded.repoPath,
        title: "Legacy cwd-only agent",
        modeId: "load-test",
        model: "ten-second-stream",
      });
      const secondWorkspace = await seeded.client.createWorkspace({
        source: { kind: "directory", path: seeded.repoPath, projectId: seeded.projectId },
        title: "Fresh workspace",
      });
      if (!secondWorkspace.workspace) {
        throw new Error(secondWorkspace.error ?? "Failed to create same-directory workspace");
      }

      await gotoWorkspace(page, secondWorkspace.workspace.id);

      await expect
        .poll(() => getVisibleWorkspaceAgentTabIds(page), { timeout: 30_000 })
        .toEqual([]);

      await gotoWorkspace(page, seeded.workspaceId);
      await expect
        .poll(() => getVisibleWorkspaceAgentTabIds(page), { timeout: 30_000 })
        .toContain(`workspace-tab-agent_${legacyAgent.id}`);
    } finally {
      await seeded.cleanup();
    }
  });

  test("new agent tab in a same-directory workspace picks a default model for the saved provider", async ({
    page,
  }) => {
    const seeded: SeededWorkspace = await seedWorkspace({
      repoPrefix: "workspace-new-agent-model-",
    });

    try {
      const secondWorkspace = await seeded.client.createWorkspace({
        source: { kind: "directory", path: seeded.repoPath, projectId: seeded.projectId },
        title: "Fresh workspace",
      });
      if (!secondWorkspace.workspace) {
        throw new Error(secondWorkspace.error ?? "Failed to create same-directory workspace");
      }

      await page.addInitScript(() => {
        localStorage.setItem(
          "@paseo:create-agent-preferences",
          JSON.stringify({
            provider: "codex",
            providerPreferences: {
              codex: { mode: "full-access" },
            },
          }),
        );
      });
      await gotoWorkspace(page, secondWorkspace.workspace.id);
      await clickNewChat(page);

      await expectComposerVisible(page);
      await expectComposerEditable(page);
      await fillComposerDraft(page, "d");
      await expect(page.getByText("No model is available for the selected provider")).toHaveCount(
        0,
      );
    } finally {
      await seeded.cleanup();
    }
  });
});
