import { CornerDownLeft, FileUp, Image, Plus } from "lucide-react";
import type { ChangeEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { AttachmentChip } from "./AttachmentChip";
import { SlashCommandWheel } from "./SlashCommandWheel";
import type { Attachment, SlashCommand } from "../types/controller";

interface InputBarProps {
  attachments: Attachment[];
  commands: SlashCommand[];
  disabled: boolean;
  selectedCommandIndex: number;
  onSelectCommand: (index: number) => void;
  onSend: (text: string) => void;
  onUploadFiles: (files: File[]) => void;
  onRemoveAttachment: (id: string) => void;
}

const rawKeyAliases = new Set([
  "enter",
  "return",
  "回车",
  "esc",
  "escape",
  "退出",
  "up",
  "down",
  "left",
  "right",
  "tab",
  "shift tab",
  "shift+tab",
  "ctrl c",
  "ctrl+c",
  "control c",
  "control+c",
  "上",
  "下",
  "左",
  "右",
  "↑",
  "↓",
  "←",
  "→",
]);

const virtualKeys = [
  { label: "↑", value: "up", title: "上移" },
  { label: "↓", value: "down", title: "下移" },
  { label: "Enter", value: "enter", title: "确认" },
  { label: "Esc", value: "esc", title: "返回" },
  { label: "Tab", value: "tab", title: "Tab" },
  { label: "⇧Tab", value: "shift+tab", title: "Shift Tab" },
  { label: "Ctrl+C", value: "ctrl+c", title: "中断" },
];

function isRawKeyInput(value: string) {
  const normalized = value.trim().toLowerCase();

  return /^[1-9]$/.test(normalized) || rawKeyAliases.has(normalized);
}

function inputModeLabel(text: string, attachments: Attachment[]) {
  const trimmed = text.trim();

  if (isRawKeyInput(trimmed)) {
    return "KEY";
  }

  if (trimmed.startsWith("/")) {
    return "CMD";
  }

  if (attachments.length > 0 && trimmed.length === 0) {
    return "ATTACH";
  }

  return "PROMPT";
}

export function InputBar({
  attachments,
  commands,
  disabled,
  selectedCommandIndex,
  onSelectCommand,
  onSend,
  onUploadFiles,
  onRemoveAttachment,
}: InputBarProps) {
  const [text, setText] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [pressedKey, setPressedKey] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const uploadWrapRef = useRef<HTMLDivElement | null>(null);
  const commandWrapRef = useRef<HTMLDivElement | null>(null);
  const pressedTimerRef = useRef<number | null>(null);
  const modeLabel = inputModeLabel(text, attachments);

  function triggerHaptic() {
    if ("vibrate" in navigator) {
      navigator.vibrate(8);
    }
  }

  function flashPressedKey(value: string) {
    if (pressedTimerRef.current !== null) {
      window.clearTimeout(pressedTimerRef.current);
    }

    setPressedKey(value);
    pressedTimerRef.current = window.setTimeout(() => {
      setPressedKey(null);
      pressedTimerRef.current = null;
    }, 140);
  }

  useEffect(() => {
    function closeFloatingControls(event: PointerEvent) {
      const target = event.target;

      if (!(target instanceof Node)) {
        return;
      }

      if (!uploadWrapRef.current?.contains(target)) {
        setUploadOpen(false);
      }

      if (!commandWrapRef.current?.contains(target)) {
        setCommandOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setUploadOpen(false);
        setCommandOpen(false);
      }
    }

    function closeOnScroll() {
      setUploadOpen(false);
      setCommandOpen(false);
    }

    document.addEventListener("pointerdown", closeFloatingControls, true);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("scroll", closeOnScroll, true);

    return () => {
      document.removeEventListener("pointerdown", closeFloatingControls, true);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("scroll", closeOnScroll, true);
      if (pressedTimerRef.current !== null) {
        window.clearTimeout(pressedTimerRef.current);
      }
    };
  }, []);

  function submit() {
    if (disabled) {
      return;
    }

    onSend(text);
    triggerHaptic();
    setText("");
    setUploadOpen(false);
    setCommandOpen(false);
  }

  function sendVirtualKey(value: string) {
    if (disabled) {
      return;
    }

    setUploadOpen(false);
    setCommandOpen(false);
    triggerHaptic();
    flashPressedKey(value);
    onSend(value);
  }

  function selectCommand(index: number) {
    const commandName = commands[index]?.name;

    onSelectCommand(index);
    setCommandOpen(false);
    triggerHaptic();

    if (commandName) {
      setText(commandName);
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);

    if (files.length > 0) {
      onUploadFiles(files);
      setUploadOpen(false);
    }

    event.target.value = "";
  }

  return (
    <footer className={`input-panel ${uploadOpen ? "input-panel--upload-open" : ""}`}>
      {attachments.length > 0 ? (
        <div className="attachment-row" aria-label="附件列表">
          {attachments.map((attachment) => (
            <AttachmentChip key={attachment.id} attachment={attachment} onRemove={onRemoveAttachment} />
          ))}
        </div>
      ) : null}

      <div className="virtual-key-row" aria-label="Codex TUI 虚拟按键">
        <div ref={commandWrapRef} className="command-wrap">
          <SlashCommandWheel
            commands={commands}
            expanded={commandOpen}
            selectedIndex={selectedCommandIndex}
            onToggle={() => {
              setUploadOpen(false);
              setCommandOpen((current) => !current);
            }}
            onSelect={selectCommand}
          />
        </div>
        <div className="virtual-key-scroll">
          {virtualKeys.map((key) => (
            <button
              key={key.value}
              className={`virtual-key-button ${key.value === "enter" ? "virtual-key-button--primary" : ""} ${
                pressedKey === key.value ? "virtual-key-button--pressed" : ""
              } ${modeLabel === "KEY" ? "virtual-key-button--key-mode" : ""}`}
              type="button"
              disabled={disabled}
              title={key.title}
              aria-label={key.title}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => sendVirtualKey(key.value)}
            >
              {key.label}
            </button>
          ))}
        </div>
      </div>

      <div className="composer-row">
        <div className="composer">
          <div ref={uploadWrapRef} className="upload-wrap">
            <input
              ref={imageInputRef}
              className="file-input-hidden"
              type="file"
              accept="image/*"
              multiple
              aria-label="选择图片"
              onChange={handleFileChange}
            />
            <input
              ref={fileInputRef}
              className="file-input-hidden"
              type="file"
              multiple
              aria-label="选择文件"
              onChange={handleFileChange}
            />
            {uploadOpen ? (
              <div className="upload-menu">
                <button type="button" onClick={() => imageInputRef.current?.click()}>
                  <Image size={17} />
                  <span>图片</span>
                </button>
                <button type="button" onClick={() => fileInputRef.current?.click()}>
                  <FileUp size={17} />
                  <span>文件</span>
                </button>
              </div>
            ) : null}
            <button
              className={`add-button ${uploadOpen ? "add-button--active" : ""}`}
              type="button"
              aria-label="上传文件或图片"
              aria-expanded={uploadOpen}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => setUploadOpen((current) => !current)}
            >
              <Plus size={26} strokeWidth={2.1} />
            </button>
          </div>

          <div className="input-field-wrap">
            <span className={`input-mode-badge input-mode-badge--${modeLabel.toLowerCase()}`}>{modeLabel}</span>
            <textarea
              ref={textareaRef}
              className="message-input"
              rows={1}
              value={text}
              disabled={disabled}
              placeholder="输入给 Codex..."
              onChange={(event) => setText(event.target.value)}
              onFocus={() => {
                setUploadOpen(false);
                setCommandOpen(false);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  submit();
                }
              }}
            />
          </div>

          <button className="send-button" type="button" disabled={disabled} aria-label="发送" onClick={submit}>
            <CornerDownLeft size={25} strokeWidth={2.2} />
          </button>
        </div>
      </div>
    </footer>
  );
}
