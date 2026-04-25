import { describe, expect, it, vi } from "vitest";

import { DEFAULT_DESKTOP_SETTINGS } from "../settings/desktop-settings";
import {
  createBeforeQuitHandler,
  shouldStopDesktopManagedDaemonOnQuit,
  stopDesktopManagedDaemonOnQuitIfNeeded,
} from "./quit-lifecycle";

describe("quit-lifecycle", () => {
  it("stops only when quit persistence disables keep-running and the daemon is desktop-managed", () => {
    expect(
      shouldStopDesktopManagedDaemonOnQuit({
        settings: {
          ...DEFAULT_DESKTOP_SETTINGS,
          daemon: {
            ...DEFAULT_DESKTOP_SETTINGS.daemon,
            keepRunningAfterQuit: false,
          },
        },
        daemonStatus: {
          status: "running",
          desktopManaged: true,
        },
      }),
    ).toBe(true);
  });

  it("does not stop a manually started daemon on quit", async () => {
    const stopDaemon = vi.fn(async () => undefined);

    const stopped = await stopDesktopManagedDaemonOnQuitIfNeeded({
      settingsStore: {
        get: async () => ({
          ...DEFAULT_DESKTOP_SETTINGS,
          daemon: {
            ...DEFAULT_DESKTOP_SETTINGS.daemon,
            keepRunningAfterQuit: false,
          },
        }),
        patch: async () => DEFAULT_DESKTOP_SETTINGS,
        migrateLegacyRendererSettings: async () => DEFAULT_DESKTOP_SETTINGS,
      },
      resolveStatus: async () => ({
        status: "running",
        desktopManaged: false,
      }),
      stopDaemon,
    });

    expect(stopped).toBe(false);
    expect(stopDaemon).not.toHaveBeenCalled();
  });

  it("gates quit until the stop decision completes, then lets the next quit pass through", async () => {
    let resolveStopDecision: (() => void) | null = null;
    const app = { quit: vi.fn() };
    const closeTransportSessions = vi.fn();
    const onStopError = vi.fn();
    const preventDefault = vi.fn();
    const secondPreventDefault = vi.fn();

    const handleBeforeQuit = createBeforeQuitHandler({
      app,
      closeTransportSessions,
      stopDesktopManagedDaemonIfNeeded: vi.fn(
        () =>
          new Promise<boolean>((resolve) => {
            resolveStopDecision = () => resolve(false);
          }),
      ),
      onStopError,
    });

    handleBeforeQuit({ preventDefault });

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(closeTransportSessions).toHaveBeenCalledTimes(1);
    expect(app.quit).not.toHaveBeenCalled();
    expect(resolveStopDecision).not.toBeNull();

    resolveStopDecision?.();
    await Promise.resolve();
    await Promise.resolve();

    expect(app.quit).toHaveBeenCalledTimes(1);
    expect(onStopError).not.toHaveBeenCalled();

    handleBeforeQuit({ preventDefault: secondPreventDefault });

    expect(secondPreventDefault).not.toHaveBeenCalled();
    expect(closeTransportSessions).toHaveBeenCalledTimes(2);
    expect(app.quit).toHaveBeenCalledTimes(1);
  });
});
