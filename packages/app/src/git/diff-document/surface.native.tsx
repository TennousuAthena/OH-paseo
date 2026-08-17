import { Canvas, Picture, Skia } from "@shopify/react-native-skia";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, StyleSheet, View, type LayoutChangeEvent, type ViewStyle } from "react-native";
import {
  createAnimatedComponent,
  useAnimatedScrollHandler,
  useDerivedValue,
  useSharedValue,
} from "react-native-reanimated";
import { DocumentFileHeader } from "./document-file-header";
import { hitTestDiffPagePoint, type SurfaceWindowOrigin } from "./native-hit-testing";
import { HorizontalScroll } from "./horizontal-scroll.native";
import {
  horizontalOffsetForPath,
  retainHorizontalOffsetsForPaths,
  type DiffHorizontalOffsets,
} from "./horizontal-offsets";
import { buildDiffDocumentModel, captureScrollAnchor, resolveScrollAnchor } from "./model";
import { createNativePaints, paintNativeViewport } from "./paint.native";
import { createNativeTextLayout, createNativeTextMeasurer } from "./text.native";
import { InlineReviewThread } from "@/review";
import { inlineUnistylesStyle } from "@/styles/unistyles-inline-style";
import type { DiffSurfaceProps, DiffTypography, TextMeasurer } from "./types";

const AnimatedScrollView = createAnimatedComponent(ScrollView);
const SYSTEM_MONO = "monospace";

