
import { useEffect, useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import {
  Ban,
  FileSearch,
  FolderInput,
  FolderOpen,
  Loader2,
  Lock,
  PackageOpen,
  X,
} from "lucide-react";
import { PasswordField } from "../components/PasswordField";
import { extractArchive, inspectArchive } from "../lib/ipc";
import { basename, dirname, formatBytes, joinPath, stripExt } from "../lib/paths";
import { FORMAT_LABEL, type ArchiveInfo, type ExtractResult } from "../lib/types";
import { useSettings } from "../store/settings";
import { toast } from "../store/toasts";
import "./ExtractView.css";

export function ExtractView() {
  const settingsExtractDir = useSettings((s) => s.extractDir);

  const [archive, setArchive] = useState<string | null>(null);
  const [info, setInfo] = useState<ArchiveInfo | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const [inspectError, setInspectError] = useState<string | null>(null);

  const [dest, setDest] = useState("");
  const [destTouched, setDestTouched] = useState(false);
  const [password, setPassword] = useState("");

  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ExtractResult | null>(null);
  const [error, setError] = useState<string | null>(null);


  useEffect(() => {
    if (destTouched || !archive) return;
    if (settingsExtractDir) {
      setDest(joinPath(settingsExtractDir, stripExt(basename(archive))));
    } else {
      setDest(joinPath(dirname(archive), stripExt(basename(archive))));
    }
  }, [archive, destTouched, settingsExtractDir]);

  async function pickArchive() {
    const sel = await open({ multiple: false, directory: false });
    if (typeof sel !== "string") return;
    setArchive(sel);
    setInfo(null);
    setInspectError(null);
    setResult(null);
    setError(null);
    setDestTouched(false);
    setInspecting(true);
    try {
      setInfo(await inspectArchive(sel));
    } catch (e) {
      setInspectError(String(e));
    } finally {
      setInspecting(false);
    }
  }

  async function chooseDest() {
    const sel = await open({ directory: true, multiple: false });
    if (typeof sel === "string") {
      setDest(sel);
      setDestTouched(true);
    }
  }

  const supported = info ? info.format !== "rar" : true;
  const needsPassword = Boolean(info?.encrypted);

  const canExtract = useMemo(() => {
    if (!archive || !dest || busy || inspecting) return false;
    if (info && !supported) return false;
    if (needsPassword && !password) return false;
    return true;
  }, [archive, dest, busy, inspecting, info, supported, needsPassword, password]);

  async function onExtract() {
    if (!archive) return;
    setBusy(true);
    setResult(null);
    setError(null);
    try {
      const res = await extractArchive({
        archive,
        dest,
        password: needsPassword ? password : null,
      });
      setResult(res);
      toast.success(
        `Extracted ${res.files} file${res.files === 1 ? "" : "s"} to ${basename(res.dest)}`,
      );
    } catch (e) {
      setError(String(e));
      toast.error(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="extract">
      <div className="view-header">
        <h1>Extract</h1>
        <p>Unpack a ZIP or 7z archive — decrypting it with a password if needed.</p>
      </div>

      <div className="card">
        <div className="archive-pick">
          <button className="btn" onClick={pickArchive}>
            <FileSearch size={16} /> Choose archive…
          </button>
          {archive && (
            <span className="archive-name selectable" title={archive}>{basename(archive)}</span>
          )}
          {inspecting && (
            <span className="muted inspecting">
              <Loader2 size={14} className="spin" /> Inspecting…
            </span>
          )}
        </div>

        {inspectError && <div className="banner err"><X size={16} /> {inspectError}</div>}

        {info && (
          <div className="inspect">
            <div className="inspect-summary">
              <span className="badge">{FORMAT_LABEL[info.format]}</span>
              {info.scheme && <span className="badge">{info.scheme}</span>}
              <span className="muted">
                {info.entries.length} entr{info.entries.length === 1 ? "y" : "ies"}
              </span>
              {info.encrypted ? (
                <span className="badge enc"><Lock size={12} /> encrypted</span>
              ) : (
                <span className="badge">not encrypted</span>
              )}
            </div>

            {info.entries.length > 0 && (
              <ul className="entrylist selectable">
                {info.entries.slice(0, 200).map((e) => (
                  <li key={e.name} className="entry">
                    <span className="entry-name" title={e.name}>{e.name}</span>
                    <span className="entry-size muted">{formatBytes(e.size)}</span>
                    {e.encrypted && <Lock className="entry-lock" size={13} />}
                  </li>
                ))}
              </ul>
            )}

            {!supported && (
              <div className="banner warn">
                <Ban size={16} />
                RAR extraction isn’t supported — only ZIP and 7z can be extracted.
              </div>
            )}
          </div>
        )}
      </div>

      {archive && supported && (
        <>
          {needsPassword && (
            <div className="card">
              <div className="field">
                <label>Password</label>
                <PasswordField
                  value={password}
                  onChange={setPassword}
                  placeholder="Password used to encrypt this archive"
                  showStrength={false}
                />
              </div>
            </div>
          )}

          <div className="card output-row">
            <div className="field output-field">
              <label>Extract to</label>
              <input
                className="input selectable"
                value={dest}
                spellCheck={false}
                onChange={(e) => {
                  setDest(e.currentTarget.value);
                  setDestTouched(true);
                }}
                placeholder="Destination folder…"
              />
            </div>
            <button className="btn" onClick={chooseDest}>
              <FolderInput size={15} /> Change…
            </button>
          </div>

          <div className="create-bar">
            <button className="btn btn-primary create-btn" disabled={!canExtract} onClick={onExtract}>
              {busy ? <Loader2 size={16} className="spin" /> : <PackageOpen size={16} />}
              {busy ? "Extracting…" : "Extract"}
            </button>
            {result && (
              <span className="result ok">
                Extracted {result.files} file{result.files === 1 ? "" : "s"} ·{" "}
                {formatBytes(result.bytes)}
                <button
                  className="btn btn-ghost reveal-btn"
                  onClick={() => revealItemInDir(result.dest).catch(() => {})}
                  title="Show destination folder in your file manager"
                >
                  <FolderOpen size={14} /> Show folder
                </button>
              </span>
            )}
            {error && <span className="result err"><X size={15} /> {error}</span>}
          </div>
        </>
      )}
    </div>
  );
}
