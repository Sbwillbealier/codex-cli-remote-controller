import type { FastifyBaseLogger } from "fastify";
import { createCodexAdapter } from "./create-codex-adapter.js";
import { probeCodexTokenPercent } from "./codex-token-probe.js";
import type { CodexAdapter, CodexAdapterEvent } from "./codex-adapter.js";
import type { ServerSocketEvent } from "../../types/events.js";

type SessionListener = (event: CodexAdapterEvent) => void;

const defaultKeepAliveMs = 10 * 60 * 1000;

function keepAliveMs() {
  return Number(process.env.CODEX_SESSION_KEEPALIVE_MS ?? defaultKeepAliveMs);
}

function tokenRefreshMs() {
  return Number(process.env.CODEX_TOKEN_REFRESH_MS ?? 5 * 60 * 1000);
}

function tokenRefreshEnabled() {
  return process.env.CODEX_TOKEN_AUTO_REFRESH !== "false";
}

class ManagedCodexSession {
  private readonly adapter: CodexAdapter;
  private readonly listeners = new Set<SessionListener>();
  private keepAliveTimer: NodeJS.Timeout | null = null;
  private tokenRefreshTimer: NodeJS.Timeout | null = null;
  private tokenProbeInFlight = false;
  private started = false;
  private latestStatus: Extract<ServerSocketEvent, { type: "status.update" }> | null = null;
  private latestOutput: Extract<ServerSocketEvent, { type: "output.reset" }> | null = null;

  constructor(
    private readonly sessionId: string,
    private readonly logger: FastifyBaseLogger,
    private readonly onDispose: (sessionId: string) => void,
  ) {
    this.adapter = createCodexAdapter({
      logger,
      onEvent: (event) => this.handleEvent(event),
    });
  }

  attach(listener: SessionListener) {
    this.clearKeepAliveTimer();
    this.listeners.add(listener);
    this.ensureTokenRefreshTimer();

    if (this.latestStatus) {
      listener(this.latestStatus);
    }

    if (this.latestOutput) {
      listener(this.latestOutput);
    }

    if (!this.started) {
      this.started = true;
      void this.adapter.start();
    }
  }

  detach(listener: SessionListener) {
    this.listeners.delete(listener);

    if (this.listeners.size === 0) {
      this.clearKeepAliveTimer();
      this.keepAliveTimer = setTimeout(() => {
        this.dispose();
      }, keepAliveMs());
    }
  }

  send(event: Parameters<CodexAdapter["send"]>[0]) {
    void this.adapter.send(event);
  }

  dispose() {
    this.clearKeepAliveTimer();
    this.clearTokenRefreshTimer();
    this.listeners.clear();
    this.adapter.dispose();
    this.onDispose(this.sessionId);
    this.logger.info({ sessionId: this.sessionId }, "disposed Codex session");
  }

  private handleEvent(event: CodexAdapterEvent) {
    if (
      event.type === "status.update" &&
      event.payload.tokenRemainingPercent === null &&
      this.latestStatus?.payload.tokenRemainingPercent !== null &&
      this.latestStatus?.payload.tokenRemainingPercent !== undefined
    ) {
      event = {
        type: "status.update",
        payload: {
          ...event.payload,
          tokenRemainingPercent: this.latestStatus.payload.tokenRemainingPercent,
        },
      };
    }

    if (event.type === "status.update") {
      this.latestStatus = event;
    }

    if (event.type === "output.reset") {
      this.latestOutput = event;
    }

    if (event.type === "output.chunk") {
      this.latestOutput = {
        type: "output.reset",
        payload: {
          content: `${this.latestOutput?.payload.content ?? ""}${event.payload.content}`,
          format: event.payload.format,
        },
      };
    }

    for (const listener of this.listeners) {
      listener(event);
    }
  }

  private clearKeepAliveTimer() {
    if (this.keepAliveTimer) {
      clearTimeout(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
  }

  private ensureTokenRefreshTimer() {
    if (!tokenRefreshEnabled() || process.env.CODEX_ADAPTER !== "pty" || this.tokenRefreshTimer) {
      return;
    }

    const refresh = () => {
      void this.refreshTokenPercent();
    };

    this.tokenRefreshTimer = setInterval(refresh, tokenRefreshMs());
    setTimeout(refresh, Number(process.env.CODEX_TOKEN_INITIAL_REFRESH_DELAY_MS ?? 2500));
  }

  private clearTokenRefreshTimer() {
    if (this.tokenRefreshTimer) {
      clearInterval(this.tokenRefreshTimer);
      this.tokenRefreshTimer = null;
    }
  }

  private async refreshTokenPercent() {
    if (this.listeners.size === 0 || this.tokenProbeInFlight) {
      return;
    }

    this.tokenProbeInFlight = true;

    try {
      const tokenRemainingPercent = await probeCodexTokenPercent(this.logger);

      if (tokenRemainingPercent === null || this.listeners.size === 0) {
        return;
      }

      const status = this.latestStatus?.payload.status ?? "idle";
      const event: Extract<ServerSocketEvent, { type: "status.update" }> = {
        type: "status.update",
        payload: {
          status,
          tokenRemainingPercent,
        },
      };

      this.handleEvent(event);
    } finally {
      this.tokenProbeInFlight = false;
    }
  }
}

const sessions = new Map<string, ManagedCodexSession>();

export function getManagedCodexSession(sessionId: string, logger: FastifyBaseLogger) {
  const existing = sessions.get(sessionId);

  if (existing) {
    return existing;
  }

  const session = new ManagedCodexSession(sessionId, logger, (disposedSessionId) => {
    if (sessions.get(disposedSessionId) === session) {
      sessions.delete(disposedSessionId);
    }
  });
  sessions.set(sessionId, session);
  logger.info({ sessionId, keepAliveMs: keepAliveMs() }, "created Codex session");
  return session;
}

export function disposeManagedCodexSession(sessionId: string) {
  const session = sessions.get(sessionId);

  if (!session) {
    return false;
  }

  session.dispose();
  return true;
}
