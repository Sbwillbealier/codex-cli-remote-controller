import { useEffect, useState } from "react";
import { authorizePairingToken, resolveInitialAuth } from "../api/auth";
import { fetchCommands } from "../api/commands";
import { uploadAttachment } from "../api/upload";
import { InputBar } from "../components/InputBar";
import { OutputPanel } from "../components/OutputPanel";
import { StatusBar } from "../components/StatusBar";
import { useControllerSocket } from "../hooks/useControllerSocket";
import type { Attachment, SlashCommand, TerminalViewMode } from "../types/controller";

const fallbackSlashCommands: SlashCommand[] = [
  { name: "/status", description: "查看当前状态" },
  { name: "/review", description: "审查当前改动" },
  { name: "/compact", description: "压缩上下文" },
  { name: "/model", description: "查看或切换模型" },
  { name: "/clear", description: "清空当前会话" },
  { name: "/resume", description: "恢复最近会话" },
];

export function App() {
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<"loading" | "unpaired" | "pairing" | "authorized" | "error">("loading");
  const [pairingToken, setPairingToken] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const { status, tokenRemainingPercent, output, outputFormat, sendInput } = useControllerSocket(sessionToken);
  const [slashCommands, setSlashCommands] = useState(fallbackSlashCommands);
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [terminalViewMode, setTerminalViewMode] = useState<TerminalViewMode>("wrap");

  useEffect(() => {
    resolveInitialAuth()
      .then((result) => {
        if (result.status === "authorized") {
          setSessionToken(result.sessionToken);
          setAuthMode("authorized");
          return;
        }

        if (result.status === "pairing") {
          setPairingToken(result.pairingToken);
          setAuthMode("pairing");
          return;
        }

        setAuthMode("unpaired");
      })
      .catch(() => {
        setSessionToken(null);
        setAuthMode("error");
      });
  }, []);

  useEffect(() => {
    if (!sessionToken) {
      return;
    }

    fetchCommands(sessionToken)
      .then((commands) => {
        setSlashCommands(commands);
      })
      .catch(() => {
        setSlashCommands(fallbackSlashCommands);
      });
  }, [sessionToken]);

  function handleSend(text: string) {
    sendInput(text, attachments, slashCommands[selectedCommandIndex]?.name ?? "/status");
    setAttachments([]);
  }

  function handleRemoveAttachment(id: string) {
    setAttachments((current) => current.filter((attachment) => attachment.id !== id));
  }

  async function handleUploadFiles(files: File[]) {
    if (!sessionToken) {
      return;
    }

    const nextAttachments = await Promise.all(files.map((file) => uploadAttachment(file, sessionToken)));
    setAttachments((current) => [...current, ...nextAttachments]);
  }

  async function handleAuthorizePairing() {
    if (!pairingToken) {
      return;
    }

    setAuthError(null);

    try {
      const nextSessionToken = await authorizePairingToken(pairingToken);
      setSessionToken(nextSessionToken);
      setAuthMode("authorized");
      setPairingToken(null);
    } catch {
      setAuthError("配对链接无效、已使用或已过期。请在服务器上重新生成二维码。");
      setAuthMode("error");
    }
  }

  const isAuthorized = authMode === "authorized" && Boolean(sessionToken);

  return (
    <main className="app-shell">
      <section
        className={`controller-frame ${isAuthorized ? "" : "controller-frame--auth"}`}
        aria-label="Codex H5 remote controller"
      >
        <StatusBar status={isAuthorized ? status : "unauthorized"} tokenRemainingPercent={tokenRemainingPercent} />
        {isAuthorized ? (
          <>
            <OutputPanel
              content={output}
              format={outputFormat}
              status={status}
              terminalViewMode={terminalViewMode}
              onTerminalViewModeChange={setTerminalViewMode}
            />
            <InputBar
              attachments={attachments}
              commands={slashCommands}
              disabled={!sessionToken || status === "unauthorized" || status === "offline"}
              selectedCommandIndex={selectedCommandIndex}
              onSelectCommand={setSelectedCommandIndex}
              onSend={handleSend}
              onUploadFiles={handleUploadFiles}
              onRemoveAttachment={handleRemoveAttachment}
            />
          </>
        ) : (
          <section className="pairing-panel" aria-label="设备配对">
            <div className="pairing-shell">
              <span className="pairing-kicker">Codex Controller</span>
              {authMode === "loading" ? (
                <>
                  <h1>正在检查授权</h1>
                  <p>请稍候。</p>
                </>
              ) : null}
              {authMode === "unpaired" ? (
                <>
                  <h1>等待扫码配对</h1>
                  <p>请在服务器终端执行配对命令，使用手机扫描控制台二维码后打开此页面。</p>
                </>
              ) : null}
              {authMode === "pairing" ? (
                <>
                  <h1>授权此设备</h1>
                  <p>确认后，这台手机将可以控制当前 Codex 会话。</p>
                  <button className="pairing-button" type="button" onClick={handleAuthorizePairing}>
                    授权并进入
                  </button>
                </>
              ) : null}
              {authMode === "error" ? (
                <>
                  <h1>配对失败</h1>
                  <p>{authError ?? "无法建立授权，请重新扫码。"}</p>
                </>
              ) : null}
            </div>
          </section>
        )}
      </section>
    </main>
  );
}
