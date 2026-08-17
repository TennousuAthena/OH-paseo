import { memo, useCallback } from "react";
import { FileHeader } from "@/git/file-header";
import type { DiffFileSection } from "./types";
import type { DiffDocumentProps } from "./types";

export const DocumentFileHeader = memo(function DocumentFileHeader({
  file,
  selectedPath,
  mode,
  onToggleFile,
  onSelectPath,
}: {
  file: DiffFileSection;
  selectedPath: string | null;
  mode: DiffDocumentProps["mode"];
  onToggleFile: (path: string) => void;
  onSelectPath: (path: string) => void;
}) {
  const activate = useCallback(
    (path: string) => {
      if (mode.kind !== "working") return;
      mode.onFilePress?.(path);
      onToggleFile(path);
    },
    [mode, onToggleFile],
  );
  const working = mode.kind === "working" ? mode : null;
  return (
    <FileHeader
      file={file.file}
      bodyVisible={!file.isCollapsed}
      isSelected={selectedPath === file.path}
      interactive={mode.kind === "working"}
      workspaceFileDragScope={working?.workspaceFileDragScope}
      onActivate={activate}
      onSelect={onSelectPath}
      onOpenFile={working?.onOpenFile}
      onAddToChat={working?.onAddToChat}
      onCopyPath={working?.onCopyPath}
      onCopyRelativePath={working?.onCopyRelativePath}
      onReveal={working?.onReveal}
      revealTargetName={working?.revealTargetName}
      onDownload={working?.onDownload}
      onDuplicate={working?.onDuplicate}
      onRevert={working?.onRevert}
      testID={`diff-file-${file.fileIndex}`}
    />
  );
});
