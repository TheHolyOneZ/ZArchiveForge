
import { useEffect, useMemo, useState } from "react";
import { CHARSET_PRESETS } from "../lib/types";
import "./CharsetPicker.css";

interface Props {

  onChange: (charset: string) => void;
}

function dedupe(s: string): string {
  return Array.from(new Set(Array.from(s))).join("");
}

export function CharsetPicker({ onChange }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set(["lower", "digits"]));
  const [custom, setCustom] = useState("");

  const charset = useMemo(() => {
    let s = "";
    for (const p of CHARSET_PRESETS) {
      if (selected.has(p.id)) s += p.chars;
    }
    s += custom;
    return dedupe(s);
  }, [selected, custom]);

  useEffect(() => {
    onChange(charset);
  }, [charset, onChange]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="charset">
      <div className="charset-chips">
        {CHARSET_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={"charset-chip" + (selected.has(p.id) ? " active" : "")}
            onClick={() => toggle(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>
      <input
        className="input charset-custom selectable"
        value={custom}
        spellCheck={false}
        placeholder="Custom characters (optional)"
        onChange={(e) => setCustom(e.currentTarget.value)}
      />
      <div className="charset-info muted">
        <span className="charset-size">{charset.length} chars</span>
        <span>keyspace = {charset.length}<sup>length</sup> — grows very fast</span>
      </div>
    </div>
  );
}
