import { existsSync, statSync } from "node:fs";

export const defaultCodexCommand = "codex";

export function splitArgs(value: string | undefined) {
  return value?.match(/(?:[^\s"]+|"[^"]*")+/g)?.map((part) => part.replace(/^"|"$/g, "")) ?? [];
}

export function codexCommandConfig() {
  const command = process.env.CODEX_CLI_COMMAND ?? defaultCodexCommand;
  const args =
    process.env.CODEX_CLI_ARGS !== undefined
      ? splitArgs(process.env.CODEX_CLI_ARGS)
      : command === defaultCodexCommand
        ? ["--no-alt-screen"]
        : [];

  return { command, args };
}

export function configuredWorkspace() {
  const workspace = process.env.CODEX_WORKSPACE?.trim();

  if (workspace) {
    return workspace;
  }

  return process.env.INIT_CWD ?? process.cwd();
}

export function isDirectory(path: string) {
  try {
    return existsSync(path) && statSync(path).isDirectory();
  } catch {
    return false;
  }
}

export function parseTokenPercent(content: string) {
  const patterns = [
    /(?:token|context)[^\n%]{0,40}?(\d{1,3})\s*%/i,
    /(\d{1,3})\s*%[^\n]{0,40}?(?:token|context)/i,
    /(?:5h limit|weekly limit)[^\n]*?(\d{1,3})\s*%\s*left/i,
  ];

  for (const pattern of patterns) {
    const match = content.match(pattern);
    const value = match ? Number(match[1]) : Number.NaN;

    if (Number.isInteger(value) && value >= 0 && value <= 100) {
      return value;
    }
  }

  return null;
}
