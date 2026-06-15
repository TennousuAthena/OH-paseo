import { test, expect } from "./fixtures";
import { expectComposerEditable, expectComposerVisible, submitMessage } from "./helpers/composer";
import { clickNewChat, gotoWorkspace } from "./helpers/launcher";
import { connectNewWorkspaceDaemonClient } from "./helpers/new-workspace";
import { captureWsSessionFrames } from "./helpers/rename";
import { seedWorkspace, type SeededWorkspace } from "./helpers/seed-client";
import { getVisibleWorkspaceAgentTabIds } from "./helpers/workspace-tabs";

type NewWorkspaceDaemonClient = Awaited<ReturnType<typeof connectNewWorkspaceDaemonClient>>;

interface CreateAgentFrame extends Record<string, unknown> {
  initialPrompt: string | null;
  workspaceId: string | null;
  provider: string | null;
  cwd: string | null;
  modeId: string | null;
  model: string | null;
}

function createFrameForPrompt(frames: CreateAgentFrame[], prompt: string): CreateAgentFrame | null {
  return frames.find((frame) => frame.initialPrompt === prompt) ?? null;
}

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
    const createFrames = captureWsSessionFrames<CreateAgentFrame>(
      page,
      "create_agent_request",
      (inner) => {
        const config = (inner.config ?? {}) as Record<string, unknown>;
        return {
          initialPrompt: typeof inner.initialPrompt === "string" ? inner.initialPrompt : null,
          workspaceId: typeof inner.workspaceId === "string" ? inner.workspaceId : null,
          provider: typeof config.provider === "string" ? config.provider : null,
          cwd: typeof config.cwd === "string" ? config.cwd : null,
          modeId: typeof config.modeId === "string" ? config.modeId : null,
          model: typeof config.model === "string" ? config.model : null,
        };
      },
    );

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
            provider: "mock",
            providerPreferences: {
              mock: { mode: "load-test" },
            },
          }),
        );
      });
      await gotoWorkspace(page, secondWorkspace.workspace.id);
      await clickNewChat(page);

      await expectComposerVisible(page);
      await expectComposerEditable(page);
      const prompt = `Create agent default model ${Date.now()}`;
      await submitMessage(page, prompt);
      await expect(page.getByText("No model is available for the selected provider")).toHaveCount(
        0,
      );
      await expect
        .poll(() => createFrameForPrompt(createFrames, prompt), {
          timeout: 10_000,
        })
        .toEqual({
          initialPrompt: prompt,
          workspaceId: secondWorkspace.workspace.id,
          provider: "mock",
          cwd: seeded.repoPath,
          modeId: "load-test",
          model: "five-minute-stream",
        });
    } finally {
      await seeded.cleanup();
    }
  });
});
