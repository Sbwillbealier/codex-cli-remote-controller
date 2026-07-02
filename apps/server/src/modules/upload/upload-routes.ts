import { createWriteStream } from "node:fs";
import { createReadStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { getAuthorizedSession, requireRequestSession } from "../auth/auth-routes.js";
import { getDatabase } from "../storage/database.js";
import { uploadRoot } from "../storage/paths.js";

const maxFileSize = 20 * 1024 * 1024;
const allowedMimeTypes = new Set([
  "application/json",
  "application/octet-stream",
  "application/pdf",
  "application/zip",
  "text/csv",
  "text/markdown",
  "text/plain",
]);

interface AttachmentRow {
  attachment_id: string;
  session_id: string;
  original_name: string;
  stored_path: string;
  mime_type: string;
  size: number;
}

function safeDisplayName(name: string) {
  return basename(name).replace(/[^\w.\-\u4e00-\u9fa5]/g, "_");
}

function dateFolder() {
  return new Date().toISOString().slice(0, 10);
}

function isAllowedMimeType(mimeType: string) {
  return mimeType.startsWith("image/") || mimeType.startsWith("text/") || allowedMimeTypes.has(mimeType);
}

function tokenFromRequest(requestUrl: string) {
  const url = new URL(requestUrl, "http://localhost");
  return url.searchParams.get("sessionToken") ?? undefined;
}

export function attachmentPathsForSession(sessionId: string, attachmentIds: string[]) {
  if (attachmentIds.length === 0) {
    return [];
  }

  const placeholders = attachmentIds.map(() => "?").join(", ");
  const rows = getDatabase()
    .prepare(
      `SELECT attachment_id, stored_path FROM attachments WHERE session_id = ? AND attachment_id IN (${placeholders})`,
    )
    .all(sessionId, ...attachmentIds) as Pick<AttachmentRow, "attachment_id" | "stored_path">[];
  const pathById = new Map(rows.map((row) => [row.attachment_id, row.stored_path]));

  return attachmentIds.flatMap((id) => {
    const storedPath = pathById.get(id);
    return storedPath ? [storedPath] : [];
  });
}

export async function registerUploadRoutes(app: FastifyInstance) {
  app.post("/api/uploads", async (request, reply) => {
    const session = requireRequestSession(request, reply);

    if (!session) {
      return;
    }

    const file = await request.file({ limits: { fileSize: maxFileSize } });

    if (!file) {
      return reply.code(400).send({
        code: "UPLOAD_FILE_REQUIRED",
        message: "No file was provided.",
      });
    }

    if (!isAllowedMimeType(file.mimetype)) {
      return reply.code(415).send({
        code: "UPLOAD_TYPE_NOT_ALLOWED",
        message: "This file type is not allowed.",
      });
    }

    const originalName = safeDisplayName(file.filename);
    const extension = extname(originalName).slice(0, 12);
    const attachmentId = `att_${randomUUID()}`;
    const storedName = `${attachmentId}${extension}`;
    const folder = join(uploadRoot, dateFolder());
    const storedPath = join(folder, storedName);

    await mkdir(folder, { recursive: true });
    await pipeline(file.file, createWriteStream(storedPath));
    const size = file.file.bytesRead;
    const now = new Date().toISOString();

    getDatabase()
      .prepare(
        "INSERT INTO attachments (attachment_id, session_id, original_name, stored_name, stored_path, mime_type, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(attachmentId, session.sessionId, originalName, storedName, storedPath, file.mimetype, size, now);

    return {
      attachmentId,
      name: originalName,
      mimeType: file.mimetype,
      size,
      previewUrl: file.mimetype.startsWith("image/") ? `/api/uploads/${attachmentId}/preview` : undefined,
    };
  });

  app.get<{ Params: { attachmentId: string } }>("/api/uploads/:attachmentId/preview", async (request, reply) => {
    const session = getAuthorizedSession(tokenFromRequest(request.url));

    if (!session) {
      return reply.code(401).send({
        code: "UNAUTHORIZED",
        message: "A valid session token is required.",
      });
    }

    const row = getDatabase()
      .prepare(
        "SELECT attachment_id, session_id, original_name, stored_path, mime_type, size FROM attachments WHERE attachment_id = ? AND session_id = ?",
      )
      .get(request.params.attachmentId, session.sessionId) as AttachmentRow | undefined;

    if (!row) {
      return reply.code(404).send({
        code: "ATTACHMENT_NOT_FOUND",
        message: "Attachment was not found.",
      });
    }

    reply.header("Content-Type", row.mime_type);
    reply.header("Content-Length", String(row.size));
    reply.header("Content-Disposition", `inline; filename="${encodeURIComponent(row.original_name)}"`);
    return reply.send(createReadStream(row.stored_path));
  });
}
