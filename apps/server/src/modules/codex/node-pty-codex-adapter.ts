import pty, { type IPty } from "node-pty";
import xtermHeadless from "@xterm/headless";
import type { CodexAdapter, CodexAdapterContext } from "./codex-adapter.js";
import { codexCommandConfig, configuredWorkspace, isDirectory, parseTokenPercent } from "./codex-runtime-config.js";
import type { ClientSocketEvent } from "../../types/events.js";

const { Terminal } = xtermHeadless;
const clearPromptInput = "\x15";
const bracketedPasteStart = "\x1b[200~";
const bracketedPasteEnd = "\x1b[201~";

function rawKeySequence(input: string) {
  const normalized = input.trim().toLowerCase();
  const keyMap = new Map<string, string>([
    ["enter", "\r"],
    ["return", "\r"],
    ["回车", "\r"],
    ["esc", "\x1b"],
    ["escape", "\x1b"],
    ["退出", "\x1b"],
    ["tab", "\t"],
    ["shift tab", "\x1b[Z"],
    ["shift+tab", "\x1b[Z"],
    ["ctrl c", "\x03"],
    ["ctrl+c", "\x03"],
    ["control c", "\x03"],
    ["control+c", "\x03"],
    ["up", "\x1b[A"],
    ["arrowup", "\x1b[A"],
    ["↑", "\x1b[A"],
    ["上", "\x1b[A"],
    ["down", "\x1b[B"],
    ["arrowdown", "\x1b[B"],
    ["↓", "\x1b[B"],
    ["下", "\x1b[B"],
    ["right", "\x1b[C"],
    ["arrowright", "\x1b[C"],
    ["→", "\x1b[C"],
    ["右", "\x1b[C"],
    ["left", "\x1b[D"],
    ["arrowleft", "\x1b[D"],
    ["←", "\x1b[D"],
    ["左", "\x1b[D"],
  ]);

  if (/^[1-9]$/.test(normalized)) {
    return normalized;
  }

  return keyMap.get(normalized) ?? null;
}

export class NodePtyCodexAdapter implements CodexAdapter {
  private process: IPty | null = null;
  private terminal: InstanceType<typeof Terminal> | null = null;
  private disposed = false;
  private idleTimer: NodeJS.Timeout | null = null;
  private lastSnapshot = "";
  private tokenPercent: number | null = null;

  constructor(private readonly context: CodexAdapterContext) {}

  start() {
    const { command, args } = codexCommandConfig();
    const cols = Number(process.env.CODEX_PTY_COLS ?? 100);
    const rows = Number(process.env.CODEX_PTY_ROWS ?? 32);
    const cwd = configuredWorkspace();

    if (!isDirectory(cwd)) {
      this.context.logger.error({ cwd }, "Codex workspace directory does not exist");
      this.emit({
        type: "status.update",
        payload: {
          status: "error",
          tokenRemainingPercent: null,
        },
      });
      this.emit({
        type: "output.reset",
        payload: {
          content: [
            "Codex 工作目录不存在，无法启动真实 Codex CLI。",
            "",
            `当前 CODEX_WORKSPACE: ${cwd}`,
            "",
            "请编辑 apps/server/.env，将 CODEX_WORKSPACE 改成服务器上真实存在的项目目录。",
          ].join("\n"),
          format: "terminal",
        },
      });
      this.emit({
        type: "error",
        payload: {
          code: "CODEX_WORKSPACE_NOT_FOUND",
          message: `Codex workspace does not exist: ${cwd}`,
        },
      });
      return;
    }

    this.context.logger.info({ command, args, cwd }, "starting Codex CLI pty adapter");
    this.terminal = new Terminal({
      allowProposedApi: true,
      cols,
      rows,
      scrollback: Number(process.env.CODEX_PTY_SCROLLBACK ?? 600),
    });
    this.process = pty.spawn(command, args, {
      cols,
      rows,
      cwd,
      env: process.env,
      name: "xterm-256color",
    });

    this.emit({
      type: "status.update",
      payload: {
        status: "idle",
        tokenRemainingPercent: null,
      },
    });
    this.emit({
      type: "output.reset",
      payload: {
        content: "已连接本地 Codex CLI，等待终端输出...\n\n",
        format: "terminal",
      },
    });

    this.process.onData((data) => {
      if (!this.terminal) {
        return;
      }

      this.terminal.write(data, () => {
        this.emitTerminalSnapshot();
      });
    });

    this.process.onExit(({ exitCode, signal }) => {
      if (this.disposed) {
        return;
      }

      this.context.logger.warn({ exitCode, signal }, "Codex CLI pty exited");
      this.emit({
        type: "status.update",
        payload: {
          status: exitCode === 0 ? "offline" : "error",
          tokenRemainingPercent: this.tokenPercent,
        },
      });
      this.emit({
        type: "error",
        payload: {
          code: "CODEX_CLI_EXITED",
          message: `Codex CLI exited with code ${exitCode}${signal ? ` and signal ${signal}` : ""}.`,
        },
      });
    });
  }

  send(event: ClientSocketEvent) {
    if (!this.process) {
      this.emit({
        type: "error",
        payload: {
          code: "CODEX_CLI_NOT_STARTED",
          message: "Codex CLI process is not running.",
        },
      });
      return;
    }

    const input =
      event.type === "command.send"
        ? event.payload.command
        : [event.payload.text.trim(), ...event.payload.attachmentIds.map((id) => `@${id}`)]
            .filter(Boolean)
            .join(" ");
    const rawKey = rawKeySequence(input);

    if (rawKey) {
      this.process.write(rawKey);
      return;
    }

    this.emit({
      type: "status.update",
      payload: {
        status: "thinking",
        tokenRemainingPercent: this.tokenPercent,
      },
    });
    this.process.write(`${clearPromptInput}${bracketedPasteStart}${input}${bracketedPasteEnd}\r`);
  }

  dispose() {
    this.disposed = true;

    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }

    if (this.process) {
      this.process.kill();
      this.process = null;
    }

    this.terminal?.dispose();
    this.terminal = null;
  }

  private emitTerminalSnapshot() {
    const terminal = this.terminal;

    if (!terminal || this.disposed) {
      return;
    }

    const buffer = terminal.buffer.active;
    const maxLines = Number(process.env.CODEX_PTY_VISIBLE_LINES ?? 240);
    const start = Math.max(0, buffer.length - maxLines);
    const lines: string[] = [];

    for (let index = start; index < buffer.length; index += 1) {
      const line = buffer.getLine(index)?.translateToString(true) ?? "";
      lines.push(line);
    }

    const snapshot = lines.join("\n").replace(/\s+$/g, "");

    if (snapshot.length === 0 || snapshot === this.lastSnapshot) {
      return;
    }

    this.lastSnapshot = snapshot;
    this.tokenPercent = parseTokenPercent(snapshot) ?? this.tokenPercent;
    this.emitStatus("streaming");
    this.emit({
      type: "output.reset",
      payload: {
        content: snapshot,
        format: "terminal",
      },
    });
    this.scheduleIdle();
  }

  private scheduleIdle() {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
    }

    this.idleTimer = setTimeout(() => {
      this.emitStatus("idle");
    }, 500);
  }

  private emitStatus(status: "idle" | "thinking" | "streaming") {
    this.emit({
      type: "status.update",
      payload: {
        status,
        tokenRemainingPercent: this.tokenPercent,
      },
    });
  }

  private emit(event: Parameters<CodexAdapterContext["onEvent"]>[0]) {
    if (!this.disposed) {
      this.context.onEvent(event);
    }
  }
}
