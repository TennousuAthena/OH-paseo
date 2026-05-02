import { webContents as allWebContents, type WebContents } from "electron";

const browserIdsByWebContentsId = new Map<number, string>();
let activeBrowserPaneId: string | null = null;

export function registerPaseoBrowserWebContents(contents: WebContents, browserId: string): void {
  browserIdsByWebContentsId.set(contents.id, browserId);
  contents.once("destroyed", () => {
    browserIdsByWebContentsId.delete(contents.id);
    if (activeBrowserPaneId === browserId) {
      activeBrowserPaneId = null;
    }
  });
}

export function getPaseoBrowserIdForWebContents(contents: WebContents | null): string | null {
  if (!contents || contents.isDestroyed()) {
    return null;
  }
  return browserIdsByWebContentsId.get(contents.id) ?? null;
}

export function setActivePaseoBrowserPaneId(browserId: string | null): void {
  activeBrowserPaneId = browserId;
}

export function getActivePaseoBrowserWebContents(): WebContents | null {
  if (!activeBrowserPaneId) {
    return null;
  }
  for (const [contentsId, browserId] of browserIdsByWebContentsId) {
    if (browserId !== activeBrowserPaneId) continue;
    const contents = allWebContents.fromId(contentsId);
    if (contents && !contents.isDestroyed()) {
      return contents;
    }
  }
  return null;
}
