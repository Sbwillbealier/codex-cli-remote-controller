import { useEffect, useRef, useState } from "react";
import type { CodexStatus } from "../types/controller";

interface StatusBarProps {
  status: CodexStatus;
  tokenRemainingPercent: number | null;
}

const statusLabel: Record<CodexStatus, string> = {
  unauthorized: "未授权",
  idle: "待命",
  thinking: "思考中",
  streaming: "输出中",
  offline: "离线",
  error: "错误",
};

export function StatusBar({ status, tokenRemainingPercent }: StatusBarProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const tokenWrapRef = useRef<HTMLDivElement | null>(null);
  const tokenText = tokenRemainingPercent === null ? "Token --" : `Token ${tokenRemainingPercent}%`;
  const tokenDetail = tokenRemainingPercent === null ? "未知" : `${tokenRemainingPercent}%`;
  const tokenMeterValue = tokenRemainingPercent ?? 0;

  useEffect(() => {
    function closeDetails(event: PointerEvent) {
      const target = event.target;

      if (target instanceof Node && !tokenWrapRef.current?.contains(target)) {
        setDetailsOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setDetailsOpen(false);
      }
    }

    function closeOnScroll() {
      setDetailsOpen(false);
    }

    document.addEventListener("pointerdown", closeDetails, true);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("scroll", closeOnScroll, true);

    return () => {
      document.removeEventListener("pointerdown", closeDetails, true);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("scroll", closeOnScroll, true);
    };
  }, []);

  return (
    <header className="status-bar">
      <div className="brand-icon" aria-label="Codex">
        <img
          alt=""
          src="/assets/codex-header-icon-128.png"
          srcSet="/assets/codex-header-icon-128.png 1x, /assets/codex-header-icon-512.png 2x"
        />
      </div>
      <div className="status-cluster" aria-live="polite">
        <span className={`status-dot status-dot--${status}`} />
        <span>{statusLabel[status]}</span>
      </div>
      <div className="session-chip" aria-label="当前控制模式">
        <span>PTY</span>
        <strong>LIVE</strong>
      </div>
      <div ref={tokenWrapRef} className="token-wrap">
        <button
          className="token-pill"
          type="button"
          aria-label="查看 token 详情"
          aria-expanded={detailsOpen}
          onClick={() => setDetailsOpen((current) => !current)}
        >
          <span className="token-label">{tokenText}</span>
          <span className="token-short">{tokenRemainingPercent === null ? "T --" : `T ${tokenRemainingPercent}%`}</span>
        </button>
        {detailsOpen ? (
          <div className="token-popover">
            <div>
              <span>Token</span>
              <strong>{tokenDetail}</strong>
            </div>
            <div className="token-meter" aria-hidden="true">
              <span style={{ width: `${tokenMeterValue}%` }} />
            </div>
            <div>
              <span>状态</span>
              <strong>{statusLabel[status]}</strong>
            </div>
          </div>
        ) : null}
      </div>
    </header>
  );
}
