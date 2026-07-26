
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import "./PasswordField.css";

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  showStrength?: boolean;
}


function scorePassword(pw: string): number {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  const classes =
    Number(/[a-z]/.test(pw)) +
    Number(/[A-Z]/.test(pw)) +
    Number(/[0-9]/.test(pw)) +
    Number(/[^a-zA-Z0-9]/.test(pw));
  if (classes >= 2) score++;
  if (classes >= 3 && pw.length >= 10) score++;
  return Math.min(score, 4);
}

const LABELS = ["", "Weak", "Fair", "Good", "Strong"];

export function PasswordField({ value, onChange, placeholder, showStrength = true }: Props) {
  const [visible, setVisible] = useState(false);
  const score = scorePassword(value);

  return (
    <div className="pw">
      <div className="pw-row">
        <input
          className="input pw-input selectable"
          type={visible ? "text" : "password"}
          value={value}
          placeholder={placeholder ?? "Password"}
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => onChange(e.currentTarget.value)}
        />
        <button
          type="button"
          className="btn pw-toggle"
          onClick={() => setVisible((v) => !v)}
          title={visible ? "Hide" : "Show"}
          aria-label={visible ? "Hide password" : "Show password"}
        >
          {visible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
      {showStrength && value.length > 0 && (
        <div className="pw-strength">
          <div className={"pw-meter s" + score}>
            <span /><span /><span /><span />
          </div>
          <span className="muted pw-label">{LABELS[score]}</span>
        </div>
      )}
    </div>
  );
}
