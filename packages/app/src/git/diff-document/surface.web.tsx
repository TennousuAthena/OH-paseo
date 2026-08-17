import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { InlineReviewThread } from "@/review";
import type { ReviewableDiffTarget } from "@/utils/diff-layout";
import { DocumentFileHeader } from "./document-file-header";
import { hitTestDiffDocument, selectedSourceText } from "./hit-testing";
import { retainHorizontalOffsetMapForPaths } from "./horizontal-offsets";
import { HorizontalScroll } from "./horizontal-scroll.web";
import { buildDiffDocumentModel, captureScrollAnchor, resolveScrollAnchor } from "./model";
import { paintWebViewport } from "./paint.web";
import { hasPointerDragStarted } from "./pointer-gesture";
import type {
  DiffHit,
  DiffSelection,
  DiffSurfaceProps,
  DiffTypography,
  TextMeasurer,
} from "./types";

const DEFAULT_MONO_STACK = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";

export function DiffSurface(props: DiffSurfaceProps) {
  const { t } = useTranslation();
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const modelRef = useRef<ReturnType<typeof buildDiffDocumentModel> | null>(null);
  const previousModelRef = useRef<ReturnType<typeof buildDiffDocumentModel> | null>(null);
  const consumedFocusRef = useRef<string | null>(null);
  const scrollTopRef = useRef(0);
  const horizontalOffsetsRef = useRef(new Map<string, number>());
  const selectionRef = useRef<DiffSelection | null>(null);
  const dragRef = useRef<{
    anchor: DiffSelection["anchor"];
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);
  const frameRef = useRef<number | null>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [loadedTypography, setLoadedTypography] = useState<DiffTypography | null>(null);
  const [hoveredAffordance, setHoveredAffordance] = useState<{
    hit: Extract<DiffHit, { kind: "cell" }>;
    left: number;
    top: number;
  } | null>(null);
  const hasHoveredAffordanceRef = useRef(false);
  const family = props.displayPreferences.monoFontFamily.trim() || DEFAULT_MONO_STACK;
  useLayoutEffect(() => {
    const stats = (window as typeof window & { __PASEO_DIFF_REACT_STATS__?: { commits: number } })
      .__PASEO_DIFF_REACT_STATS__;
    if (stats) stats.commits += 1;
  });
  const desiredTypography = useMemo<DiffTypography>(
    () => ({
      family,
      size: props.displayPreferences.codeFontSize,
      lineHeight: Math.round(props.displayPreferences.codeFontSize * 1.5),
    }),
    [family, props.displayPreferences.codeFontSize],
  );
  const measurement = useMemo(
    () => (loadedTypography ? createWebTextMeasurer(loadedTypography) : null),
    [loadedTypography],
  );
  const reviewActions = props.mode.kind === "working" ? props.mode.reviewActions : undefined;
  const model = useMemo(() => {
    if (!loadedTypography || !measurement) {
      return emptyDiffDocumentModel({
        layout: props.displayPreferences.layout,
        wrapLines: props.displayPreferences.wrapLines,
        viewportWidth: viewport.width,
        lineHeight: desiredTypography.lineHeight,
      });
    }
    return buildDiffDocumentModel({
      files: props.files,
      collapsedFilePaths: props.collapsedFilePaths,
      layout: props.displayPreferences.layout,
      wrapLines: props.displayPreferences.wrapLines,
      viewportWidth: viewport.width,
      typography: loadedTypography,
      measureText: measurement,
      palette: props.palette,
      reviewActions,
      labels: {
        binary: t("workspace.git.diff.binaryFile"),
        tooLarge: t("workspace.git.diff.tooLarge"),
      },
    });
  }, [
    measurement,
    props.collapsedFilePaths,
    props.displayPreferences.layout,
    props.displayPreferences.wrapLines,
    props.files,
    props.palette,
    reviewActions,
    t,
    desiredTypography.lineHeight,
    loadedTypography,
    viewport.width,
  ]);
  modelRef.current = model;

  const paint = useCallback(() => {
    frameRef.current = null;
    const canvas = canvasRef.current;
    const currentModel = modelRef.current;
    if (!canvas || !currentModel || viewport.width <= 0 || viewport.height <= 0) return;
    const ratio = window.devicePixelRatio || 1;
    const pixelWidth = Math.ceil(viewport.width * ratio);
    const pixelHeight = Math.ceil(viewport.height * ratio);
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    const context = canvas.getContext("2d");
    if (!context) return;
    if (!measurement || !loadedTypography) return;
    paintWebViewport({
      context,
      model: currentModel,
      palette: props.palette,
      typography: loadedTypography,
      measureText: measurement,
      scrollTop: scrollTopRef.current,
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
      horizontalOffsets: horizontalOffsetsRef.current,
      selection: selectionRef.current,
      devicePixelRatio: ratio,
    });
  }, [loadedTypography, measurement, props.palette, viewport.height, viewport.width]);
  const schedulePaint = useCallback(() => {
    if (frameRef.current === null) frameRef.current = requestAnimationFrame(paint);
  }, [paint]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setViewport({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(root);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await Promise.all([
        document.fonts.load(`400 ${desiredTypography.size}px ${desiredTypography.family}`),
        document.fonts.load(`600 ${desiredTypography.size}px ${desiredTypography.family}`),
      ]);
      await document.fonts.ready;
      if (!cancelled) setLoadedTypography(desiredTypography);
    })();
    return () => {
      cancelled = true;
    };
  }, [desiredTypography]);
  useLayoutEffect(() => {
    const previous = previousModelRef.current;
    const scroll = scrollRef.current;
    if (previous && scroll && previous !== model) {
      const anchor = captureScrollAnchor(previous, scroll.scrollTop);
      if (anchor) {
        const nextScrollTop = resolveScrollAnchor(model, anchor);
        scrollTopRef.current = nextScrollTop;
        scroll.scrollTop = nextScrollTop;
      }
    }
    previousModelRef.current = model;
  }, [model]);
  useLayoutEffect(() => {
    horizontalOffsetsRef.current = retainHorizontalOffsetMapForPaths(
      horizontalOffsetsRef.current,
      props.files.map((file) => file.path),
    );
  }, [props.files]);
  useEffect(schedulePaint, [model, schedulePaint]);
  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    },
    [],
  );
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
    if (file && scrollRef.current) {
      scrollRef.current.scrollTop = file.top;
      consumedFocusRef.current = requestKey;
    }
  }, [collapsedFilePaths, mode, model.files, onToggleFile]);

  const handleVerticalScroll = useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      scrollTopRef.current = event.currentTarget.scrollTop;
      if (hasHoveredAffordanceRef.current) {
        hasHoveredAffordanceRef.current = false;
        setHoveredAffordance(null);
      }
      schedulePaint();
    },
    [schedulePaint],
  );
  const handleHorizontalScroll = useCallback(
    (path: string, offset: number) => {
      horizontalOffsetsRef.current.set(path, offset);
      schedulePaint();
    },
    [schedulePaint],
  );
  const pointHit = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const currentModel = modelRef.current;
    const root = rootRef.current;
    if (!currentModel || !root) return null;
    const bounds = root.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const documentY = event.clientY - bounds.top + scrollTopRef.current;
    const file = currentModel.files.find(
      (entry) => entry.top <= documentY && documentY < entry.bottom,
    );
    return hitTestDiffDocument({
      model: currentModel,
      x,
      documentY,
      horizontalOffset: file ? (horizontalOffsetsRef.current.get(file.path) ?? 0) : 0,
    });
  }, []);
  const pointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest(
          '[data-diff-header="true"], [data-diff-review="true"], [role="menuitem"], button, input, textarea',
        )
      )
        return;
      const hit = pointHit(event);
      if (hit?.kind !== "cell") return;
      dragRef.current = {
        anchor: hit.position,
        startX: event.clientX,
        startY: event.clientY,
        moved: false,
      };
      selectionRef.current = { anchor: hit.position, focus: hit.position };
      event.currentTarget.focus();
      event.currentTarget.setPointerCapture(event.pointerId);
      schedulePaint();
    },
    [pointHit, schedulePaint],
  );
  const pointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (drag) {
        drag.moved = hasPointerDragStarted({
          startX: drag.startX,
          startY: drag.startY,
          x: event.clientX,
          y: event.clientY,
          alreadyDragging: drag.moved,
        });
      }
      const hit = pointHit(event);
      if (hit?.kind === "cell") {
        const row = modelRef.current?.rows[hit.position.rowIndex];
        const file = modelRef.current?.files[hit.position.fileIndex];
        const sideIndex =
          row?.kind === "line" && row.cells.length === 2 && hit.position.side === "new" ? 1 : 0;
        if (row && file) {
          const columnWidth = viewport.width / (row.kind === "line" ? row.cells.length : 1);
          const gutterBorder = sideIndex * columnWidth + file.gutterWidth;
          const rootBounds = rootRef.current?.getBoundingClientRect();
          const pointerX = rootBounds ? event.clientX - rootBounds.left : Number.NaN;
          if (Math.abs(pointerX - gutterBorder) <= 14) {
            hasHoveredAffordanceRef.current = true;
            setHoveredAffordance({
              hit,
              left: gutterBorder - 14,
              top: row.top - scrollTopRef.current + (modelRef.current!.lineHeight - 28) / 2,
            });
          } else {
            hasHoveredAffordanceRef.current = false;
            setHoveredAffordance(null);
          }
        }
      } else {
        hasHoveredAffordanceRef.current = false;
        setHoveredAffordance(null);
      }
      if (!drag || hit?.kind !== "cell") return;
      selectionRef.current = { anchor: drag.anchor, focus: hit.position };
      schedulePaint();
    },
    [pointHit, schedulePaint, viewport.width],
  );
  const pointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      const hit = pointHit(event);
      dragRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      const moved = drag
        ? hasPointerDragStarted({
            startX: drag.startX,
            startY: drag.startY,
            x: event.clientX,
            y: event.clientY,
            alreadyDragging: drag.moved,
          })
        : false;
      if (drag && !moved && hit?.kind === "cell" && hit.target && reviewActions) {
        selectionRef.current = null;
        reviewActions.onStartComment(hit.target);
        schedulePaint();
      }
    },
    [pointHit, reviewActions, schedulePaint],
  );
  const cancelPointer = useCallback(() => {
    dragRef.current = null;
  }, []);
  const copy = useCallback(
    (event: React.ClipboardEvent<HTMLDivElement>) => {
      if (!selectionRef.current) return;
      event.clipboardData.setData("text/plain", selectedSourceText(model, selectionRef.current));
      event.preventDefault();
    },
    [model],
  );
  const rootStyle = useMemo<React.CSSProperties>(
    () => ({ ...ROOT_STYLE, background: props.palette.surface }),
    [props.palette.surface],
  );
  const contentStyle = useMemo<React.CSSProperties>(
    () => ({ ...CONTENT_STYLE, height: Math.max(model.height, viewport.height) }),
    [model.height, viewport.height],
  );
  const affordanceStyle = useMemo<React.CSSProperties>(
    () => ({
      ...AFFORDANCE_STYLE,
      left: hoveredAffordance?.left ?? 0,
      top: hoveredAffordance?.top ?? 0,
    }),
    [hoveredAffordance?.left, hoveredAffordance?.top],
  );
  const addHoveredComment = useCallback(() => {
    const target = hoveredAffordance?.hit.target;
    if (target) reviewActions?.onStartComment(target);
  }, [hoveredAffordance?.hit.target, reviewActions]);
  const canvasStyle = useMemo<React.CSSProperties>(
    () => ({
      ...CANVAS_STYLE,
      fontFamily: (loadedTypography ?? desiredTypography).family,
      fontSize: (loadedTypography ?? desiredTypography).size,
    }),
    [desiredTypography, loadedTypography],
  );

  return (
    <div data-testid="git-diff-canvas-root" ref={rootRef} style={rootStyle}>
      <div
        ref={scrollRef}
        data-testid="git-diff-scroll"
        tabIndex={0}
        onScroll={handleVerticalScroll}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={cancelPointer}
        onLostPointerCapture={cancelPointer}
        onCopy={copy}
        style={SCROLL_STYLE}
      >
        <div style={contentStyle} onMouseDown={preventDocumentMouseSelection}>
          {model.files.map((file) => (
            <WebFileHeaderSection key={file.path} file={file}>
              <DocumentFileHeader
                file={file}
                selectedPath={props.selectedPath}
                mode={props.mode}
                onToggleFile={props.onToggleFile}
                onSelectPath={props.onSelectPath}
              />
            </WebFileHeaderSection>
          ))}
          {model.files
            .filter((file) => !file.isCollapsed && !model.wrapLines)
            .map((file) => (
              <HorizontalScroll
                key={file.path}
                file={file}
                initialOffset={horizontalOffsetsRef.current.get(file.path) ?? 0}
                onScroll={handleHorizontalScroll}
              />
            ))}
          {props.mode.kind === "working" && reviewActions
            ? model.rows.map((row) => {
                if (row.kind !== "line" || row.reviewHeight === 0) return null;
                const columnWidth = model.viewportWidth / row.cells.length;
                return row.cells.map((cell, index) => {
                  if (!cell?.reviewTarget) return null;
                  const comments = reviewActions.commentsByTarget.get(cell.reviewTarget.key) ?? [];
                  const hasEditor =
                    reviewActions.editor?.target.filePath === cell.reviewTarget.filePath &&
                    reviewActions.editor.target.side === cell.reviewTarget.side &&
                    reviewActions.editor.target.lineNumber === cell.reviewTarget.lineNumber;
                  if (comments.length === 0 && !hasEditor) return null;
                  return (
                    <WebReviewThread
                      key={cell.reviewTarget.key}
                      target={cell.reviewTarget}
                      actions={reviewActions}
                      top={row.top + row.height - row.reviewHeight}
                      left={index * columnWidth}
                      width={columnWidth}
                      height={row.reviewHeight}
                      pinToViewport={!model.wrapLines}
                    />
                  );
                });
              })
            : null}
        </div>
      </div>
      <canvas ref={canvasRef} data-testid="git-diff-canvas" style={canvasStyle} />
      {hoveredAffordance?.hit.target && reviewActions ? (
        <button
          type="button"
          aria-label={t("review.comment.add")}
          onClick={addHoveredComment}
          style={affordanceStyle}
        >
          +
        </button>
      ) : null}
    </div>
  );
}

