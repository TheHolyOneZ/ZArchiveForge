
import { Delete } from "lucide-react";
import "./MaskBuilder.css";

interface Props {
  value: string;
  onChange: (v: string) => void;
}

const TOKENS: { token: string; label: string }[] = [
  { token: "?l", label: "a-z" },
  { token: "?u", label: "A-Z" },
  { token: "?d", label: "0-9" },
  { token: "?s", label: "!@#" },
];


function maskLength(pattern: string): number {
  let len = 0;
  let i = 0;
  while (i < pattern.length) {
    if (pattern[i] === "?" && i + 1 < pattern.length) {
      len++;
      i += 2;
    } else {
      len++;
      i++;
    }
  }
  return len;
}

export function MaskBuilder({ value, onChange }: Props) {
  return (
    <div className="mask">
      <input
        className="input mask-input selectable"
        value={value}
        spellCheck={false}
        placeholder="e.g. ?l?l?l?d?d"
        onChange={(e) => onChange(e.currentTarget.value)}
      />
      <div className="mask-tokens">
        {TOKENS.map((t) => (
          <button
            key={t.token}
            type="button"
            className="mask-chip"
            title={`Append ${t.token} (${t.label})`}
            onClick={() => onChange(value + t.token)}
          >
            <code>{t.token}</code> {t.label}
          </button>
        ))}
        <button
          type="button"
          className="mask-chip mask-back"
          title="Delete last token"
          aria-label="Delete last token"
          onClick={() => onChange(value.replace(/\?.$|.$/, ""))}
        >
          <Delete size={15} />
        </button>
      </div>
      <div className="mask-legend muted">
        <span><code>?l</code> a-z</span>
        <span><code>?u</code> A-Z</span>
        <span><code>?d</code> 0-9</span>
        <span><code>?s</code> symbols</span>
        <span>other chars are literals</span>
        {value.length > 0 && <span className="mask-len">length {maskLength(value)}</span>}
      </div>
    </div>
  );
}
