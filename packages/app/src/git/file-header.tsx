import { memo, type ReactElement, useCallback, useMemo } from "react";
import { Text, View, type PressableStateCallbackType } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { useWorkspaceFileDragSource } from "@/attachments/use-workspace-file-drag-source";
import { DiffStat } from "@/components/diff-stat";
import { FileActionsContextMenuContent } from "@/components/file-actions-menu";
import { FileChangeIcon } from "@/components/file-change-icon";
import { MaterialFileIcon } from "@/components/material-file-icon";
import {
  TreeIndentGuides,
  treeRowPaddingLeft,
  WORKSPACE_FILE_ROW_TRAILING_PADDING,
  WORKSPACE_FILE_ROW_VERTICAL_PADDING,
  WORKSPACE_TREE_ICON_LABEL_GAP,
  WORKSPACE_TREE_ICON_SIZE,
} from "@/components/tree-primitives";
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useFileHeaderInteraction } from "@/git/file-header-interaction";
import type { ParsedDiffFile } from "@/git/use-diff-query";
import { inlineUnistylesStyle } from "@/styles/unistyles-inline-style";

export interface FileHeaderProps {
  file: ParsedDiffFile;
  workspaceFileDragScope?: { serverId: string; workspaceId: string };
  bodyVisible: boolean;
  showsBodyState?: boolean;
  isSelected?: boolean;
  depth?: number;
  showDir?: boolean;
  interactive?: boolean;
  onActivate?: (path: string) => void;
  onSelect?: (path: string) => void;
  onOpenFile?: (path: string) => void;
  onAddToChat?: (path: string) => void;
  onCopyPath?: (path: string) => void;
  onCopyRelativePath?: (path: string) => void;
  onReveal?: (path: string) => void;
  revealTargetName?: string;
  onDownload?: (path: string) => void;
  onDuplicate?: (path: string) => void;
  onRevert?: (path: string, oldPath?: string) => void;
  onHeaderHeightChange?: (path: string, height: number) => void;
  testID?: string;
}

function fileNameForPath(path: string): string {
  return path.split("/").pop() ?? path;
}

function directorySuffix(path: string): string {
  return path.includes("/") ? ` ${path.slice(0, path.lastIndexOf("/"))}` : "";
}

function fileHeaderAccessibilityState(input: {
  showsBodyState: boolean;
  bodyVisible: boolean;
  isSelected: boolean;
}) {
  return {
    ...(input.showsBodyState ? { expanded: input.bodyVisible } : {}),
    selected: input.isSelected,
  };
}

function expandedAriaValue(showsBodyState: boolean, bodyVisible: boolean): boolean | undefined {
  return showsBodyState ? bodyVisible : undefined;
}

function FileHeaderMenu({
  file,
  onOpenFile,
  onAddToChat,
  onCopyPath,
  onCopyRelativePath,
  onReveal,
  revealTargetName,
  onDownload,
  onDuplicate,
  onRevert,
  testID,
}: FileHeaderProps) {
  const openFile = useCallback(() => onOpenFile?.(file.path), [file.path, onOpenFile]);
  const addToChat = useCallback(() => onAddToChat?.(file.path), [file.path, onAddToChat]);
  const copyPath = useCallback(() => onCopyPath?.(file.path), [file.path, onCopyPath]);
  const copyRelativePath = useCallback(
    () => onCopyRelativePath?.(file.path),
    [file.path, onCopyRelativePath],
  );
  const reveal = useCallback(() => onReveal?.(file.path), [file.path, onReveal]);
  const download = useCallback(() => onDownload?.(file.path), [file.path, onDownload]);
  const duplicate = useCallback(() => onDuplicate?.(file.path), [file.path, onDuplicate]);
  const revert = useCallback(
    () => onRevert?.(file.path, file.oldPath),
    [file.oldPath, file.path, onRevert],
  );
  return (
    <FileActionsContextMenuContent
      fileKind="file"
      fileExists={!file.isDeleted}
      onOpenFile={onOpenFile ? openFile : undefined}
      onCopyPath={onCopyPath ? copyPath : undefined}
      onCopyRelativePath={onCopyRelativePath ? copyRelativePath : undefined}
      onReveal={onReveal ? reveal : undefined}
      revealTargetName={revealTargetName}
      onDownload={onDownload ? download : undefined}
      onAddToChat={onAddToChat ? addToChat : undefined}
      onDuplicate={!file.isDeleted && onDuplicate ? duplicate : undefined}
      onRevert={onRevert ? revert : undefined}
      testIDPrefix={testID}
    />
  );
}

