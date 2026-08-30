// Mobile diff view — counterpart of the desktop diff pane. Maps to the "diff"
// reference screenshot: Changes/Files tabs, the branch + uncommitted scope rows,
// a new-file header, a hunk header, and the added lines of atoms.tsx (every row
// an addition, so the whole gutter runs green). Reuses the shared `Code`
// highlighter and the `--color-mock-diff-*` tokens.

import { ChevronDown, GitBranch, MoreHorizontal, RefreshCw, SquarePlus, X } from "lucide-react";
import { Code } from "../atoms";
import { ReactFileIcon } from "../icons";

// Every visible line of the new atoms.tsx — all additions. Long lines are
// clipped by the phone width exactly as they are in the app.
const ADDED_LINES: { n: number; text: string }[] = [
  { n: 1, text: "// Shared bits of the Paseo UI, drawn small. Every" },
  { n: 2, text: "// no state, no interactivity. Colors come from th" },
  { n: 3, text: "// styles.css, which are copied from the app's def" },
  { n: 4, text: "" },
  { n: 5, text: 'import type * as React from "react";' },
  { n: 6, text: "" },
  { n: 7, text: "/**" },
  { n: 8, text: " * The `+12 −18` footnote. A diff stat is a *statu" },
  { n: 9, text: " * uses statusSuccess/statusDanger — see the comme" },
  { n: 10, text: " * packages/app/src/styles/theme.ts." },
  { n: 11, text: " */" },
  { n: 12, text: "export function DiffStat({ add, remove }: { add: st" },
  { n: 13, text: "  return (" },
  { n: 14, text: '    <span className="flex shrink-0 items-center ga' },
  { n: 15, text: '      <span className="text-mock-success">+{add}</s' },
  { n: 16, text: '      <span className="text-mock-danger">-{remove}<' },
  { n: 17, text: "    </span>" },
  { n: 18, text: "  );" },
  { n: 19, text: "}" },
  { n: 20, text: "" },
  { n: 21, text: 'export type DotTone = "success" | "danger" | "warni' },
  { n: 22, text: "" },
  { n: 23, text: "const DOT_TONE: Record<DotTone, string> = {" },
  { n: 24, text: '  success: "bg-mock-dot-success",' },
  { n: 25, text: '  danger: "bg-mock-dot-danger",' },
  { n: 26, text: '  warning: "bg-mock-dot-warning",' },
  { n: 27, text: '  running: "bg-mock-dot-running",' },
  { n: 28, text: '  idle: "bg-mock-surface3",' },
  { n: 29, text: "};" },
  { n: 30, text: "" },
  { n: 31, text: "/** The 6pt disc on a sidebar row that carries the" },
  { n: 32, text: "export function StatusDot({ tone }: { tone: DotTone" },
  { n: 33, text: "  return <span className={`size-[7px] shrink-0 rou" },
];

function Tabs() {
  return (
    <div className="flex shrink-0 items-center gap-[16px] px-[18px] pt-[4px] pb-[14px]">
      <div className="flex items-center gap-[6px] rounded-[11px] bg-mock-surface2 p-[3px]">
        <span className="rounded-[8px] bg-mock-fg px-[15px] py-[6px] text-[16px] font-semibold text-mock-surface0">
          Changes
        </span>
        <span className="px-[13px] py-[6px] text-[16px] text-mock-fg-muted">Files</span>
      </div>
      <span className="flex-1" />
      <X size={22} className="text-mock-fg-muted" strokeWidth={1.9} />
    </div>
  );
}

function BranchRow() {
  return (
    <div className="flex shrink-0 items-center border-t border-mock-border px-[18px] py-[11px]">
      <span className="flex items-center gap-[6px] text-[16px] text-mock-fg">
        main
        <ChevronDown size={16} className="text-mock-fg-muted" />
      </span>
      <span className="flex-1" />
      <span className="flex items-center gap-[6px] rounded-[8px] border border-mock-border-accent px-[10px] py-[5px] text-mock-fg-muted">
        <GitBranch size={15} />
        <ChevronDown size={14} />
      </span>
    </div>
  );
}

function ScopeRow() {
  return (
    <div className="flex shrink-0 items-center gap-[12px] border-y border-mock-border px-[18px] py-[11px]">
      <span className="flex items-center gap-[5px] text-[16px] text-mock-fg">
        Uncommitted
        <ChevronDown size={16} className="text-mock-fg-muted" />
      </span>
      <span className="flex items-center gap-[6px] text-[15px] tabular-nums">
        <span className="text-mock-success">+2,173</span>
        <span className="text-mock-danger">-54</span>
      </span>
      <span className="flex-1" />
      <span className="flex items-center gap-[15px] text-mock-fg-muted">
        <RefreshCw size={17} strokeWidth={1.8} />
        <MoreHorizontal size={19} />
      </span>
    </div>
  );
}

function FileHeader() {
  return (
    <div className="flex shrink-0 items-center gap-[9px] px-[18px] py-[11px]">
      <ReactFileIcon size={15} />
      <span className="shrink-0 text-[16px] text-mock-fg">atoms.tsx</span>
      <span className="min-w-0 flex-1 truncate text-[14px] text-mock-fg-muted">
        packages/website/src/componen…
      </span>
      <span className="flex shrink-0 items-center gap-[3px] text-[14px] tabular-nums">
        <span className="text-mock-success">+175</span>
        <span className="text-mock-fg-xmuted">-0</span>
      </span>
      <SquarePlus size={17} className="shrink-0 text-mock-fg-muted" strokeWidth={1.7} />
    </div>
  );
}

function DiffLine({ n, text }: { n: number; text: string }) {
  return (
    <div className="flex items-center bg-mock-diff-add" style={ROW_STYLE}>
      <span
        className="shrink-0 pr-[10px] text-right font-mono text-[13px] tabular-nums text-mock-success"
        style={GUTTER_STYLE}
      >
        {n}
      </span>
      <span className="min-w-0 flex-1 overflow-hidden whitespace-pre pl-[12px] font-mono text-[14px] leading-[26px]">
        <Code line={text} />
      </span>
    </div>
  );
}

const ROW_H = 26;
const GUTTER_W = 44;
const ROW_STYLE = { height: ROW_H };
const GUTTER_STYLE = { width: GUTTER_W };
const GUTTER_RULE_STYLE = { left: GUTTER_W };

export function MobileDiff() {
  return (
    <>
      <Tabs />
      <BranchRow />
      <ScopeRow />
      <FileHeader />
      <div className="relative min-h-0 flex-1 overflow-hidden bg-mock-surface1">
        <div
          className="pointer-events-none absolute top-0 bottom-0 w-px bg-mock-border"
          style={GUTTER_RULE_STYLE}
        />
        <div className="flex items-center bg-mock-surface-diff-empty" style={ROW_STYLE}>
          <span className="shrink-0" style={GUTTER_STYLE} />
          <span className="pl-[12px] font-mono text-[13px] text-mock-fg-muted">
            @@ -0,0 +1,175 @@
          </span>
        </div>
        {ADDED_LINES.map((line) => (
          <DiffLine key={line.n} n={line.n} text={line.text} />
        ))}
      </div>
      <div className="flex h-[52px] shrink-0 items-center border-t border-mock-border px-[18px] pb-[16px] text-[16px] text-mock-fg">
        Commits
      </div>
    </>
  );
}
