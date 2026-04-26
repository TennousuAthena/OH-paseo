import type { DesktopSettingsStore } from "../settings/desktop-settings.js";

interface QuitLifecycleSettings {
  daemon: {
    keepRunningAfterQuit: boolean;
  };
}

interface BeforeQuitEvent {
  preventDefault(): void;
}

interface BeforeQuitApp {
  quit(): void;
}

export interface StopOnQuitDeps {
  settingsStore: Pick<DesktopSettingsStore, "get">;
  isDesktopManagedDaemonRunning: () => boolean;
  stopDaemon: () => Promise<unknown>;
  showShutdownFeedback: () => void;
}

export function shouldStopDesktopManagedDaemonOnQuit(settings: QuitLifecycleSettings): boolean {
  return settings.daemon.keepRunningAfterQuit === false;
}

export async function stopDesktopManagedDaemonOnQuitIfNeeded(
  deps: StopOnQuitDeps,
): Promise<boolean> {
  const settings = await deps.settingsStore.get();
  if (!shouldStopDesktopManagedDaemonOnQuit(settings)) {
    return false;
  }

  if (!deps.isDesktopManagedDaemonRunning()) {
    return false;
  }

  deps.showShutdownFeedback();
  await deps.stopDaemon();
  return true;
}

export function createBeforeQuitHandler({
  app,
  closeTransportSessions,
  stopDesktopManagedDaemonIfNeeded,
  onStopError,
}: {
  app: BeforeQuitApp;
  closeTransportSessions: () => void;
  stopDesktopManagedDaemonIfNeeded: () => Promise<boolean>;
  onStopError: (error: unknown) => void;
}): (event: BeforeQuitEvent) => void {
  let allowingQuitToContinue = false;
  let quittingInProgress = false;

  return (event) => {
    closeTransportSessions();

    if (allowingQuitToContinue) {
      return;
    }

    event.preventDefault();
    if (quittingInProgress) {
      return;
    }

    quittingInProgress = true;
    void stopDesktopManagedDaemonIfNeeded()
      .catch((error) => {
        onStopError(error);
      })
      .finally(() => {
        allowingQuitToContinue = true;
        quittingInProgress = false;
        app.quit();
      });
  };
}
