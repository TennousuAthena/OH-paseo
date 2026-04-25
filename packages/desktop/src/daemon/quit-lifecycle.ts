import type { DesktopSettingsStore } from "../settings/desktop-settings.js";

interface QuitLifecycleSettings {
  daemon: {
    keepRunningAfterQuit: boolean;
  };
}

interface QuitLifecycleStatus {
  status: "starting" | "running" | "stopped" | "errored";
  desktopManaged: boolean;
}

interface BeforeQuitEvent {
  preventDefault(): void;
}

interface BeforeQuitApp {
  quit(): void;
}

export function shouldStopDesktopManagedDaemonOnQuit({
  settings,
  daemonStatus,
}: {
  settings: QuitLifecycleSettings;
  daemonStatus: QuitLifecycleStatus;
}): boolean {
  return (
    settings.daemon.keepRunningAfterQuit === false &&
    daemonStatus.status === "running" &&
    daemonStatus.desktopManaged
  );
}

export async function stopDesktopManagedDaemonOnQuitIfNeeded({
  settingsStore,
  resolveStatus,
  stopDaemon,
}: {
  settingsStore: DesktopSettingsStore;
  resolveStatus: () => Promise<QuitLifecycleStatus>;
  stopDaemon: () => Promise<unknown>;
}): Promise<boolean> {
  const settings = await settingsStore.get();
  const daemonStatus = await resolveStatus();

  if (!shouldStopDesktopManagedDaemonOnQuit({ settings, daemonStatus })) {
    return false;
  }

  await stopDaemon();
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
