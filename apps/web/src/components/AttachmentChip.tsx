import { X } from "lucide-react";
import type { Attachment } from "../types/controller";

interface AttachmentChipProps {
  attachment: Attachment;
  onRemove: (id: string) => void;
}

export function AttachmentChip({ attachment, onRemove }: AttachmentChipProps) {
  return (
    <div className="attachment-chip">
      {attachment.previewUrl ? (
        <img className="attachment-preview" src={attachment.previewUrl} alt="" />
      ) : (
        <div className="attachment-preview attachment-preview--file">{attachment.mimeType.slice(0, 2)}</div>
      )}
      <div className="attachment-meta">
        <span className="attachment-name">{attachment.name}</span>
        <span className="attachment-detail">
          {attachment.mimeType} · {attachment.sizeLabel}
        </span>
      </div>
      <button className="icon-button icon-button--muted" type="button" aria-label="删除附件" onClick={() => onRemove(attachment.id)}>
        <X size={18} strokeWidth={2.2} />
      </button>
    </div>
  );
}
