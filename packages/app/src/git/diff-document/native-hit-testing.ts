import { hitTestDiffDocument } from "./hit-testing";
import type { DiffDocumentModel, DiffHit } from "./types";

export interface SurfaceWindowOrigin {
  x: number;
  y: number;
}

export function hitTestDiffPagePoint(input: {
  model: DiffDocumentModel;
  pageX: number;
  pageY: number;
  surfaceOrigin: SurfaceWindowOrigin;
  scrollTop: number;
  horizontalOffsetForPath: (path: string) => number;
}): DiffHit | null {
  const x = input.pageX - input.surfaceOrigin.x;
  const documentY = input.pageY - input.surfaceOrigin.y + input.scrollTop;
  const file = input.model.files.find(
    (entry) => entry.top <= documentY && documentY < entry.bottom,
  );
  return hitTestDiffDocument({
    model: input.model,
    x,
    documentY,
    horizontalOffset: file ? input.horizontalOffsetForPath(file.path) : 0,
  });
}
