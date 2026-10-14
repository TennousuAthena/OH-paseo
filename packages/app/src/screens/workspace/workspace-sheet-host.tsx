import BottomSheet, {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  type BottomSheetHandleProps,
} from "@gorhom/bottom-sheet";
import { useIsFocused } from "@react-navigation/native";
import {
  type ComponentType,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import {
  SheetBackground,
  SheetHandle,
  SheetHeaderView,
  type SheetHeader,
} from "@/components/adaptive-modal-sheet";
import { systemBackPress } from "@/components/ui/isolated-bottom-sheet-modal";
import { RetainedPanelActivity } from "@/components/retained-panel";
import { Button } from "@/components/ui/button";
import type { PanelIconProps } from "@/panels/panel-registry";
import { getPanelRegistration } from "@/panels/panel-registry";
import { ensurePanelsRegistered } from "@/panels/register-panels";
import type { WorkspaceTabDescriptor } from "@/screens/workspace/workspace-tabs-types";
import {
  WorkspacePaneContent,
  type WorkspacePaneContentModel,
} from "@/screens/workspace/workspace-pane-content";
import { useWorkspaceLayoutStore, type WorkspaceSheet } from "@/stores/workspace-layout-store";

const SNAP_POINTS = ["92%"];
const NO_SHEETS: readonly WorkspaceSheet[] = [];

function PanelIcon({
  icon: Icon,
  size,
  color,
}: { icon: ComponentType<PanelIconProps> } & PanelIconProps) {
  return <Icon size={size} color={color} />;
}

const ThemedPanelIcon = withUnistyles(PanelIcon, (theme) => ({
  color: theme.colors.foregroundMuted,
}));

// The workspace sheet is a Gorhom sheet rendered in place rather than a portaled modal, so the
// backdrop closes the sheet itself instead of dismissing the top of the modal stack.
function renderBackdrop(props: BottomSheetBackdropProps) {
  return (
    <BottomSheetBackdrop
      {...props}
      appearsOnIndex={0}
      disappearsOnIndex={-1}
      opacity={0.45}
      pressBehavior="close"
    />
  );
}

// Stacked sheets share the bottom sheet's dim rather than darkening it again, but still catch the
// tap so it closes the top sheet. The backdrop is clear rather than transparent: iOS skips views
// under 0.01 opacity when hit testing, which would hand the tap to the sheet below.
function renderStackedBackdrop(props: BottomSheetBackdropProps) {
  return (
    <BottomSheetBackdrop
      {...props}
      style={styles.clearBackdrop}
      appearsOnIndex={0}
      disappearsOnIndex={-1}
      opacity={1}
      pressBehavior="close"
    />
  );
}

interface WorkspaceSheetHandleValue {
  header: SheetHeader;
  onClose: () => void;
}

const WorkspaceSheetHandleContext = createContext<WorkspaceSheetHandleValue | null>(null);

// Gorhom renders `handleComponent` as a component type, so it stays one module-level component and
// reads the header from context; a per-render function would remount the header on every change.
function WorkspaceSheetHandle(props: BottomSheetHandleProps) {
  const value = useContext(WorkspaceSheetHandleContext);
  if (!value) throw new Error("WorkspaceSheetHandle must render inside a workspace sheet");
  return (
    <SheetHandle {...props}>
      <SheetHeaderView
        header={value.header}
        onClose={value.onClose}
        testID="workspace-sheet-header"
      />
    </SheetHandle>
  );
}

export interface WorkspaceSheetHostProps {
  workspaceKey: string | null;
  serverId: string;
  workspaceId: string;
  isWorkspaceFocused: boolean;
  buildContent: (tab: WorkspaceTabDescriptor) => WorkspacePaneContentModel;
  /** The workspace's ordinary tab close, including its unsaved-changes guard. */
  onCloseTab: (tabId: string) => Promise<void>;
}

interface WorkspaceSheetPresentationProps extends Omit<
  WorkspaceSheetHostProps,
  "workspaceKey" | "onCloseTab"
> {
  sheet: WorkspaceSheet;
  /** Only the bottom sheet dims the workspace; the ones above share its dim. */
  isBottom: boolean;
  /** Only the top sheet answers Android Back; the ones below wait their turn. */
  isTop: boolean;
  onClose: (tabId: string) => Promise<void>;
  onOpenAsTab: (tabId: string) => void;
}

/**
 * Hosts the workspace's sheets over the compact tab strip, one Gorhom sheet per entry, top last.
 * They render in the workspace tree, not through a portal, so each panel keeps every context an
 * ordinary pane has. The shared sheet parts (`SheetBackground`, `SheetHandle`, `SheetHeaderView`)
 * keep them looking and dragging like every other sheet.
 */
export function WorkspaceSheetHost({ workspaceKey, onCloseTab, ...rest }: WorkspaceSheetHostProps) {
  const sheets = useWorkspaceLayoutStore((state) =>
    workspaceKey ? (state.sheetsByWorkspace[workspaceKey] ?? NO_SHEETS) : NO_SHEETS,
  );
  const openSheetAsTab = useWorkspaceLayoutStore((state) => state.openSheetAsTab);
  const handleOpenAsTab = useCallback(
    (tabId: string) => {
      if (workspaceKey) openSheetAsTab(workspaceKey, tabId);
    },
    [openSheetAsTab, workspaceKey],
  );
  if (sheets.length === 0) return null;
  return (
    <View style={styles.host} pointerEvents="box-none">
      {sheets.map((sheet, index) => (
        <WorkspaceSheetPresentation
          // Keyed by tab id and kind, so the registration and its descriptor hook stay fixed.
          key={`${sheet.tab.tabId}:${sheet.tab.target.kind}`}
          {...rest}
          sheet={sheet}
          isBottom={index === 0}
          isTop={index === sheets.length - 1}
          onClose={onCloseTab}
          onOpenAsTab={handleOpenAsTab}
        />
      ))}
    </View>
  );
}

function WorkspaceSheetPresentation({
  sheet,
  isBottom,
  isTop,
  serverId,
  workspaceId,
  isWorkspaceFocused,
  buildContent,
  onClose,
  onOpenAsTab,
}: WorkspaceSheetPresentationProps) {
  const { t } = useTranslation();
  const { tab } = sheet;
  const sheetRef = useRef<BottomSheet>(null);
  const isScreenFocused = useIsFocused();
  ensurePanelsRegistered();
  const registration = getPanelRegistration(tab.target.kind);
  if (!registration) {
    throw new Error(`No panel registration for kind: ${tab.target.kind}`);
  }
  const descriptor = registration.useDescriptor(tab.target as never, {
    serverId,
    workspaceId,
    tabId: tab.tabId,
  });

  const handleClose = useCallback(() => onClose(tab.tabId), [onClose, tab.tabId]);
  const handleChange = useCallback(
    (index: number) => {
      if (index !== -1) return;
      // A declined close (unsaved changes) leaves the tab in the sheet, so bring it back up.
      void handleClose().then(() => sheetRef.current?.snapToIndex(0));
    },
    [handleClose],
  );
  // Hidden workspaces stay mounted in the deck and under Settings; only the visible one owns back.
  const ownsBackPress = isTop && isWorkspaceFocused && isScreenFocused;
  useEffect(() => {
    if (!ownsBackPress) return;
    return systemBackPress.subscribe(() => {
      void handleClose();
      return true;
    });
  }, [handleClose, ownsBackPress]);

  const handleOpenAsTab = useCallback(() => onOpenAsTab(tab.tabId), [onOpenAsTab, tab.tabId]);
  const header = useMemo<SheetHeader>(
    () => ({
      title: descriptor.label,
      leading: <ThemedPanelIcon icon={descriptor.icon} size={16} />,
      actions: sheet.policy.openAsTab ? (
        <Button size="sm" variant="secondary" onPress={handleOpenAsTab}>
          {t("workspace.sheet.openAsTab")}
        </Button>
      ) : undefined,
    }),
    [descriptor.icon, descriptor.label, handleOpenAsTab, sheet.policy.openAsTab, t],
  );
  const handleHeaderClose = useCallback(() => {
    void handleClose();
  }, [handleClose]);
  const handleValue = useMemo<WorkspaceSheetHandleValue>(
    () => ({ header, onClose: handleHeaderClose }),
    [handleHeaderClose, header],
  );

  return (
    // Gorhom renders the handle beside the content, so the dialog wraps the whole sheet.
    <View
      style={styles.sheetLayer}
      pointerEvents="box-none"
      role="dialog"
      aria-label={descriptor.label}
    >
      {/* The header is the sheet's handle: the panel scrolls on its own, so dragging the content
          would fight it, and the header is where people reach to pull the sheet down. */}
      <WorkspaceSheetHandleContext.Provider value={handleValue}>
        <BottomSheet
          ref={sheetRef}
          index={0}
          snapPoints={SNAP_POINTS}
          enableDynamicSizing={false}
          enablePanDownToClose
          enableContentPanningGesture={false}
          backgroundComponent={SheetBackground}
          handleComponent={WorkspaceSheetHandle}
          backdropComponent={isBottom ? renderBackdrop : renderStackedBackdrop}
          onChange={handleChange}
          accessible={false}
        >
          {/* A covered sheet keeps its state but stops its live work until it is on top again. */}
          <RetainedPanelActivity active={isTop}>
            <WorkspaceSheetBody
              tab={tab}
              isPaneFocused={isTop && isWorkspaceFocused}
              isWorkspaceFocused={isWorkspaceFocused}
              buildContent={buildContent}
            />
          </RetainedPanelActivity>
        </BottomSheet>
      </WorkspaceSheetHandleContext.Provider>
    </View>
  );
}

function WorkspaceSheetBody({
  tab,
  isPaneFocused,
  isWorkspaceFocused,
  buildContent,
}: {
  tab: WorkspaceSheet["tab"];
  /** Only the top sheet's pane is focused; the ones below are covered. */
  isPaneFocused: boolean;
  isWorkspaceFocused: boolean;
  buildContent: (tab: WorkspaceTabDescriptor) => WorkspacePaneContentModel;
}) {
  const tabDescriptor = useMemo<WorkspaceTabDescriptor>(
    () => ({
      key: tab.tabId,
      tabId: tab.tabId,
      kind: tab.target.kind,
      target: tab.target,
      state: tab.state,
    }),
    [tab],
  );
  const content = useMemo(() => buildContent(tabDescriptor), [buildContent, tabDescriptor]);
  // The sheet reaches the bottom of the screen, so it owns the system navigation inset.
  const { bottom: bottomInset } = useSafeAreaInsets();
  const contentStyle = useMemo(
    () => [styles.content, { paddingBottom: bottomInset }],
    [bottomInset],
  );

  return (
    <View style={contentStyle} testID="workspace-sheet-body">
      <WorkspacePaneContent
        content={content}
        isWorkspaceFocused={isWorkspaceFocused}
        isPaneFocused={isPaneFocused}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    ...StyleSheet.absoluteFillObject,
  },
  clearBackdrop: {
    backgroundColor: "transparent",
  },
  sheetLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  content: {
    flex: 1,
    minHeight: 0,
  },
});
