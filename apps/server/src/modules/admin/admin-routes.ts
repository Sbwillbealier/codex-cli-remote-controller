import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  createPairingSession,
  listDeviceSessions,
  revokeDeviceSession,
} from "../auth/auth-routes.js";
import { disposeManagedCodexSession } from "../codex/codex-session-manager.js";
import { closeControllerSocketsForSession } from "../websocket/controller-socket.js";

function tokenEquals(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function adminTokenFromRequest(request: FastifyRequest) {
  const authorization = request.headers.authorization;

  if (authorization?.startsWith("Bearer ")) {
    return authorization.slice("Bearer ".length).trim();
  }

  const headerToken = request.headers["x-admin-token"];
  return Array.isArray(headerToken) ? headerToken[0] : headerToken;
}

function isLoopback(request: FastifyRequest) {
  return ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(request.ip);
}

function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  const configuredToken = process.env.CODEX_ADMIN_TOKEN;

  if (configuredToken) {
    const requestToken = adminTokenFromRequest(request);

    if (requestToken && tokenEquals(requestToken, configuredToken)) {
      return true;
    }

    reply.code(401).send({
      code: "ADMIN_UNAUTHORIZED",
      message: "A valid admin token is required.",
    });
    return false;
  }

  if (isLoopback(request)) {
    return true;
  }

  reply.code(403).send({
    code: "ADMIN_LOOPBACK_ONLY",
    message: "Admin APIs require CODEX_ADMIN_TOKEN or a loopback request.",
  });
  return false;
}

export async function registerAdminRoutes(app: FastifyInstance) {
  app.post<{ Body: { publicUrl?: string } }>("/api/admin/pairing-sessions", async (request, reply) => {
    if (!requireAdmin(request, reply)) {
      return;
    }

    const pairing = createPairingSession({
      publicUrl: request.body.publicUrl,
      host: request.headers.host,
    });

    return {
      qrId: pairing.qrId,
      qrUrl: pairing.qrUrl,
      expiresAt: pairing.expiresAt,
      status: pairing.status,
    };
  });

  app.get("/api/admin/devices", async (request, reply) => {
    if (!requireAdmin(request, reply)) {
      return;
    }

    return {
      devices: listDeviceSessions(),
    };
  });

  app.delete<{ Params: { sessionId: string } }>("/api/admin/devices/:sessionId", async (request, reply) => {
    if (!requireAdmin(request, reply)) {
      return;
    }

    const revoked = revokeDeviceSession(request.params.sessionId);
    closeControllerSocketsForSession(request.params.sessionId, "Device session revoked.");
    disposeManagedCodexSession(request.params.sessionId);

    return {
      sessionId: request.params.sessionId,
      revoked,
    };
  });

}
