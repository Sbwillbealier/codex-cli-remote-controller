import { Check } from "lucide-react";
import type { SlashCommand } from "../types/controller";

interface SlashCommandWheelProps {
  commands: SlashCommand[];
  expanded: boolean;
  selectedIndex: number;
  onToggle: () => void;
  onSelect: (index: number) => void;
}

export function SlashCommandWheel({ commands, expanded, selectedIndex, onToggle, onSelect }: SlashCommandWheelProps) {
  return (
    <div className="slash-wheel">
      {expanded ? (
        <div className="slash-popover" role="listbox" aria-label="斜杠命令">
          {commands.map((command, index) => (
            <button
              className={`slash-option ${index === selectedIndex ? "slash-option--selected" : ""}`}
              key={command.name}
              type="button"
              role="option"
              aria-selected={index === selectedIndex}
              title={command.description}
              onClick={() => onSelect(index)}
            >
              <span className="slash-option-copy">
                <span className="slash-option-name">{command.name}</span>
                <span className="slash-option-description">{command.description}</span>
              </span>
              {index === selectedIndex ? <Check size={18} strokeWidth={2.4} /> : null}
            </button>
          ))}
        </div>
      ) : null}
      <button
        className="wheel-dots"
        type="button"
        aria-label="切换斜杠命令"
        aria-expanded={expanded}
        onClick={onToggle}
      >
        <span className="wheel-dot" />
        <span className="wheel-dot wheel-dot--active" />
        <span className="wheel-dot" />
      </button>
    </div>
  );
}
