import type { FastifyBaseLogger } from "fastify";
import type { ClientSocketEvent, ServerSocketEvent } from "../../types/events.js";

export type CodexAdapterEvent = ServerSocketEvent;

export interface CodexAdapterContext {
  logger: FastifyBaseLogger;
  onEvent: (event: CodexAdapterEvent) => void;
}

export interface CodexAdapter {
  start: () => void | Promise<void>;
  send: (event: ClientSocketEvent) => void | Promise<void>;
  dispose: () => void;
}

