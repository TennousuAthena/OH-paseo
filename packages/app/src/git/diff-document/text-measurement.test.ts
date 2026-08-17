import { describe, expect, it } from "vitest";
import {
  createFallbackAwareTextMeasurer,
  requiresNativeParagraph,
  type PrimaryTextFace,
} from "./text-measurement";

describe.each(["ios", "android"])("%s native text measurement", (platform) => {
  it("routes CJK and emoji missing glyphs through the system fallback shaper", () => {
    const fallbackInputs: string[] = [];
    const measurer = createFallbackAwareTextMeasurer({
      primary: primaryFaceWithout("中", "👨‍👩‍👧‍👦"),
      measureWithSystemFallback(text) {
        fallbackInputs.push(text);
        return platform === "ios" ? 24 : 22;
      },
    });

    expect(measurer.measure("中")).toBe(platform === "ios" ? 24 : 22);
    expect(measurer.measure("👨‍👩‍👧‍👦")).toBe(platform === "ios" ? 24 : 22);
    expect(fallbackInputs).toEqual(["中", "👨‍👩‍👧‍👦"]);
  });

  it("keeps combining graphemes intact when the primary face supports them", () => {
    const measurer = createFallbackAwareTextMeasurer({
      primary: primaryFaceWithout(),
      measureWithSystemFallback: () => 99,
    });
    expect(measurer.measure("é")).toBe(20);
  });
});

describe("native paragraph retention", () => {
  it("keeps ordinary code on the allocation-free font path", () => {
    expect(requiresNativeParagraph("const answer = value + 1;")).toBe(false);
  });

  it.each(["value => next", "中", "e\u0301", "👩‍💻", "مرحبا"])("retains shaping for %s", (text) => {
    expect(requiresNativeParagraph(text)).toBe(true);
  });
});

function primaryFaceWithout(...missing: string[]): PrimaryTextFace {
  return {
    glyphIds(text) {
      const isMissing = missing.some((candidate) => text.includes(candidate));
      return Array.from(text, () => (isMissing ? 0 : 1));
    },
    measure(text) {
      return Array.from(text).length * 10;
    },
  };
}
