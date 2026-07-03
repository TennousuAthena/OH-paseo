import { afterEach, describe, expect, it } from "vitest";
import {
  cancelResidentBrowserWebviewPixelCapture,
  clearResidentBrowserWebviewsForTests,
  ensureResidentBrowserWebview,
  prepareBrowserWebview,
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
    expect(webview.style.position).toBe("absolute");
    expect(webview.style.left).toBe("0px");
    expect(webview.style.top).toBe("0px");
    expect(webview.style.zIndex).toBe("0");

    const reused = takeResidentBrowserWebview("browser-a");

    expect(reused).toBe(webview);
    expect(webview.style.position).toBe("");
    expect(webview.style.left).toBe("");
    expect(webview.style.top).toBe("");
    expect(webview.style.zIndex).toBe("");
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
    expect(webview.style.position).toBe("absolute");
    expect(webview.style.left).toBe("0px");
    expect(webview.style.top).toBe("0px");
    expect(webview.style.zIndex).toBe("2");

    await restoreResidentBrowserWebviewAfterPixelCapture(preparation);

    expect(host?.style.left).toBe("-20000px");
    expect(host?.style.width).toBe("1280px");
    expect(host?.style.height).toBe("800px");
    expect(host?.style.opacity).toBe("0");
    expect(webview.style.zIndex).toBe("0");
  });

  it("parks resident webviews as an overlapping stack and raises the capture target", async () => {
    const firstWebview = ensureResidentBrowserWebview({
      browserId: "browser-first",
      url: "https://example.com/first",
    });
    const secondWebview = ensureResidentBrowserWebview({
      browserId: "browser-second",
      url: "https://example.com/second",
    });
    if (!firstWebview || !secondWebview) {
      throw new Error("Expected resident browser webviews");
    }

    expect(firstWebview.style.position).toBe("absolute");
    expect(firstWebview.style.left).toBe("0px");
    expect(firstWebview.style.top).toBe("0px");
    expect(firstWebview.style.zIndex).toBe("0");
    expect(secondWebview.style.position).toBe("absolute");
    expect(secondWebview.style.left).toBe("0px");
    expect(secondWebview.style.top).toBe("0px");
    expect(secondWebview.style.zIndex).toBe("0");

    const preparation = await prepareResidentBrowserWebviewForPixelCapture({
      browserId: "browser-second",
    });

    expect(firstWebview.style.zIndex).toBe("0");
    expect(secondWebview.style.zIndex).toBe("2");

    await restoreResidentBrowserWebviewAfterPixelCapture(preparation);

    expect(firstWebview.style.zIndex).toBe("0");
    expect(secondWebview.style.zIndex).toBe("0");
  });

  it("prepares the physically resident webview when a focused duplicate exists outside the resident host", async () => {
    const residentWebview = ensureResidentBrowserWebview({
      browserId: "browser-focused-undisplayed",
      url: "https://example.com/resident",
    });
    if (!residentWebview) {
      throw new Error("Expected resident browser webview");
    }
    const visibleHost = document.createElement("div");
    const duplicateWebview = document.createElement("webview");
    prepareBrowserWebview(duplicateWebview, {
      browserId: "browser-focused-undisplayed",
      initialUrl: "https://example.com/duplicate",
    });
    visibleHost.appendChild(duplicateWebview);
    document.body.prepend(visibleHost);

    const preparation = await prepareResidentBrowserWebviewForPixelCapture({
      browserId: "browser-focused-undisplayed",
    });
    const residentHost = document.getElementById("paseo-browser-resident-webviews");

    expect(residentHost?.style.left).toBe("0px");
    expect(residentHost?.style.width).toBe("1px");
    expect(residentWebview.style.zIndex).toBe("2");
    expect(duplicateWebview.style.zIndex).toBe("");

    await restoreResidentBrowserWebviewAfterPixelCapture(preparation);
  });

  it("does not apply resident prep styles for a genuinely visible pane webview", async () => {
    const visibleHost = document.createElement("div");
    const visibleWebview = document.createElement("webview");
    prepareBrowserWebview(visibleWebview, {
      browserId: "browser-visible-pane",
      initialUrl: "https://example.com",
    });
    visibleWebview.style.display = "flex";
    visibleWebview.style.width = "100%";
    visibleWebview.style.height = "100%";
    visibleHost.appendChild(visibleWebview);
    document.body.appendChild(visibleHost);

    const preparation = await prepareResidentBrowserWebviewForPixelCapture({
      browserId: "browser-visible-pane",
    });
    const residentHost = document.getElementById("paseo-browser-resident-webviews");

    expect(residentHost?.style.left).toBe("-20000px");
    expect(residentHost?.style.width).toBe("1280px");
    expect(visibleWebview.style.position).toBe("");
    expect(visibleWebview.style.zIndex).toBe("");

    await restoreResidentBrowserWebviewAfterPixelCapture(preparation);
  });

  it("clears capture preparation when a resident webview is taken visible", async () => {
    const webview = ensureResidentBrowserWebview({
      browserId: "browser-visible",
      url: "https://example.com",
    });
    if (!webview) {
      throw new Error("Expected resident browser webview");
    }

    const preparation = await prepareResidentBrowserWebviewForPixelCapture({
      browserId: "browser-visible",
    });
    const visibleWebview = takeResidentBrowserWebview("browser-visible");

    expect(visibleWebview).toBe(webview);
    expect(webview.style.position).toBe("");
    expect(webview.style.left).toBe("");
    expect(webview.style.top).toBe("");
    expect(webview.style.zIndex).toBe("");

    await restoreResidentBrowserWebviewAfterPixelCapture(preparation);

    expect(webview.style.position).toBe("");
    expect(webview.style.left).toBe("");
    expect(webview.style.top).toBe("");
    expect(webview.style.zIndex).toBe("");
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

  it("cancels an in-flight pixel capture preparation by request id", async () => {
    ensureResidentBrowserWebview({
      browserId: "browser-cancel",
      url: "https://example.com",
    });

    const preparation = prepareResidentBrowserWebviewForPixelCapture({
      requestId: "prepare-1",
      browserId: "browser-cancel",
    });
    const host = document.getElementById("paseo-browser-resident-webviews");
    expect(host?.style.left).toBe("0px");
    expect(host?.style.opacity).toBe("1");

    await cancelResidentBrowserWebviewPixelCapture({ requestId: "prepare-1" });

    await expect(preparation).rejects.toThrow("Browser pixel capture preparation was canceled.");
    expect(host?.style.left).toBe("-20000px");
    expect(host?.style.width).toBe("1280px");
    expect(host?.style.opacity).toBe("0");
  });

  it("parks the resident host when a prepared browser tab is removed", async () => {
    const webview = ensureResidentBrowserWebview({
      browserId: "browser-detached",
      url: "https://example.com",
    });
    const preparation = await prepareResidentBrowserWebviewForPixelCapture({
      browserId: "browser-detached",
    });
    const host = document.getElementById("paseo-browser-resident-webviews");

    removeResidentBrowserWebview("browser-detached");

    expect(webview?.isConnected).toBe(false);
    expect(host?.style.left).toBe("-20000px");
    expect(host?.style.width).toBe("1280px");
    expect(host?.style.opacity).toBe("0");
    await restoreResidentBrowserWebviewAfterPixelCapture(preparation);
    expect(host?.style.left).toBe("-20000px");
  });
});
