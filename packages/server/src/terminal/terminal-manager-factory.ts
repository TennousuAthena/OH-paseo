import { createTerminalManager, type TerminalManager } from "./terminal-manager.js";
import { createWorkerTerminalManager } from "./worker-terminal-manager.js";

export type TerminalBackend = "in-process" | "worker";

export function resolveTerminalBackend(env: NodeJS.ProcessEnv = process.env): TerminalBackend {
  return env.PASEO_TERMINAL_BACKEND === "in-process" ? "in-process" : "worker";
}

export function createConfiguredTerminalManager(options?: {
  backend?: TerminalBackend;
}): TerminalManager {
  const backend = options?.backend ?? resolveTerminalBackend();
  if (backend === "worker") {
    return createWorkerTerminalManager();
  }
  return createTerminalManager();
}
