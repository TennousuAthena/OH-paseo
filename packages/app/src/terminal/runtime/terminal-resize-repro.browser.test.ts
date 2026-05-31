import { page } from "@vitest/browser/context";
import { afterEach, describe, expect, it } from "vitest";
import type { TerminalState } from "@getpaseo/protocol/messages";
import { encodeTerminalOutput, TerminalEmulatorRuntime } from "./terminal-emulator-runtime";

// Regression: "streaming pino log, resized the Paseo terminal, old logs stayed
// narrow and new logs drew on top of the old ones."
//
// A heavy stream overflows MAX_TERMINAL_OUTPUT_FRAME_BYTES, so the server sends a
// SNAPSHOT mid-stream. The client restores it via renderTerminalSnapshotToAnsi.
// When the snapshot carries per-row soft-wrap flags, restored long lines must
// reflow on resize just like live output — not freeze at the snapshot width.

interface Mounted {
  host: HTMLDivElement;
  root: HTMLDivElement;
  runtime: TerminalEmulatorRuntime;
}

const mounted: Mounted[] = [];

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

async function waitFor(predicate: () => boolean, timeoutMs = 4000): Promise<void> {
  const start = performance.now();
  while (!predicate()) {
    if (performance.now() - start > timeoutMs) throw new Error("timeout waiting for condition");
    await nextFrame();
  }
}

function mount(width: number, height: number): Mounted {
  const root = document.createElement("div");
  root.style.cssText = `width:${width}px;height:${height}px;position:fixed;left:0;top:0;overflow:hidden`;
  const host = document.createElement("div");
  host.style.cssText = "width:100%;height:100%";
  root.appendChild(host);
  document.body.appendChild(root);

  const runtime = new TerminalEmulatorRuntime();
  runtime.setCallbacks({ callbacks: {} });
  runtime.mount({
    root,
    host,
    initialSnapshot: null,
    scrollback: 10_000,
    theme: { background: "#0b0b0b", foreground: "#e6e6e6", cursor: "#e6e6e6" },
  });
  const m = { host, root, runtime };
  mounted.push(m);
  return m;
}

interface Row {
  text: string;
  wrapped: boolean;
}

function dumpRows(): Row[] {
  const term = window.__paseoTerminal;
  if (!term) throw new Error("no terminal");
  const buf = term.buffer.active;
  const rows: Row[] = [];
  for (let i = 0; i < buf.length; i++) {
    const line = buf.getLine(i);
    if (!line) continue;
    rows.push({ text: line.translateToString(true).trimEnd(), wrapped: line.isWrapped });
  }
  return rows;
}

function someRowContains(text: string): boolean {
  return dumpRows().some((r) => r.text.includes(text));
}

// Build a server-style snapshot of one long pino line that the SERVER soft-wrapped
// at `cols`, represented as multiple grid rows (exactly what the daemon stores in
// its headless xterm and ships in a snapshot).
function buildWrappedSnapshot(cols: number): TerminalState {
  const longLine = `[server] [15:30:00.123] TRACE: provider.claude.raw_event {"module":"agent","seq":1,"sessionId":"ed8972f4-d3be-45d0-992c-631f8f1ed04e","turnId":"foreground-turn-1","payload":"${"A".repeat(40)}"}`;
  const grid: TerminalState["grid"] = [];
  for (let i = 0; i < longLine.length; i += cols) {
    const chunk = longLine.slice(i, i + cols);
    grid.push([...chunk].map((char) => ({ char })));
  }
  // The fixed daemon ships per-row soft-wrap flags: every row of the logical line
  // continues onto the next except the last.
  const gridWrapped = grid.map((_, index) => index < grid.length - 1);
  // Cursor sits just below the restored content, exactly where the daemon's
  // headless terminal leaves it after a line break, so streamed output appends
  // cleanly below instead of overwriting the restored rows.
  return {
    rows: 24,
    cols,
    scrollback: [],
    scrollbackWrapped: [],
    grid,
    gridWrapped,
    cursor: { row: grid.length, col: 0 },
  };
}

function pinoLine(seq: number): string {
  return `[server] [15:30:${String(seq % 60).padStart(2, "0")}.123] TRACE: provider.claude.raw_event {"module":"agent","seq":${seq},"sessionId":"ed8972f4-d3be-45d0-992c-631f8f1ed04e","turnId":"foreground-turn-1","payload":"${"A".repeat(40)}"}\r\n`;
}

afterEach(() => {
  for (const m of mounted.splice(0)) {
    m.runtime.unmount();
    m.root.remove();
  }
});

describe("terminal resize reflow repro (Paseo terminal)", () => {
  it("snapshot-restored rows stay frozen at the snapshot width after the terminal grows", async () => {
    await page.viewport(1600, 700);
    const m = mount(560, 360); // ~70 cols
    await waitFor(() => window.__paseoTerminal !== undefined);
    const narrowCols = window.__paseoTerminal?.cols ?? 0;

    // 1) Mid-stream snapshot arrives (server overflowed 256KB). It carries the
    //    long line wrapped at the server width as separate grid rows.
    m.runtime.renderSnapshot({ state: buildWrappedSnapshot(narrowCols) });
    await waitFor(() => someRowContains('"seq":1'));

    // 2) Normal post-snapshot streaming resumes (autowrap on -> soft-wrapped).
    for (let seq = 90; seq <= 96; seq++) {
      m.runtime.write({ data: encodeTerminalOutput(pinoLine(seq)) });
    }
    await waitFor(() => someRowContains('"seq":96'));

    // 3) User resizes the terminal wider.
    m.root.style.width = "1480px";
    await nextFrame();
    m.runtime.resize({ force: true, shouldClaim: true });
    await nextFrame();
    await nextFrame();
    const wideCols = window.__paseoTerminal?.cols ?? 0;

    const rows = dumpRows();
    const snapshotRowLen =
      rows.find((r) => r.text.startsWith("[server] [15:30:00"))?.text.length ?? -1;
    const streamedRowLen =
      rows.find((r) => r.text.startsWith("[server] [15:30:30"))?.text.length ?? -1;

    expect(wideCols).toBeGreaterThan(narrowCols + 20);
    // Post-snapshot streamed output reflows to fill the wide terminal.
    expect(streamedRowLen).toBeGreaterThan(narrowCols + 20);
    // Snapshot-restored content reflows too, instead of staying frozen at the
    // snapshot width — the reported bug.
    expect(snapshotRowLen).toBeGreaterThan(narrowCols + 20);
  });
});
