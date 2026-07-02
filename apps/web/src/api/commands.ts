import { authHeaders } from "./auth";
import type { SlashCommand } from "../types/controller";

export async function fetchCommands(sessionToken: string) {
  const response = await fetch("/api/commands", {
    headers: authHeaders(sessionToken),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch commands: ${response.status}`);
  }

  const data = (await response.json()) as { commands: SlashCommand[] };
  return data.commands;
}
