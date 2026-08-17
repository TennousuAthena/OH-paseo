import type { TextMeasurer } from "./types";

export interface PrimaryTextFace {
  glyphIds(text: string): number[];
  measure(text: string): number;
}

const CODE_LIGATURE_CANDIDATE = /(?:===?|!==?|=>|<=|>=|->|::|\+\+|--)/;

export function requiresNativeParagraph(text: string): boolean {
  return /[^\x20-\x7e\t]/u.test(text) || CODE_LIGATURE_CANDIDATE.test(text);
}

export function createFallbackAwareTextMeasurer(input: {
  primary: PrimaryTextFace;
  measureWithSystemFallback: (text: string) => number;
}): TextMeasurer {
  return {
    measure(text) {
      if (text.length === 0) return 0;
      const hasEveryGlyph = input.primary.glyphIds(text).every((glyph) => glyph !== 0);
      return hasEveryGlyph ? input.primary.measure(text) : input.measureWithSystemFallback(text);
    },
  };
}
