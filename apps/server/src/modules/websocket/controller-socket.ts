import type { FastifyInstance } from "fastify";
import type { RawData, WebSocket } from "ws";
import { getAuthorizedSession } from "../auth/auth-routes.js";
import { getManagedCodexSession } from "../codex/codex-session-manager.js";
import { attachmentPathsForSession } from "../upload/upload-routes.js";
import type { ClientSocketEvent, ServerSocketEvent } from "../../types/events.js";

const socketsBySession = new Map<string, Set<WebSocket>>();

function send(socket: WebSocket, event: ServerSocketEvent) {
  socket.send(JSON.stringify(event));
}

function trackSocket(sessionId: string, socket: WebSocket) {
  const sockets = socketsBySession.get(sessionId) ?? new Set<WebSocket>();

  sockets.add(socket);
  socketsBySession.set(sessionId, sockets);
}

function untrackSocket(sessionId: string, socket: WebSocket) {
  const sockets = socketsBySession.get(sessionId);

  if (!sockets) {
    return;
  }

  sockets.delete(socket);

  if (sockets.size === 0) {
    socketsBySession.delete(sessionId);
  }
}

export function closeControllerSocketsForSession(sessionId: string, message = "Session revoked.") {
  const sockets = socketsBySession.get(sessionId);

  if (!sockets) {
    return 0;
  }

  let closed = 0;

  for (const socket of sockets) {
    if (socket.readyState === socket.OPEN) {
      send(socket, {
        type: "error",
        payload: {
          code: "SESSION_REVOKED",
          message,
        },
      });
      socket.close(1008, message);
      closed += 1;
    }
  }

  return closed;
}

function rawDataToBuffer(raw: RawData) {
  if (Buffer.isBuffer(raw)) {
    return raw;
  }

  if (Array.isArray(raw)) {
    return Buffer.concat(raw);
  }

  return Buffer.from(raw);
}

function parseClientEvent(raw: Buffer): ClientSocketEvent | null {
  try {
    const event = JSON.parse(raw.toString()) as ClientSocketEvent;
    if (event.type === "input.send" || event.type === "command.send") {
      return event;
    }
  } catch {
    return null;
  }

  return null;
}

export async function registerControllerSocket(app: FastifyInstance) {
  app.get("/ws/controller", { websocket: true }, (socket, request) => {
    const url = new URL(request.url, "http://localhost");
    const sessionToken = url.searchParams.get("sessionToken") ?? undefined;
    const session = getAuthorizedSession(sessionToken);

    if (!session) {
      send(socket, {
        type: "error",
        payload: {
          code: "UNAUTHORIZED",
          message: "Session token is missing or invalid.",
        },
      });
      socket.close(1008, "Unauthorized");
      return;
    }

    const codexSession = getManagedCodexSession(session.sessionId, request.log);
    trackSocket(session.sessionId, socket);

    const listener = (event: ServerSocketEvent) => {
      if (socket.readyState === socket.OPEN) {
        send(socket, event);
      }
    };

    const authorizationTimer = setInterval(() => {
      if (socket.readyState !== socket.OPEN) {
        return;
      }

      if (!getAuthorizedSession(sessionToken)) {
        send(socket, {
          type: "error",
          payload: {
            code: "SESSION_REVOKED",
            message: "Session token was revoked or expired.",
          },
        });
        socket.close(1008, "Session revoked or expired.");
      }
    }, 5000);

    codexSession.attach(listener);

    socket.on("message", (raw: RawData) => {
      if (!getAuthorizedSession(sessionToken)) {
        send(socket, {
          type: "error",
          payload: {
            code: "SESSION_REVOKED",
            message: "Session token was revoked or expired.",
          },
        });
        socket.close(1008, "Session revoked or expired.");
        return;
      }

      const event = parseClientEvent(rawDataToBuffer(raw));

      if (!event) {
        send(socket, {
          type: "error",
          payload: {
            code: "INVALID_MESSAGE",
            message: "Unsupported WebSocket message.",
          },
        });
        return;
      }

      if (event.type === "input.send" && event.payload.attachmentIds.length > 0) {
        const attachmentPaths = attachmentPathsForSession(session.sessionId, event.payload.attachmentIds);
        const attachmentText = attachmentPaths.map((path) => `@${path}`).join("\n");
        const text = [event.payload.text.trim(), attachmentText].filter(Boolean).join("\n");

        codexSession.send({
          type: "input.send",
          payload: {
            text,
            attachmentIds: [],
          },
        });
        return;
      }

      codexSession.send(event);
    });

    socket.on("close", () => {
      clearInterval(authorizationTimer);
      untrackSocket(session.sessionId, socket);
      codexSession.detach(listener);
    });
  });
}
