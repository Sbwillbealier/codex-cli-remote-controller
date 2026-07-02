export type CodexStatus = "unauthorized" | "idle" | "thinking" | "streaming" | "offline" | "error";

export interface SlashCommand {
  name: string;
  description: string;
}

export interface AttachmentMetadata {
  attachmentId: string;
  name: string;
  mimeType: string;
  size: number;
  previewUrl?: string;
}

export type OutputFormat = "markdown" | "terminal";

export type ClientSocketEvent =
  | {
      type: "input.send";
      payload: {
        text: string;
        attachmentIds: string[];
      };
    }
  | {
      type: "command.send";
      payload: {
        command: string;
      };
    };

export type ServerSocketEvent =
  | {
      type: "status.update";
      payload: {
        status: CodexStatus;
        tokenRemainingPercent: number | null;
      };
    }
  | {
      type: "output.reset";
      payload: {
        content: string;
        format: OutputFormat;
      };
    }
  | {
      type: "output.chunk";
      payload: {
        chunkId: string;
        content: string;
        format: OutputFormat;
      };
    }
  | {
      type: "error";
      payload: {
        code: string;
        message: string;
      };
    };
