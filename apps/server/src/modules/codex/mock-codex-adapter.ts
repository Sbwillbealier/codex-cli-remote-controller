import { initialOutput, responseOutput } from "./mock-output.js";
import type { CodexAdapter, CodexAdapterContext } from "./codex-adapter.js";
import type { ClientSocketEvent } from "../../types/events.js";

function chunkId() {
  return `chunk_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export class MockCodexAdapter implements CodexAdapter {
  private readonly timers = new Set<NodeJS.Timeout>();
  private disposed = false;

  constructor(private readonly context: CodexAdapterContext) {}

  start() {
    this.emit({
      type: "status.update",
      payload: {
        status: "idle",
        tokenRemainingPercent: 72,
      },
    });
    this.emit({
      type: "output.reset",
      payload: {
        content: initialOutput(),
        format: "markdown",
      },
    });
  }

  send(event: ClientSocketEvent) {
    const input =
      event.type === "command.send"
        ? event.payload.command
        : event.payload.text.trim() || `attachments:${event.payload.attachmentIds.length}`;
    const attachmentCount = event.type === "input.send" ? event.payload.attachmentIds.length : 0;
    const content = responseOutput(input, attachmentCount);

    this.emit({
      type: "status.update",
      payload: {
        status: "thinking",
        tokenRemainingPercent: 72,
      },
    });

    this.setTimer(() => {
      this.emit({
        type: "status.update",
        payload: {
          status: "streaming",
          tokenRemainingPercent: 71,
        },
      });

      for (const chunk of content.match(/[\s\S]{1,180}/g) ?? []) {
        this.emit({
          type: "output.chunk",
          payload: {
            chunkId: chunkId(),
            content: chunk,
            format: "markdown",
          },
        });
      }

      this.emit({
        type: "status.update",
        payload: {
          status: "idle",
          tokenRemainingPercent: 71,
        },
      });
    }, 320);
  }

  dispose() {
    this.disposed = true;

    for (const timer of this.timers) {
      clearTimeout(timer);
    }

    this.timers.clear();
  }

  private setTimer(callback: () => void, delayMs: number) {
    const timer = setTimeout(() => {
      this.timers.delete(timer);

      if (!this.disposed) {
        callback();
      }
    }, delayMs);

    this.timers.add(timer);
  }

  private emit(event: Parameters<CodexAdapterContext["onEvent"]>[0]) {
    if (!this.disposed) {
      this.context.onEvent(event);
    }
  }
}