export function DiffSurface(props: DiffSurfaceProps) {
  const { t } = useTranslation();
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const touchRef = useRef<{ x: number; y: number; startedAt: number; moved: boolean } | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const rootRef = useRef<View>(null);
  const surfaceOriginRef = useRef<SurfaceWindowOrigin>({ x: 0, y: 0 });
  const previousModelRef = useRef<ReturnType<typeof buildDiffDocumentModel> | null>(null);
  const consumedFocusRef = useRef<string | null>(null);
  const scrollTop = useSharedValue(0);
  const horizontalOffsets = useSharedValue<DiffHorizontalOffsets>({});
  const family = props.displayPreferences.monoFontFamily.trim() || SYSTEM_MONO;
  const typography = useMemo<DiffTypography>(
    () => ({
      family,
      size: props.displayPreferences.codeFontSize,
      lineHeight: Math.round(props.displayPreferences.codeFontSize * 1.5),
    }),
    [family, props.displayPreferences.codeFontSize],
  );
  const measurement = useMemo<TextMeasurer>(
    () => createNativeTextMeasurer({ configuredFamily: family, fontSize: typography.size }),
    [family, typography.size],
  );
  const reviewActions = props.mode.kind === "working" ? props.mode.reviewActions : undefined;
  const model = useMemo(
    () =>
      buildDiffDocumentModel({
        files: props.files,
        collapsedFilePaths: props.collapsedFilePaths,
        layout: props.displayPreferences.layout,
        wrapLines: props.displayPreferences.wrapLines,
        viewportWidth: viewport.width,
        typography,
        measureText: measurement,
        palette: props.palette,
        reviewActions,
        labels: {
          binary: t("workspace.git.diff.binaryFile"),
          tooLarge: t("workspace.git.diff.tooLarge"),
        },
      }),
    [
      measurement,
      props.collapsedFilePaths,
      props.displayPreferences.layout,
      props.displayPreferences.wrapLines,
      props.files,
      props.palette,
      reviewActions,
      t,
      typography,
      viewport.width,
    ],
  );
  const paints = useMemo(() => createNativePaints(props.palette), [props.palette]);
  const textLayout = useMemo(
    () =>
      createNativeTextLayout({
        model,
        configuredFamily: family,
        fontSize: typography.size,
        palette: props.palette,
      }),
    [family, model, props.palette, typography.size],
  );
  const scrollHandler = useAnimatedScrollHandler((event) => {
    scrollTop.value = event.contentOffset.y;
  });
  const picture = useDerivedValue(() => {
    const recorder = Skia.PictureRecorder();
    const canvas = recorder.beginRecording(Skia.XYWHRect(0, 0, viewport.width, viewport.height));
    paintNativeViewport({
      canvas,
      model,
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
      scrollTop: scrollTop.value,
      horizontalOffsets: horizontalOffsets.value,
      textLayout,
      paints,
    });
    return recorder.finishRecordingAsPicture();
  }, [model, paints, textLayout, viewport.height, viewport.width]);
  const layout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setViewport({ width, height });
    rootRef.current?.measureInWindow((x, y) => {
      surfaceOriginRef.current = { x, y };
    });
  }, []);
  useLayoutEffect(() => {
    const previous = previousModelRef.current;
    if (previous && previous !== model) {
      const anchor = captureScrollAnchor(previous, scrollTop.value);
      if (anchor) {
        const nextScrollTop = resolveScrollAnchor(model, anchor);
        scrollTop.value = nextScrollTop;
        scrollRef.current?.scrollTo({ y: nextScrollTop, animated: false });
      }
    }
    previousModelRef.current = model;
  }, [model, scrollTop]);
  useLayoutEffect(() => {
    horizontalOffsets.value = retainHorizontalOffsetsForPaths(
      horizontalOffsets.value,
      model.files.map((file) => file.path),
    );
  }, [horizontalOffsets, model.files]);
  const mode = props.mode;
  const collapsedFilePaths = props.collapsedFilePaths;
  const onToggleFile = props.onToggleFile;
  useEffect(() => {
    if (mode.kind !== "working") return;
    const focusPath = mode.focusPath;
    if (!focusPath) return;
    const requestKey = `${mode.focusRequestId ?? "initial"}:${focusPath}`;
    if (consumedFocusRef.current === requestKey) return;
    if (collapsedFilePaths.has(focusPath)) onToggleFile(focusPath);
    const file = model.files.find((entry) => entry.path === focusPath);
    if (file) {
      scrollRef.current?.scrollTo({ y: file.top, animated: false });
      consumedFocusRef.current = requestKey;
    }
  }, [collapsedFilePaths, mode, model.files, onToggleFile]);
  const touchStart = useCallback((event: { nativeEvent: { pageX: number; pageY: number } }) => {
    touchRef.current = {
      x: event.nativeEvent.pageX,
      y: event.nativeEvent.pageY,
      startedAt: Date.now(),
      moved: false,
    };
  }, []);
  const touchMove = useCallback((event: { nativeEvent: { pageX: number; pageY: number } }) => {
    const touch = touchRef.current;
    if (
      touch &&
      Math.hypot(event.nativeEvent.pageX - touch.x, event.nativeEvent.pageY - touch.y) > 10
    )
      touch.moved = true;
  }, []);
  const touchEnd = useCallback(
    (event: { nativeEvent: { pageX: number; pageY: number } }) => {
      const touch = touchRef.current;
      touchRef.current = null;
      if (!touch || touch.moved || Date.now() - touch.startedAt > 500 || !reviewActions) return;
      const hit = hitTestDiffPagePoint({
        model,
        pageX: event.nativeEvent.pageX,
        pageY: event.nativeEvent.pageY,
        surfaceOrigin: surfaceOriginRef.current,
        scrollTop: scrollTop.value,
        horizontalOffsetForPath: (path) => horizontalOffsetForPath(horizontalOffsets.value, path),
      });
      if (hit?.kind === "cell" && hit.target) reviewActions.onStartComment(hit.target);
    },
    [horizontalOffsets, model, reviewActions, scrollTop],
  );
  const contentStyle = useMemo(() => ({ minHeight: viewport.height }), [viewport.height]);
  return (
    <View
      ref={rootRef}
      style={[styles.root, { backgroundColor: props.palette.surface }]}
      onLayout={layout}
    >
      <AnimatedScrollView
        ref={scrollRef}
        style={[StyleSheet.absoluteFill, styles.scroll]}
        contentContainerStyle={contentStyle}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator
        stickyHeaderIndices={model.files.map((_, index) => index * 2)}
        testID="git-diff-scroll"
        onTouchStart={touchStart}
        onTouchMove={touchMove}
        onTouchEnd={touchEnd}
      >
        {model.files.flatMap((file) => [
          <View key={`${file.path}:header`} style={styles.header}>
            <DocumentFileHeader
              file={file}
              selectedPath={props.selectedPath}
              mode={props.mode}
              onToggleFile={props.onToggleFile}
              onSelectPath={props.onSelectPath}
            />
          </View>,
          <View
            key={`${file.path}:body`}
            testID={`diff-file-${file.fileIndex}-body`}
            style={inlineUnistylesStyle<ViewStyle>({
              position: "relative",
              height: file.bodyHeight,
            })}
          >
            {!file.isCollapsed && !model.wrapLines ? (
              <HorizontalScroll file={file} offsets={horizontalOffsets} />
            ) : null}
            {props.mode.kind === "working" && reviewActions
              ? model.rows.slice(file.rowStart, file.rowEnd).flatMap((row) => {
                  if (row.kind !== "line" || row.reviewHeight === 0) return [];
                  const columnWidth = model.viewportWidth / row.cells.length;
                  return row.cells.flatMap((cell, index) => {
                    if (!cell?.reviewTarget) return [];
                    const comments =
                      reviewActions.commentsByTarget.get(cell.reviewTarget.key) ?? [];
                    const editor = reviewActions.editor;
                    const hasEditor =
                      editor?.target.filePath === cell.reviewTarget.filePath &&
                      editor.target.side === cell.reviewTarget.side &&
                      editor.target.lineNumber === cell.reviewTarget.lineNumber;
                    if (comments.length === 0 && !hasEditor) return [];
                    return [
                      <View
                        key={cell.reviewTarget.key}
                        style={inlineUnistylesStyle<ViewStyle>({
                          position: "absolute",
                          top: row.top - file.bodyTop + row.height - row.reviewHeight,
                          left: index * columnWidth,
                          width: columnWidth,
                          height: row.reviewHeight,
                          zIndex: 4,
                        })}
                      >
                        <InlineReviewThread
                          reviewTarget={cell.reviewTarget}
                          reviewActions={reviewActions}
                          height={row.reviewHeight}
                          viewportWidth={columnWidth}
                          pinToViewport={!model.wrapLines}
                        />
                      </View>,
                    ];
                  });
                })
              : null}
          </View>,
        ])}
      </AnimatedScrollView>
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, styles.canvas]}
        testID="git-diff-canvas"
      >
        <Canvas style={StyleSheet.absoluteFill}>
          <Picture picture={picture} />
        </Canvas>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0, position: "relative", overflow: "hidden" },
  canvas: { zIndex: 1 },
  scroll: { zIndex: 2 },
  header: { zIndex: 3 },
});
