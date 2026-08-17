import { ClipOp, Skia, type SkCanvas, type SkPaint } from "@shopify/react-native-skia";
import { visibleRowRange } from "./model";
import { horizontalOffsetForPath, type DiffHorizontalOffsets } from "./horizontal-offsets";
import { codeLineNumberTone } from "./palette";
import { reviewBackgroundPaint, reviewDividerHeight, reviewGapTop } from "./review-paint";
import type { NativeTextLayout } from "./text.native";
import type { DiffCell, DiffDocumentModel, DiffLineRow, DiffPalette } from "./types";

const CODE_LEFT_PADDING = 8;

interface NativePaints {
  surface: SkPaint;
  border: SkPaint;
  foregroundMuted: SkPaint;
  addition: SkPaint;
  deletion: SkPaint;
  additionBackground: SkPaint;
  deletionBackground: SkPaint;
  headerSurface: SkPaint;
  emptyBackground: SkPaint;
  syntax: Record<string, SkPaint>;
}

export function createNativePaints(palette: DiffPalette): NativePaints {
  return {
    surface: paint(palette.surface),
    border: paint(palette.border),
    foregroundMuted: paint(palette.foregroundMuted),
    addition: paint(palette.addition),
    deletion: paint(palette.deletion),
    additionBackground: paint(palette.additionBackground),
    deletionBackground: paint(palette.deletionBackground),
    headerSurface: paint(palette.headerSurface),
    emptyBackground: paint(palette.emptyBackground),
    syntax: Object.fromEntries(Object.values(palette.syntax).map((color) => [color, paint(color)])),
  };
}

function paint(color: string): SkPaint {
  const result = Skia.Paint();
  result.setColor(Skia.Color(color));
  return result;
}

export function paintNativeViewport(input: {
  canvas: SkCanvas;
  model: DiffDocumentModel;
  viewportWidth: number;
  viewportHeight: number;
  scrollTop: number;
  horizontalOffsets: Readonly<DiffHorizontalOffsets>;
  textLayout: NativeTextLayout;
  paints: NativePaints;
}): void {
  "worklet";
  input.canvas.drawRect(
    Skia.XYWHRect(0, 0, input.viewportWidth, input.viewportHeight),
    input.paints.surface,
  );
  const range = visibleRowRange(input.model.rows, input.scrollTop, input.viewportHeight);
  for (let index = range.start; index < range.end; index += 1) {
    const row = input.model.rows[index];
    if (!row) continue;
    const y = row.top - input.scrollTop;
    if (row.kind === "status") {
      input.canvas.drawText(
        row.label,
        12,
        y + input.model.lineHeight,
        input.paints.foregroundMuted,
        input.textLayout.font,
      );
      continue;
    }
    paintLine({
      ...input,
      row,
      y,
      horizontalOffset: horizontalOffsetForPath(input.horizontalOffsets, row.path),
    });
  }
}

function paintLine(input: {
  canvas: SkCanvas;
  model: DiffDocumentModel;
  viewportWidth: number;
  row: DiffLineRow;
  y: number;
  horizontalOffset: number;
  textLayout: NativeTextLayout;
  paints: NativePaints;
}): void {
  "worklet";
  const file = input.model.files[input.row.fileIndex];
  if (!file) return;
  const columnWidth = input.viewportWidth / input.row.cells.length;
  input.row.cells.forEach((cell, cellIndex) => {
    const columnX = cellIndex * columnWidth;
    input.canvas.drawRect(
      Skia.XYWHRect(columnX, input.y, columnWidth, input.row.height),
      background(cell, input.paints),
    );
    if (input.row.reviewHeight > 0) {
      input.canvas.drawRect(
        Skia.XYWHRect(
          columnX,
          reviewGapTop(input.y, input.row.height, input.row.reviewHeight),
          columnWidth,
          input.row.reviewHeight,
        ),
        reviewBackgroundPaint(input.paints.surface),
      );
    }
    if (!cell) return;
    input.canvas.drawRect(
      Skia.XYWHRect(columnX + file.gutterWidth, input.y, 1, reviewDividerHeight(input.row.height)),
      input.paints.border,
    );
    if (cell.lineNumber !== null) {
      const label = String(cell.lineNumber);
      const font = input.textLayout.font;
      input.canvas.drawText(
        label,
        columnX + file.gutterWidth - 7 - font.getTextWidth(label),
        input.y + input.model.lineHeight * 0.78,
        lineNumberPaint(cell, input.paints),
        font,
      );
    }
    const textX = columnX + file.gutterWidth + CODE_LEFT_PADDING;
    input.canvas.save();
    input.canvas.clipRect(
      Skia.XYWHRect(
        textX,
        input.y,
        columnWidth - file.gutterWidth - CODE_LEFT_PADDING,
        input.row.height,
      ),
      ClipOp.Intersect,
      false,
    );
    const offset = input.model.wrapLines ? 0 : input.horizontalOffset;
    for (const [fragmentIndex, fragment] of cell.fragments.entries()) {
      const paragraph = input.textLayout.paragraphs[input.row.index]?.[cellIndex]?.[fragmentIndex];
      paragraph?.paint(input.canvas, textX - offset, input.y + fragment.top);
    }
    input.canvas.restore();
  });
}

function background(cell: DiffCell | null, paints: NativePaints): SkPaint {
  "worklet";
  if (!cell) return paints.emptyBackground;
  if (cell.type === "add") return paints.additionBackground;
  if (cell.type === "remove") return paints.deletionBackground;
  if (cell.type === "header") return paints.headerSurface;
  return paints.surface;
}

function lineNumberPaint(cell: DiffCell, paints: NativePaints): SkPaint {
  "worklet";
  return paints[codeLineNumberTone(cell)];
}
