import { afterEach, describe, expect, it } from "vitest";
import {
  clearResidentBrowserWebviewsForTests,
  ensureResidentBrowserWebview,
  prepareResidentBrowserWebviewForPixelCapture,
  releaseResidentBrowserWebview,
  removeResidentBrowserWebview,
  restoreResidentBrowserWebviewAfterPixelCapture,
  takeResidentBrowserWebview,
} from "./browser-webview-resident";

describe("resident browser webviews", () => {
  afterEach(() => {
    clearResidentBrowserWebviewsForTests();
  });

  it("keeps a browser webview mounted offscreen and reuses the same node", () => {
    const host = document.createElement("div");
    const webview = document.createElement("webview");
    host.appendChild(webview);
    document.body.appendChild(host);

    releaseResidentBrowserWebview("browser-a", webview);

    expect(host.children).toHaveLength(0);
    expect(webview.isConnected).toBe(true);
    expect(webview.style.display).toBe("inline-flex");
    expect(webview.style.width).toBe("1280px");
    expect(webview.style.height).toBe("800px");

    const reused = takeResidentBrowserWebview("browser-a");

    expect(reused).toBe(webview);
    expect(takeResidentBrowserWebview("browser-a")).toBeNull();
  });

  it("creates a resident webview for an agent-created unfocused tab", () => {
    const webview = ensureResidentBrowserWebview({
      browserId: "browser-agent",
      url: "https://example.com",
    });

    expect(webview).not.toBeNull();
    expect(webview?.isConnected).toBe(true);
    expect(webview?.getAttribute("data-paseo-browser-id")).toBe("browser-agent");
    expect(webview?.getAttribute("partition")).toBe("persist:paseo-browser-browser-agent");
    expect((webview as HTMLUnknownElement & { src?: string })?.src).toContain(
      "https://example.com",
    );
  });

  it("removes a resident webview when its browser tab closes", () => {
    const webview = ensureResidentBrowserWebview({
      browserId: "browser-closed",
      url: "https://example.com",
    });

    removeResidentBrowserWebview("browser-closed");

    expect(webview?.isConnected).toBe(false);
    expect(takeResidentBrowserWebview("browser-closed")).toBeNull();
  });

  it("temporarily makes resident webviews paintable for pixel capture", async () => {
    const webview = ensureResidentBrowserWebview({
      browserId: "browser-capture",
      url: "https://example.com",
    });
    if (!webview) {
      throw new Error("Expected resident browser webview");
    }

    const preparation = await prepareResidentBrowserWebviewForPixelCapture({
      browserId: "browser-capture",
    });
    const host = document.getElementById("paseo-browser-resident-webviews");

    expect(preparation.token).toBe("capture-1");
    expect(host?.style.left).toBe("0px");
    expect(host?.style.top).toBe("0px");
    expect(host?.style.width).toBe("1px");
    expect(host?.style.height).toBe("1px");
    expect(host?.style.overflow).toBe("hidden");
    expect(host?.style.opacity).toBe("1");
    expect(host?.style.pointerEvents).toBe("none");
    expect(webview.style.display).toBe("inline-flex");
    expect(webview.style.width).toBe("1280px");
    expect(webview.style.height).toBe("800px");

    await restoreResidentBrowserWebviewAfterPixelCapture(preparation);

    expect(host?.style.left).toBe("-20000px");
    expect(host?.style.width).toBe("1280px");
    expect(host?.style.height).toBe("800px");
    expect(host?.style.opacity).toBe("0");
  });

  it("keeps the resident host paintable until every capture token is restored", async () => {
    ensureResidentBrowserWebview({
      browserId: "browser-overlap",
      url: "https://example.com",
    });

    const first = await prepareResidentBrowserWebviewForPixelCapture({
      browserId: "browser-overlap",
    });
    const second = await prepareResidentBrowserWebviewForPixelCapture({
      browserId: "browser-overlap",
    });
    const host = document.getElementById("paseo-browser-resident-webviews");

    await restoreResidentBrowserWebviewAfterPixelCapture(first);

    expect(host?.style.left).toBe("0px");
    expect(host?.style.width).toBe("1px");
    expect(host?.style.opacity).toBe("1");

    await restoreResidentBrowserWebviewAfterPixelCapture(second);

    expect(host?.style.left).toBe("-20000px");
    expect(host?.style.width).toBe("1280px");
    expect(host?.style.opacity).toBe("0");
  });
});
