import type { ParsedDiffFile } from "@getpaseo/protocol/messages";
import { describe, expect, it } from "vitest";
import { buildDiffDocumentModel } from "./model";
import { hitTestDiffPagePoint } from "./native-hit-testing";
import type { BuildDiffDocumentModelInput } from "./types";

const origin = { x: 80, y: 120 };

describe("native diff page-coordinate hit testing", () => {
  it("resolves first and later files through the measured surface origin and vertical scroll", () => {
    const model = build("unified");
    const rows = model.rows.filter((row) => row.kind === "line" && row.cells[0]?.type === "add");
    for (const row of rows) {
      const scrollTop = Math.max(0, row.top - 30);
      const hit = hitTestDiffPagePoint({
        model,
        pageX: origin.x + model.files[row.fileIndex]!.gutterWidth + 18,
        pageY: origin.y + row.top - scrollTop + 2,
        surfaceOrigin: origin,
        scrollTop,
        horizontalOffsetForPath: () => 0,
      });
      expect(hit?.kind).toBe("cell");
      if (hit?.kind === "cell") expect(hit.position.fileIndex).toBe(row.fileIndex);
    }
  });

  it("applies the touched file's retained horizontal offset", () => {
    const model = build("unified");
    const row = model.rows.find(
      (candidate) =>
        candidate.kind === "line" &&
        candidate.path === "src/second.ts" &&
        candidate.cells[0]?.type === "add",
    )!;
    const hit = hitTestDiffPagePoint({
      model,
      pageX: origin.x + model.files[1]!.gutterWidth + 8,
      pageY: origin.y + row.top + 2,
      surfaceOrigin: origin,
      scrollTop: 0,
      horizontalOffsetForPath: (path) => (path === "src/second.ts" ? 30 : 0),
    });
    expect(hit?.kind === "cell" ? hit.position.sourceOffset : -1).toBe(3);
  });

  it("resolves old and new split cells from page coordinates independent of the touch target", () => {
    const model = build("split");
    const row = model.rows.find(
      (candidate) =>
        candidate.kind === "line" && candidate.cells.length === 2 && candidate.cells.every(Boolean),
    )!;
    const left = hitAt(model, row.top, model.viewportWidth * 0.25);
    const right = hitAt(model, row.top, model.viewportWidth * 0.75);
    expect(left?.kind === "cell" ? left.position.side : null).toBe("old");
    expect(right?.kind === "cell" ? right.position.side : null).toBe("new");
  });
});

function hitAt(model: ReturnType<typeof buildDiffDocumentModel>, rowTop: number, x: number) {
  return hitTestDiffPagePoint({
    model,
    pageX: origin.x + x,
    pageY: origin.y + rowTop + 2,
    surfaceOrigin: origin,
    scrollTop: 0,
    horizontalOffsetForPath: () => 0,
  });
}

function build(layout: "unified" | "split") {
  const input: BuildDiffDocumentModelInput = {
    files: [
      diffFile("src/first.ts", "first-long-content"),
      diffFile("src/second.ts", "second-long-content"),
    ],
    collapsedFilePaths: new Set(),
    layout,
    wrapLines: false,
    viewportWidth: 400,
    typography: { family: "monospace", size: 12, lineHeight: 18 },
    measureText: { measure: (text) => Array.from(text).length * 10 },
    palette: {
      surface: "#000",
      headerSurface: "#111",
      border: "#222",
      foreground: "#fff",
      foregroundMuted: "#aaa",
      addition: "green",
      deletion: "red",
      additionBackground: "#010",
      deletionBackground: "#100",
      emptyBackground: "#111",
      selection: "blue",
      syntax: {},
    },
    labels: { binary: "Binary", tooLarge: "Too large" },
  };
  return buildDiffDocumentModel(input);
}

function diffFile(path: string, content: string): ParsedDiffFile {
  return {
    path,
    isNew: false,
    isDeleted: false,
    additions: 1,
    deletions: 1,
    hunks: [
      {
        oldStart: 1,
        oldCount: 1,
        newStart: 1,
        newCount: 1,
        lines: [
          { type: "header", content: "@@ -1 +1 @@" },
          { type: "remove", content },
          { type: "add", content },
        ],
      },
    ],
  };
}
