import type { Theme } from "@/styles/theme";
import type { DiffCell, DiffPalette } from "./types";

export function createDiffPalette(theme: Theme): DiffPalette {
  return {
    surface: theme.colors.surface1,
    headerSurface: theme.colors.surface2,
    border: theme.colors.border,
    foreground: theme.colors.foreground,
    foregroundMuted: theme.colors.foregroundMuted,
    addition: theme.colors.diffAddition,
    deletion: theme.colors.diffDeletion,
    additionBackground: "rgba(46, 160, 67, 0.15)",
    deletionBackground: "rgba(248, 81, 73, 0.1)",
    emptyBackground: theme.colors.surfaceDiffEmpty,
    selection: theme.colors.surfaceSidebarHover,
    syntax: theme.colors.syntax,
  };
}

export function codeTextColor(cell: DiffCell, palette: DiffPalette): string {
  return cell.type === "header" ? palette.foregroundMuted : palette.foreground;
}

export function codeLineNumberTone(cell: DiffCell): "addition" | "deletion" | "foregroundMuted" {
  "worklet";
  if (cell.type === "add") return "addition";
  if (cell.type === "remove") return "deletion";
  return "foregroundMuted";
}
