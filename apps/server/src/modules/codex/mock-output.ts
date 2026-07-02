export function initialOutput(selectedCommand = "/status") {
  return `> ${selectedCommand}

Codex 处于待命状态。

最近任务：实现 H5 远程控制器原型界面

模型：codex-1

Token：72%（剩余约 14,400）

工作区：/workspace/project

会话 ID：b1f8c2d4-7a9d-4e3a-9f06-2b1c7e9d8a1f

---

## 任务概述

本次任务目标是实现一个 **H5 远程控制器**，用于在手机上与 Codex 进行自然语言交互。

### 关键功能

- 扫码进入，服务端授权
- 实时状态与 Token 展示
- 斜杠命令快速访问
- 支持文件与图片上传
- 输出区域可滚动，支持手动选中文本复制

### 示例代码

\`\`\`ts
function greet(name: string) {
  const msg = \`Hello, \${name}!\`;
  return msg;
}

greet("Codex");
\`\`\`

日志：

\`\`\`text
[09:21:01] websocket mock connected
[09:21:02] controller state: idle
[09:21:03] selected command: ${selectedCommand}
\`\`\`
`;
}

export function responseOutput(input: string, attachmentCount: number) {
  const target = input.trim() || "/status";
  const attachmentLine =
    attachmentCount > 0 ? `\n\n已收到 ${attachmentCount} 个附件，后续会由 Codex Adapter 转换为本地文件引用。` : "";

  return `\n\n> ${target}

服务端 mock 已收到请求。

- 当前阶段：本地服务端骨架
- 通信方式：WebSocket
- 状态流：thinking → streaming → idle${attachmentLine}

\`\`\`text
[mock-server] accepted input: ${target}
[mock-server] streaming output chunks
[mock-server] done
\`\`\`
`;
}
