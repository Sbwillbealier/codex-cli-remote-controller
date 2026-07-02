import { MockCodexAdapter } from "./mock-codex-adapter.js";
import { NodePtyCodexAdapter } from "./node-pty-codex-adapter.js";
import type { CodexAdapter, CodexAdapterContext } from "./codex-adapter.js";

export function createCodexAdapter(context: CodexAdapterContext): CodexAdapter {
  if (process.env.CODEX_ADAPTER === "pty") {
    return new NodePtyCodexAdapter(context);
  }

  return new MockCodexAdapter(context);
}

