
import { useCallback, useEffect, useMemo, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { CircleCheck, CircleX, FileArchive, Loader2, Trash2, Wand2, X } from "lucide-react";
import { DropZone } from "../components/DropZone";
import { PasswordField } from "../components/PasswordField";
import { createArchive, rarCliAvailable } from "../lib/ipc";
import {
  FORMAT_EXT,
  FORMAT_LABEL,
  type ArchiveFormat,
  type CompressionLevel,
  type CreateResult,
  type EncScheme,
} from "../lib/types";
import { basename, dirname, formatBytes, joinPath, stripExt } from "../lib/paths";
import { useSettings } from "../store/settings";
import { toast } from "../store/toasts";
import { PasswordGenerator } from "../components/PasswordGenerator";
import "./CreatorView.css";

const FORMATS: ArchiveFormat[] = ["zip", "sevenz", "rar"];
const LEVELS: { id: CompressionLevel; label: string }[] = [
  { id: "store", label: "Store" },
  { id: "fast", label: "Fast" },
  { id: "normal", label: "Normal" },
  { id: "best", label: "Best" },
];

function defaultOutput(inputs: string[], format: ArchiveFormat): string {
  if (!inputs.length) return "";
  const dir = dirname(inputs[0]);
  const name = inputs.length === 1 ? stripExt(basename(inputs[0])) : "archive";
  return joinPath(dir, `${name}.${FORMAT_EXT[format]}`);
}

export function CreatorView() {
  const defaultFormat = useSettings((s) => s.defaultFormat);
  const defaultLevel = useSettings((s) => s.defaultLevel);
  const rarPath = useSettings((s) => s.rarPath);

  const [inputs, setInputs] = useState<string[]>([]);
  const [format, setFormat] = useState<ArchiveFormat>(defaultFormat);
  const [encryption, setEncryption] = useState<EncScheme>("aes256");
  const [level, setLevel] = useState<CompressionLevel>(defaultLevel);
  const [password, setPassword] = useState("");
  const [output, setOutput] = useState("");
  const [outputTouched, setOutputTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CreateResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rarOk, setRarOk] = useState(false);
  const [showGenerator, setShowGenerator] = useState(false);

  useEffect(() => {
    rarCliAvailable(rarPath || null).then(setRarOk).catch(() => setRarOk(false));
  }, [rarPath]);


  useEffect(() => {
    if (!outputTouched) setOutput(defaultOutput(inputs, format));
  }, [inputs, format, outputTouched]);

  const addInputs = useCallback((paths: string[]) => {
    setResult(null);
    setError(null);
    setInputs((prev) => {
      const set = new Set(prev);
      for (const p of paths) set.add(p);
      return Array.from(set);
    });
  }, []);

  function removeInput(p: string) {
    setInputs((prev) => prev.filter((x) => x !== p));
  }

  const encryptable = encryption === "aes256";
  const passwordLabel = format === "rar" ? "Password (RAR uses AES-256)" : "Password";

  const canCreate = useMemo(() => {
    if (!inputs.length || !output || busy) return false;
    if (encryptable && !password) return false;
    if (format === "rar" && !rarOk) return false;
    return true;
  }, [inputs, output, busy, encryptable, password, format, rarOk]);

  async function chooseOutput() {
    const sel = await save({
      defaultPath: output || undefined,
      filters: [{ name: FORMAT_LABEL[format], extensions: [FORMAT_EXT[format]] }],
    });
    if (sel) {
      setOutput(sel);
      setOutputTouched(true);
    }
  }

  async function onCreate() {
    setBusy(true);
    setResult(null);
    setError(null);
    try {
      const res = await createArchive({
        inputs,
        output,
        format,
        encryption,
        level,
        password: encryptable ? password : null,
        rarPath: format === "rar" ? rarPath || null : null,
      });
      setResult(res);
      toast.success(`Created ${basename(res.output)} · ${res.files} file${res.files === 1 ? "" : "s"}`);
    } catch (e) {
      setError(String(e));
      toast.error(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="creator">
      <div className="view-header">
        <h1>Create &amp; Encrypt</h1>
        <p>Compress files or folders into a password-protected archive.</p>
      </div>

      <DropZone onAdd={addInputs} />

      {inputs.length > 0 && (
        <div className="card filelist-card">
          <div className="filelist-head">
            <span className="badge">{inputs.length} item{inputs.length > 1 ? "s" : ""}</span>
            <button className="btn btn-ghost" onClick={() => setInputs([])}>
              <Trash2 size={14} /> Clear all
            </button>
          </div>
          <ul className="filelist selectable">
            {inputs.map((p) => (
              <li key={p} className="filelist-item">
                <span className="fi-name" title={p}>{basename(p)}</span>
                <span className="fi-path muted" title={p}>{dirname(p)}</span>
                <button className="fi-remove" onClick={() => removeInput(p)} title="Remove" aria-label="Remove">
                  <X size={15} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card options-grid">
        <div className="field">
          <label>Format</label>
          <div className="seg">
            {FORMATS.map((f) => {
              const disabled = f === "rar" && !rarOk;
              return (
                <button
                  key={f}
                  className={"seg-btn" + (format === f ? " active" : "")}
                  disabled={disabled}
                  title={disabled ? "Install a `rar` binary to create RAR archives" : undefined}
                  onClick={() => setFormat(f)}
                >
                  {FORMAT_LABEL[f]}
                </button>
              );
            })}
          </div>
          {format === "rar" && (
            <span className="hint muted">Uses your installed external <code>rar</code> binary.</span>
          )}
        </div>

        <div className="field">
          <label>Compression</label>
          <div className="seg">
            {LEVELS.map((l) => (
              <button
                key={l.id}
                className={"seg-btn" + (level === l.id ? " active" : "")}
                onClick={() => setLevel(l.id)}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label>Encryption</label>
          <div className="seg">
            <button
              className={"seg-btn" + (encryption === "none" ? " active" : "")}
              onClick={() => setEncryption("none")}
            >
              None
            </button>
            <button
              className={"seg-btn" + (encryption === "aes256" ? " active" : "")}
              onClick={() => setEncryption("aes256")}
            >
              AES-256
            </button>
          </div>
        </div>

        {encryptable && (
          <div className="field pw-field">
            <div className="pw-label-row">
              <label>{passwordLabel}</label>
              <button
                type="button"
                className="btn btn-ghost gen-toggle"
                onClick={() => setShowGenerator((v) => !v)}
              >
                <Wand2 size={13} /> {showGenerator ? "Hide generator" : "Generate"}
              </button>
            </div>
            <PasswordField value={password} onChange={setPassword} placeholder="Enter a strong password" />
            {showGenerator && (
              <PasswordGenerator
                onUse={(pw) => {
                  setPassword(pw);
                  setShowGenerator(false);
                }}
              />
            )}
          </div>
        )}
      </div>

      <div className="card output-row">
        <div className="field output-field">
          <label>Output archive</label>
          <input
            className="input selectable"
            value={output}
            spellCheck={false}
            onChange={(e) => {
              setOutput(e.currentTarget.value);
              setOutputTouched(true);
            }}
            placeholder="Add files to choose a destination…"
          />
        </div>
        <button className="btn" onClick={chooseOutput} disabled={!inputs.length}>Change…</button>
      </div>

      <div className="create-bar">
        <button className="btn btn-primary create-btn" disabled={!canCreate} onClick={onCreate}>
          {busy ? <Loader2 size={16} className="spin" /> : <FileArchive size={16} />}
          {busy ? "Creating…" : "Create Archive"}
        </button>
        {result && (
          <span className="result ok">
            <CircleCheck size={15} /> Created {basename(result.output)} — {result.files} file{result.files > 1 ? "s" : ""}, {formatBytes(result.bytes)}
          </span>
        )}
        {error && (
          <span className="result err">
            <CircleX size={15} /> {error}
          </span>
        )}
      </div>
    </div>
  );
}