function WebFileHeaderSection({
  file,
  children,
}: {
  file: ReturnType<typeof buildDiffDocumentModel>["files"][number];
  children: React.ReactNode;
}) {
  const style = useMemo<React.CSSProperties>(
    () => ({ ...FILE_SECTION_STYLE, top: file.top, height: file.bottom - file.top }),
    [file.bottom, file.top],
  );
  return (
    <div style={style}>
      <div
        data-diff-header="true"
        style={STICKY_HEADER_STYLE}
        onMouseDown={preventDocumentMouseSelection}
      >
        {children}
      </div>
      <div data-testid={`diff-file-${file.fileIndex}-body`} style={BODY_MARKER_STYLE} />
    </div>
  );
}

function preventDocumentMouseSelection(event: React.MouseEvent): void {
  if (event.detail < 2) return;
  const target = event.target;
  if (target instanceof Element && target.closest('[data-diff-review="true"]')) return;
  event.preventDefault();
  window.getSelection()?.removeAllRanges();
}

function WebReviewThread({
  target,
  actions,
  top,
  left,
  width,
  height,
  pinToViewport,
}: {
  target: ReviewableDiffTarget;
  actions: NonNullable<Extract<DiffSurfaceProps["mode"], { kind: "working" }>["reviewActions"]>;
  top: number;
  left: number;
  width: number;
  height: number;
  pinToViewport: boolean;
}) {
  const style = useMemo<React.CSSProperties>(
    () => ({ ...REVIEW_STYLE, top, left, width, height }),
    [height, left, top, width],
  );
  return (
    <div style={style} data-diff-review="true">
      <InlineReviewThread
        reviewTarget={target}
        reviewActions={actions}
        height={height}
        viewportWidth={width}
        pinToViewport={pinToViewport}
      />
    </div>
  );
}

