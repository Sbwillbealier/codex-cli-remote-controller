import { authHeaders } from "./auth";
import type { Attachment } from "../types/controller";

interface UploadResponse {
  attachmentId: string;
  name: string;
  mimeType: string;
  size: number;
  previewUrl?: string;
}

function formatBytes(size: number) {
  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${Math.round(size / 102.4) / 10} KB`;
  }

  return `${Math.round(size / 1024 / 102.4) / 10} MB`;
}

function displayMimeType(mimeType: string) {
  const subtype = mimeType.split("/")[1] ?? mimeType;
  return subtype.toUpperCase();
}

export async function uploadAttachment(file: File, sessionToken: string): Promise<Attachment> {
  const formData = new FormData();

  formData.append("file", file);

  const response = await fetch("/api/uploads", {
    method: "POST",
    headers: authHeaders(sessionToken),
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Upload failed: ${response.status}`);
  }

  const data = (await response.json()) as UploadResponse;

  return {
    id: data.attachmentId,
    name: data.name,
    mimeType: displayMimeType(data.mimeType),
    sizeLabel: formatBytes(data.size),
    previewUrl: data.previewUrl ? `${data.previewUrl}?sessionToken=${encodeURIComponent(sessionToken)}` : undefined,
  };
}
