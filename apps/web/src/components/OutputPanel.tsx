import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { CodexStatus, OutputFormat, TerminalViewMode } from "../types/controller";

interface OutputPanelProps {
  content: string;
  format: OutputFormat;
  status: CodexStatus;
  terminalViewMode: TerminalViewMode;
  onTerminalViewModeChange: (mode: TerminalViewMode) => void;
}

const terminalModes: Array<{ label: string; mode: TerminalViewMode }> = [
  { label: "Fit", mode: "fit" },
  { label: "Wrap", mode: "wrap" },
  { label: "Raw", mode: "raw" },
];

function terminalLineClass(line: string) {
  const trimmed = line.trim();

  if (/^[›>]/.test(trimmed) || /^\/[a-z]/i.test(trimmed)) {
    return "terminal-output-line terminal-output-line--prompt";
  }

  if (/^(OpenAI Codex|model:|directory:|remote:|permissions:|session:|account:|5h limit:|weekly limit:)/i.test(trimmed)) {
    return "terminal-output-line terminal-output-line--status";
  }

  return "terminal-output-line";
}

export function OutputPanel({
  content,
  format,
  status,
  terminalViewMode,
  onTerminalViewModeChange,
}: OutputPanelProps) {
  const panelRef = useRef<HTMLElement | null>(null);
  const isPinnedRef = useRef(true);
  const [showReturnButton, setShowReturnButton] = useState(false);

  function syncScrollState() {
    const panel = panelRef.current;

    if (!panel) {
      return;
    }

    const distanceFromBottom = panel.scrollHeight - panel.scrollTop - panel.clientHeight;
    const isPinned = distanceFromBottom <= 48;

    isPinnedRef.current = isPinned;
    setShowReturnButton(!isPinned);
  }

  function scrollToBottom(behavior: ScrollBehavior = "auto") {
    const panel = panelRef.current;

    if (!panel) {
      return;
    }

    panel.scrollTo({
      top: panel.scrollHeight,
      behavior,
    });
    isPinnedRef.current = true;
    setShowReturnButton(false);
  }

  useEffect(() => {
    if (!isPinnedRef.current) {
      setShowReturnButton(true);
      return;
    }

    requestAnimationFrame(() => scrollToBottom());
  }, [content, status]);

  return (
    <section ref={panelRef} className="output-panel" aria-label="Codex 输出" onScroll={syncScrollState}>
      {format === "terminal" ? (
        <div className="terminal-view-toggle" aria-label="终端显示模式">
          {terminalModes.map((item) => (
            <button
              key={item.mode}
              className={`terminal-view-button ${
                terminalViewMode === item.mode ? "terminal-view-button--active" : ""
              }`}
              type="button"
              aria-pressed={terminalViewMode === item.mode}
              onClick={() => onTerminalViewModeChange(item.mode)}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
      <div className="output-content">
        {status === "offline" ? <div className="inline-alert">连接已断开，正在尝试恢复</div> : null}
        {status === "unauthorized" ? <div className="inline-alert inline-alert--warning">正在建立授权会话</div> : null}
        {status === "error" ? <div className="error-block">任务执行失败。请检查服务端连接或重新发送。</div> : null}
        {format === "terminal" ? (
          <pre className={`terminal-output terminal-output--${terminalViewMode}`} aria-label="终端输出">
            {content.split("\n").map((line, index, lines) => (
              <span className={terminalLineClass(line)} key={`${index}-${line.slice(0, 16)}`}>
                {line}
                {index < lines.length - 1 ? "\n" : ""}
              </span>
            ))}
          </pre>
        ) : (
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        )}
        {status === "thinking" ? <p className="thinking-line">Codex 正在思考...</p> : null}
        {status === "streaming" ? <p className="streaming-line">正在输出...</p> : null}
      </div>
      {showReturnButton ? (
        <button className="return-bottom-button" type="button" onClick={() => scrollToBottom("smooth")}>
          回到底部
        </button>
      ) : null}
    </section>
  );
}
