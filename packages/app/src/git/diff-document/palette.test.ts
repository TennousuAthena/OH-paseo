import { describe, expect, it } from "vitest";
import { codeLineNumberTone, codeTextColor } from "./palette";
import type { DiffCell, DiffPalette } from "./types";

describe("diff text color", () => {
  it.each(["add", "remove", "context"] as const)(
    "uses normal code foreground for an untokenized %s line",
    (type) => {
      expect(codeTextColor(cell(type), palette)).toBe("foreground");
    },
  );

  it.each([
    ["add", "addition"],
    ["remove", "deletion"],
    ["context", "foregroundMuted"],
  ] as const)("uses the %s gutter tone for native and web line numbers", (type, tone) => {
    expect(codeLineNumberTone(cell(type))).toBe(tone);
  });
});

const palette: DiffPalette = {
  surface: "surface",
  headerSurface: "header",
  border: "border",
  foreground: "foreground",
  foregroundMuted: "muted",
  addition: "green",
  deletion: "red",
  additionBackground: "green-bg",
  deletionBackground: "red-bg",
  emptyBackground: "empty",
  selection: "selection",
  syntax: {},
};

function cell(type: DiffCell["type"]): DiffCell {
  return {
    type,
    content: "code",
    lineNumber: 1,
    tokens: [],
    fragments: [],
    reviewTarget: null,
    sourceIdentity: { hunkIndex: 0, lineIndex: 1, side: "new" },
  };
}
