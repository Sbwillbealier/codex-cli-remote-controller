import type { SlashCommand } from "../../types/events.js";

export const slashCommands: SlashCommand[] = [
  { name: "/status", description: "查看当前状态" },
  { name: "/review", description: "审查当前改动" },
  { name: "/compact", description: "压缩上下文" },
  { name: "/model", description: "查看或切换模型" },
  { name: "/clear", description: "清空当前会话" },
  { name: "/resume", description: "恢复最近会话" },
];
