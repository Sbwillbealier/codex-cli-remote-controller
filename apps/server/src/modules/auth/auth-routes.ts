import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { getDatabase } from "../storage/database.js";

interface QrSessionRow {
  qr_id: string;
  token_hash: string;
  status: "pending" | "authorized";
  expires_at: string;
  session_id: string | null;
}

interface DeviceSessionRow {
  session_id: string;
  token_hash: string;
  device_name: string;
  created_at: string;
  expires_at: string;
  last_seen_at: string;
  revoked_at: string | null;
}

export interface AuthorizedSession {
  sessionId: string;
  deviceName: string;
}

const qrTokenTtlMs = 5 * 60 * 1000;
const sessionTtlMs = 30 * 24 * 60 * 60 * 1000;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function tokenEquals(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function bearerToken(request: FastifyRequest) {
  const authorization = request.headers.authorization;

  if (!authorization?.startsWith("Bearer ")) {
    return undefined;
  }

  return authorization.slice("Bearer ".length).trim();
}

function normalizePublicControllerUrl(publicUrl: string) {
  return publicUrl.replace(/\/+$/, "");
}

function publicControllerUrl(host: string | undefined) {
  if (process.env.PUBLIC_CONTROLLER_URL) {
    return normalizePublicControllerUrl(process.env.PUBLIC_CONTROLLER_URL);
  }

  return `http://${host ?? "localhost:5173"}`;
}

export function createPairingSession(options: { publicUrl?: string; host?: string } = {}) {
  const qrId = `qr_${randomUUID()}`;
  const oneTimeToken = randomBytes(18).toString("base64url");
  const expiresAt = new Date(Date.now() + qrTokenTtlMs).toISOString();
  const baseUrl = normalizePublicControllerUrl(options.publicUrl ?? publicControllerUrl(options.host));
  const qrUrl = `${baseUrl}/mobile?token=${encodeURIComponent(oneTimeToken)}`;

  getDatabase()
    .prepare("INSERT INTO qr_sessions (qr_id, token_hash, status, created_at, expires_at) VALUES (?, ?, ?, ?, ?)")
    .run(qrId, hashToken(oneTimeToken), "pending", new Date().toISOString(), expiresAt);

  return {
    qrId,
    qrUrl,
    oneTimeToken,
    expiresAt,
    status: "pending" as const,
  };
}

export function authorizePairingToken(oneTimeToken: string, deviceNameInput?: string) {
  const tokenHash = hashToken(oneTimeToken);
  const row = getDatabase()
    .prepare("SELECT qr_id, token_hash, status, expires_at, session_id FROM qr_sessions WHERE token_hash = ?")
    .get(tokenHash) as QrSessionRow | undefined;

  if (!row || !tokenEquals(row.token_hash, tokenHash)) {
    return {
      ok: false as const,
      statusCode: 401,
      code: "INVALID_QR_TOKEN",
      message: "The QR token is invalid.",
    };
  }

  if (row.status !== "pending" || Date.parse(row.expires_at) <= Date.now()) {
    return {
      ok: false as const,
      statusCode: 409,
      code: "QR_TOKEN_NOT_USABLE",
      message: "The QR token has already been used or expired.",
    };
  }

  const now = new Date().toISOString();
  const sessionId = `sess_${randomUUID()}`;
  const sessionToken = randomBytes(32).toString("base64url");
  const sessionExpiresAt = new Date(Date.now() + sessionTtlMs).toISOString();
  const deviceName = deviceNameInput?.trim().slice(0, 80) || "H5 controller";

  const authorize = getDatabase().transaction(() => {
    getDatabase()
      .prepare(
        "INSERT INTO device_sessions (session_id, token_hash, device_name, created_at, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(sessionId, hashToken(sessionToken), deviceName, now, sessionExpiresAt, now);
    getDatabase()
      .prepare("UPDATE qr_sessions SET status = ?, authorized_at = ?, session_id = ? WHERE qr_id = ?")
      .run("authorized", now, sessionId, row.qr_id);
  });

  authorize();

  return {
    ok: true as const,
    sessionId,
    sessionToken,
    expiresAt: sessionExpiresAt,
    deviceName,
  };
}

export function listDeviceSessions() {
  const rows = getDatabase()
    .prepare(
      "SELECT session_id, device_name, created_at, expires_at, last_seen_at, revoked_at FROM device_sessions ORDER BY created_at DESC",
    )
    .all() as Array<Omit<DeviceSessionRow, "token_hash">>;

  return rows.map((row) => ({
    sessionId: row.session_id,
    deviceName: row.device_name,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    lastSeenAt: row.last_seen_at,
    revokedAt: row.revoked_at,
    status: row.revoked_at
      ? "revoked"
      : Date.parse(row.expires_at) <= Date.now()
        ? "expired"
        : "active",
  }));
}

export function revokeDeviceSession(sessionId: string) {
  const result = getDatabase()
    .prepare("UPDATE device_sessions SET revoked_at = ? WHERE session_id = ? AND revoked_at IS NULL")
    .run(new Date().toISOString(), sessionId);

  return result.changes > 0;
}

export function getAuthorizedSession(token: string | undefined): AuthorizedSession | null {
  if (!token) {
    return null;
  }

  const tokenHash = hashToken(token);
  const row = getDatabase()
    .prepare("SELECT session_id, token_hash, device_name, expires_at, revoked_at FROM device_sessions WHERE token_hash = ?")
    .get(tokenHash) as DeviceSessionRow | undefined;

  if (!row || row.revoked_at || Date.parse(row.expires_at) <= Date.now() || !tokenEquals(row.token_hash, tokenHash)) {
    return null;
  }

  getDatabase()
    .prepare("UPDATE device_sessions SET last_seen_at = ? WHERE session_id = ?")
    .run(new Date().toISOString(), row.session_id);

  return {
    sessionId: row.session_id,
    deviceName: row.device_name,
  };
}

export function getRequestSession(request: FastifyRequest) {
  return getAuthorizedSession(bearerToken(request));
}

export function requireRequestSession(request: FastifyRequest, reply: FastifyReply) {
  const session = getRequestSession(request);

  if (!session) {
    reply.code(401).send({
      code: "UNAUTHORIZED",
      message: "A valid session token is required.",
    });
    return null;
  }

  return session;
}

export async function registerAuthRoutes(app: FastifyInstance) {
  app.post("/api/auth/qr-session", async (_request, reply) => {
    return reply.code(403).send({
      code: "PAIRING_REQUIRES_ADMIN",
      message: "Create pairing sessions from the server CLI or the admin pairing API.",
    });
  });

  app.get<{ Params: { qrId: string } }>("/api/auth/qr-session/:qrId", async (request) => {
    const row = getDatabase()
      .prepare("SELECT qr_id, status, expires_at, session_id FROM qr_sessions WHERE qr_id = ?")
      .get(request.params.qrId) as Pick<QrSessionRow, "qr_id" | "status" | "expires_at" | "session_id"> | undefined;

    if (!row) {
      return {
        qrId: request.params.qrId,
        status: "missing",
      };
    }

    if (row.status === "pending" && Date.parse(row.expires_at) <= Date.now()) {
      return {
        qrId: row.qr_id,
        status: "expired",
        expiresAt: row.expires_at,
      };
    }

    return {
      qrId: row.qr_id,
      status: row.status,
      expiresAt: row.expires_at,
      sessionId: row.session_id,
    };
  });

  app.post<{ Body: { token?: string; deviceName?: string } }>("/api/auth/authorize", async (request, reply) => {
    const oneTimeToken = request.body.token?.trim();

    if (!oneTimeToken) {
      return reply.code(400).send({
        code: "AUTH_TOKEN_REQUIRED",
        message: "A one-time QR token is required.",
      });
    }

    const result = authorizePairingToken(oneTimeToken, request.body.deviceName);

    if (!result.ok) {
      return reply.code(result.statusCode).send({
        code: result.code,
        message: result.message,
      });
    }

    return result;
  });

  app.get("/api/auth/session", async (request, reply) => {
    const session = requireRequestSession(request, reply);

    if (!session) {
      return;
    }

    return session;
  });
}