export const FileHeader = memo(function FileHeader({
  file,
  workspaceFileDragScope,
  bodyVisible,
  showsBodyState = true,
  isSelected = false,
  depth = 0,
  showDir = true,
  interactive = true,
  onActivate,
  onSelect,
  onHeaderHeightChange,
  testID,
  ...actions
}: FileHeaderProps) {
  const dragSourceRef = useWorkspaceFileDragSource({
    enabled: interactive,
    disabled: file.isDeleted,
    workspaceId: null,
    path: file.path,
    ...workspaceFileDragScope,
  });
  const interaction = useFileHeaderInteraction({
    path: file.path,
    enabled: interactive,
    onSelect,
    onActivate,
    onLayout: useCallback(
      (height: number) => onHeaderHeightChange?.(file.path, height),
      [file.path, onHeaderHeightChange],
    ),
  });
  const pressableStyle = useCallback(
    ({ hovered, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.header,
      showsBodyState && styles.documentHeader,
      depth > 0 ? inlineUnistylesStyle({ paddingLeft: treeRowPaddingLeft(depth) }) : null,
      (Boolean(hovered) || pressed || isSelected) && styles.active,
    ],
    [depth, isSelected, showsBodyState],
  );
  const accessibilityState = useMemo(
    () => fileHeaderAccessibilityState({ showsBodyState, bodyVisible, isSelected }),
    [bodyVisible, isSelected, showsBodyState],
  );
  const fileName = fileNameForPath(file.path);
  const content = (
    <View
      style={[styles.content, showsBodyState && styles.documentContent]}
      testID={testID ? `${testID}-header-content` : undefined}
    >
      <View ref={dragSourceRef} style={showDir ? styles.left : [styles.left, styles.leftTree]}>
        {showDir ? null : (
          <View style={styles.icon}>
            <MaterialFileIcon fileName={fileName} size={WORKSPACE_TREE_ICON_SIZE} />
          </View>
        )}
        <Text style={styles.name} numberOfLines={1} testID={testID ? `${testID}-name` : undefined}>
          {fileName}
        </Text>
        {showDir ? (
          <Text style={styles.directory} numberOfLines={1}>
            {directorySuffix(file.path)}
          </Text>
        ) : (
          <View style={styles.directorySpacer} />
        )}
        {file.isNew ? <FileChangeIcon change="added" /> : null}
        {file.isDeleted ? <FileChangeIcon change="deleted" /> : null}
      </View>
      <View style={styles.right}>
        <DiffStat
          additions={file.additions}
          deletions={file.deletions}
          testID={testID ? `${testID}-stat` : undefined}
        />
      </View>
    </View>
  );
  let trigger: ReactElement;
  if (interactive) {
    trigger = (
      <ContextMenuTrigger
        testID={testID ? `${testID}-toggle` : undefined}
        style={pressableStyle}
        cancelable={false}
        onPressIn={interaction.onPressIn}
        onPressOut={interaction.onPressOut}
        onLongPress={interaction.onLongPress}
        onContextMenu={interaction.select}
        onPress={interaction.activate}
        accessibilityState={accessibilityState}
        aria-expanded={expandedAriaValue(showsBodyState, bodyVisible)}
        aria-selected={isSelected}
      >
        {content}
      </ContextMenuTrigger>
    );
  } else {
    trigger = <View style={pressableStyle({ hovered: false, pressed: false })}>{content}</View>;
  }
  return (
    <View
      style={[
        styles.container,
        showsBodyState && styles.documentContainer,
        bodyVisible && styles.expanded,
      ]}
      onLayout={interaction.onLayout}
      testID={testID}
    >
      <TreeIndentGuides depth={depth} />
      <ContextMenu>
        <Tooltip delayDuration={300} enabledOnDesktop enabledOnMobile={false}>
          <TooltipTrigger asChild>{trigger}</TooltipTrigger>
          <TooltipContent side="bottom" align="start" offset={6} maxWidth={520}>
            <Text style={styles.tooltip}>{file.path}</Text>
          </TooltipContent>
        </Tooltip>
        {interactive ? (
          <FileHeaderMenu file={file} testID={testID} {...actions} bodyVisible={bodyVisible} />
        ) : null}
      </ContextMenu>
    </View>
  );
});

const styles = StyleSheet.create((theme) => ({
  container: { overflow: "hidden", userSelect: "none" },
  documentContainer: {
    height: 44,
    backgroundColor: theme.colors.surface2,
    borderBottomWidth: theme.borderWidth[1],
    borderBottomColor: theme.colors.border,
  },
  expanded: { backgroundColor: theme.colors.surface1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: theme.spacing[3],
    paddingRight: WORKSPACE_FILE_ROW_TRAILING_PADDING,
    paddingVertical: WORKSPACE_FILE_ROW_VERTICAL_PADDING,
    gap: theme.spacing[1],
    minWidth: 0,
    zIndex: 2,
    elevation: 2,
    userSelect: "none",
  },
  documentHeader: { height: 43, paddingHorizontal: 0, paddingVertical: 0 },
  content: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    userSelect: "none",
  },
  documentContent: { height: 43, paddingHorizontal: theme.spacing[3] },
  active: { backgroundColor: theme.colors.surfaceSidebarHover },
  left: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    flex: 1,
    minWidth: 0,
    userSelect: "none",
  },
  leftTree: { gap: WORKSPACE_TREE_ICON_LABEL_GAP },
  right: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    flexShrink: 0,
    userSelect: "none",
  },
  icon: {
    width: WORKSPACE_TREE_ICON_SIZE,
    height: WORKSPACE_TREE_ICON_SIZE,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  name: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.normal,
    color: theme.colors.foreground,
    flexShrink: 1,
    minWidth: 0,
    userSelect: "none",
  },
  directory: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.normal,
    color: theme.colors.foregroundMuted,
    flex: 1,
    minWidth: 0,
    userSelect: "none",
  },
  directorySpacer: { flex: 1, minWidth: 0 },
  tooltip: { color: theme.colors.popoverForeground, fontSize: theme.fontSize.sm },
}));
