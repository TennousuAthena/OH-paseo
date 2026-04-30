import { expect, it } from "vitest";
import { resolveTerminalBackend } from "./terminal-manager-factory.js";

it("uses the worker terminal backend by default", () => {
  expect(resolveTerminalBackend({})).toBe("worker");
});

it("allows explicitly opting back into the in-process terminal backend", () => {
  expect(resolveTerminalBackend({ PASEO_TERMINAL_BACKEND: "in-process" })).toBe("in-process");
});
