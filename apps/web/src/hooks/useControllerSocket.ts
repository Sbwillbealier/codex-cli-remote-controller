import { useCallback, useEffect, useRef, useState } from "react";
import type { Attachment, ClientSocketEvent, CodexStatus, OutputFormat, ServerSocketEvent } from "../types/controller";

interface ControllerSocketState {
  status: CodexStatus;
  tokenRemainingPercent: number | null;
  output: string;
  outputFormat: OutputFormat;
  isSocketConnected: boolean;
  sendInput: (text: string, attachments: Attachment[], fallbackCommand: string) => void;
}

function controllerSocketUrl(sessionToken: string) {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const isViteDevServer = /^517\d$/.test(window.location.port);
  const host = isViteDevServer ? `${window.location.hostname}:8787` : window.location.host;

  return `${protocol}//${host}/ws/controller?sessionToken=${encodeURIComponent(sessionToken)}`;
}

export function useControllerSocket(sessionToken: string | null): ControllerSocketState {
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);
  const [status, setStatus] = useState<CodexStatus>("unauthorized");
  const [tokenRemainingPercent, setTokenRemainingPercent] = useState<number | null>(null);
  const [output, setOutput] = useState("正在建立授权会话...");
  const [outputFormat, setOutputFormat] = useState<OutputFormat>("markdown");
  const [isSocketConnected, setIsSocketConnected] = useState(false);

  useEffect(() => {
    let disposed = false;

    function clearReconnectTimer() {
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    }

    function scheduleReconnect(connect: () => void) {
      if (disposed || !sessionToken || reconnectTimerRef.current !== null) {
        return;
      }

      const delayMs = Math.min(1000 + reconnectAttemptRef.current * 750, 5000);
      reconnectAttemptRef.current += 1;
      reconnectTimerRef.current = window.setTimeout(() => {
        reconnectTimerRef.current = null;
        connect();
      }, delayMs);
    }

    function connect() {
      if (!sessionToken || disposed) {
        return;
      }

      const socket = new WebSocket(controllerSocketUrl(sessionToken));
      socketRef.current = socket;
      setOutput((current) => (current.trim().length === 0 ? "正在连接本地控制服务..." : current));

      socket.addEventListener("open", () => {
        reconnectAttemptRef.current = 0;
        setIsSocketConnected(true);
      });

      socket.addEventListener("message", (message) => {
        const event = JSON.parse(message.data as string) as ServerSocketEvent;

        if (event.type === "status.update") {
          setStatus(event.payload.status);
          setTokenRemainingPercent(event.payload.tokenRemainingPercent);
          return;
        }

        if (event.type === "output.reset") {
          setOutputFormat(event.payload.format);
          setOutput(event.payload.content);
          return;
        }

        if (event.type === "output.chunk") {
          setOutputFormat(event.payload.format);
          setOutput((current) => `${current}${event.payload.content}`);
          return;
        }

        if (event.type === "error") {
          setStatus(event.payload.code === "UNAUTHORIZED" ? "unauthorized" : "error");
          setOutput((current) => `${current}\n\n错误：${event.payload.message}`);
        }
      });

      socket.addEventListener("close", () => {
        if (socketRef.current === socket) {
          socketRef.current = null;
        }

        setIsSocketConnected(false);

        if (!disposed) {
          setStatus("offline");
          scheduleReconnect(connect);
        }
      });

      socket.addEventListener("error", () => {
        setStatus("error");
      });
    }

    if (!sessionToken) {
      clearReconnectTimer();
      socketRef.current = null;
      setIsSocketConnected(false);
      setStatus("unauthorized");
      setOutput("正在建立授权会话...");
      setOutputFormat("markdown");
      return;
    }

    setOutput("正在连接本地控制服务...");
    setOutputFormat("markdown");
    connect();

    return () => {
      disposed = true;
      clearReconnectTimer();
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [sessionToken]);

  const sendInput = useCallback((text: string, attachments: Attachment[], fallbackCommand: string) => {
    const socket = socketRef.current;

    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setStatus("offline");
      return;
    }

    const trimmedText = text.trim();
    const event: ClientSocketEvent =
      trimmedText.length === 0 && attachments.length === 0
        ? {
            type: "command.send",
            payload: {
              command: fallbackCommand,
            },
          }
        : trimmedText.startsWith("/") && attachments.length === 0
          ? {
              type: "command.send",
              payload: {
                command: trimmedText,
              },
            }
        : {
            type: "input.send",
            payload: {
              text: trimmedText,
              attachmentIds: attachments.map((attachment) => attachment.id),
            },
          };

    socket.send(JSON.stringify(event));
  }, []);

  return {
    status,
    tokenRemainingPercent,
    output,
    outputFormat,
    isSocketConnected,
    sendInput,
  };
}