const ROOT_STYLE: React.CSSProperties = {
  position: "relative",
  flex: 1,
  minHeight: 0,
  overflow: "hidden",
};
const SCROLL_STYLE: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  zIndex: 2,
  overflowY: "auto",
  overflowX: "hidden",
};
const CONTENT_STYLE: React.CSSProperties = {
  position: "relative",
  width: "100%",
  userSelect: "none",
};
const FILE_SECTION_STYLE: React.CSSProperties = {
  position: "absolute",
  left: 0,
  right: 0,
  zIndex: 3,
  pointerEvents: "none",
};
const STICKY_HEADER_STYLE: React.CSSProperties = {
  position: "sticky",
  top: 0,
  pointerEvents: "auto",
  userSelect: "none",
};
const BODY_MARKER_STYLE: React.CSSProperties = {
  position: "absolute",
  top: 44,
  bottom: 0,
  left: 0,
  right: 0,
  pointerEvents: "none",
};
const REVIEW_STYLE: React.CSSProperties = { position: "absolute", zIndex: 4, userSelect: "text" };
const CANVAS_STYLE: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  zIndex: 1,
  width: "100%",
  height: "100%",
  pointerEvents: "none",
};
const AFFORDANCE_STYLE: React.CSSProperties = {
  position: "absolute",
  zIndex: 5,
  width: 28,
  height: 28,
};

function emptyDiffDocumentModel(input: {
  layout: "unified" | "split";
  wrapLines: boolean;
  viewportWidth: number;
  lineHeight: number;
}): ReturnType<typeof buildDiffDocumentModel> {
  return {
    files: [],
    rows: [],
    height: 0,
    lineHeight: input.lineHeight,
    layout: input.layout,
    wrapLines: input.wrapLines,
    viewportWidth: input.viewportWidth,
  };
}

function createWebTextMeasurer(typography: DiffTypography): TextMeasurer {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return { measure: () => 0 };
  return {
    measure(text, weight = "regular") {
      context.font = `${weight === "semibold" ? 600 : 400} ${typography.size}px ${typography.family}`;
      return context.measureText(text).width;
    },
    measureAdvances(graphemes) {
      context.font = `${typography.size}px ${typography.family}`;
      let prefix = "";
      return graphemes.map((grapheme) => {
        prefix += grapheme;
        return context.measureText(prefix).width;
      });
    },
  };
}
