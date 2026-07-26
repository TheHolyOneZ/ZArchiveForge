
import { useCallback, useEffect, useState } from "react";
import { Check, Copy, RefreshCw, Wand2 } from "lucide-react";
import { DEFAULT_GEN, generatePassword, type GenOptions } from "../lib/password";
import { toast } from "../store/toasts";
import "./PasswordGenerator.css";

interface Props {

  onUse: (pw: string) => void;
}

const CLASSES: { key: keyof GenOptions; label: string }[] = [
  { key: "lower", label: "a-z" },
  { key: "upper", label: "A-Z" },
  { key: "digits", label: "0-9" },
  { key: "symbols", label: "!@#" },
];

export function PasswordGenerator({ onUse }: Props) {
  const [opts, setOpts] = useState<GenOptions>(DEFAULT_GEN);
  const [value, setValue] = useState("");
  const [copied, setCopied] = useState(false);

  const regen = useCallback((o: GenOptions) => setValue(generatePassword(o)), []);


  useEffect(() => {
    regen(opts);
  }, [opts, regen]);

  const noClass = !opts.lower && !opts.upper && !opts.digits && !opts.symbols;

  function toggleClass(key: keyof GenOptions) {
    setOpts((o) => {
      const next = { ...o, [key]: !o[key] };

      if (!next.lower && !next.upper && !next.digits && !next.symbols) return o;
      return next;
    });
  }

  async function copy() {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {

    }
  }

  return (
    <div className="pwgen">
      <div className="pwgen-top">
        <code className="pwgen-value selectable">{value || "—"}</code>
        <button className="icon-btn" title="Regenerate" onClick={() => regen(opts)}>
          <RefreshCw size={15} />
        </button>
        <button className="icon-btn" title="Copy" onClick={copy}>
          {copied ? <Check size={15} /> : <Copy size={15} />}
        </button>
      </div>

      <div className="pwgen-controls">
        <label className="pwgen-len">
          <span className="muted">Length {opts.length}</span>
          <input
            type="range"
            min={6}
            max={64}
            value={opts.length}
            onChange={(e) => setOpts((o) => ({ ...o, length: Number(e.currentTarget.value) }))}
          />
        </label>
        <div className="pwgen-classes">
          {CLASSES.map((c) => (
            <button
              key={c.key}
              className={"seg-btn pwgen-class" + (opts[c.key] ? " active" : "")}
              onClick={() => toggleClass(c.key)}
              type="button"
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {noClass && <span className="hint err">Select at least one character type.</span>}

      <button
        className="btn btn-primary pwgen-use"
        type="button"
        disabled={!value}
        onClick={() => {
          onUse(value);
          toast.info("Generated password applied");
        }}
      >
        <Wand2 size={15} /> Use this password
      </button>
    </div>
  );
}
