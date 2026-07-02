import type { FastifyBaseLogger } from "fastify";
import pty, { type IPty } from "node-pty";
import { codexCommandConfig, configuredWorkspace, isDirectory, parseTokenPercent } from "./codex-runtime-config.js";

const clearPromptInput = "\x15";
const bracketedPasteStart = "\x1b[200~";
const bracketedPasteEnd = "\x1b[201~";

function probeTimeoutMs() {
  return Number(process.env.CODEX_TOKEN_PROBE_TIMEOUT_MS ?? 20_000);
}

export async function probeCodexTokenPercent(logger: FastifyBaseLogger) {
  if (process.env.CODEX_ADAPTER !== "pty") {
    return null;
  }

  const cwd = configuredWorkspace();

  if (!isDirectory(cwd)) {
    logger.warn({ cwd }, "skipping Codex token probe because workspace does not exist");
    return null;
  }

  const { command, args } = codexCommandConfig();

  return new Promise<number | null>((resolve) => {
    let child: IPty | null = null;
    let output = "";
    let completed = false;
    let statusRequestCount = 0;
    let statusRequestTimer: NodeJS.Timeout | null = null;

    const requestStatus = () => {
      if (!child || completed || statusRequestCount >= 3) {
        return;
      }

      statusRequestCount += 1;
      child.write(`${clearPromptInput}${bracketedPasteStart}/status${bracketedPasteEnd}\r`);
      logger.debug({ attempt: statusRequestCount }, "sent Codex token probe /status request");
    };

    const finish = (value: number | null) => {
      if (completed) {
        return;
      }

      completed = true;
      clearTimeout(timer);
      if (statusRequestTimer) {
        clearInterval(statusRequestTimer);
        statusRequestTimer = null;
      }

      if (child) {
        child.kill();
        child = null;
      }

      resolve(value);
    };

    const timer = setTimeout(() => {
      logger.warn(
        { timeoutMs: probeTimeoutMs(), statusRequestCount },
        "Codex token probe timed out without token percentage",
      );
      finish(null);
    }, probeTimeoutMs());

    try {
      child = pty.spawn(command, args, {
        cols: Number(process.env.CODEX_PTY_COLS ?? 100),
        rows: Number(process.env.CODEX_PTY_ROWS ?? 32),
        cwd,
        env: process.env,
        name: "xterm-256color",
      });
    } catch (error) {
      logger.warn({ error }, "failed to start Codex token probe");
      finish(null);
      return;
    }

    child.onData((data) => {
      output += data;

      const tokenPercent = parseTokenPercent(output);

      if (tokenPercent !== null) {
        logger.info({ tokenPercent }, "Codex token probe completed");
        finish(tokenPercent);
        return;
      }
    });

    child.onExit(() => {
      const tokenPercent = parseTokenPercent(output);

      if (tokenPercent === null) {
        logger.warn("Codex token probe exited without token percentage");
      }

      finish(tokenPercent);
    });

    setTimeout(requestStatus, Number(process.env.CODEX_TOKEN_PROBE_FIRST_STATUS_DELAY_MS ?? 1800));
    statusRequestTimer = setInterval(requestStatus, Number(process.env.CODEX_TOKEN_PROBE_RETRY_MS ?? 3500));
  });
}
