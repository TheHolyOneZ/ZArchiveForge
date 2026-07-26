
import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  BadgeInfo,
  Check,
  Download,
  ExternalLink,
  FolderInput,
  Globe,
  Loader2,
  Moon,
  RotateCcw,
  Scale,
  Sun,
  Terminal,
  Trash2,
  TriangleAlert,
  User,
  X,
} from "lucide-react";
import { appVersion, clearCheckpoints, deleteCheckpoint, listCheckpoints, rarCliAvailable } from "../lib/ipc";
import { basename } from "../lib/paths";
import { LINKS, openExternal } from "../lib/links";
import type { CheckpointMeta } from "../lib/types";
import { FORMAT_LABEL, type ArchiveFormat, type CompressionLevel } from "../lib/types";
import { useAppStore } from "../store/app";
import { useSettings } from "../store/settings";
import { toast } from "../store/toasts";
import "./SettingsView.css";

const FORMATS: ArchiveFormat[] = ["zip", "sevenz"];
const LEVELS: { id: CompressionLevel; label: string }[] = [
  { id: "store", label: "Store" },
  { id: "fast", label: "Fast" },
  { id: "normal", label: "Normal" },
  { id: "best", label: "Best" },
];

function attackKind(cp: CheckpointMeta): string {
  switch (cp.attack.kind) {
    case "dictionary":
      return `Dictionary · ${basename(cp.attack.wordlist)}`;
    case "mask":
      return `Mask · ${cp.attack.pattern}`;
    case "bruteforce":
      return `Brute-force · len ${cp.attack.minLen}–${cp.attack.maxLen}`;
  }
}

export function SettingsView() {
  const theme = useAppStore((s) => s.theme);
  const toggleTheme = useAppStore((s) => s.toggleTheme);
  const s = useSettings();

  const [version, setVersion] = useState("");
  const [checkpoints, setCheckpoints] = useState<CheckpointMeta[]>([]);
  const [rarProbe, setRarProbe] = useState<"idle" | "checking" | "ok" | "missing">("idle");

  useEffect(() => {
    appVersion().then(setVersion).catch(() => setVersion("?"));
    refreshCheckpoints();
  }, []);

  function refreshCheckpoints() {
    listCheckpoints().then(setCheckpoints).catch(() => setCheckpoints([]));
  }

  async function checkRar() {
    setRarProbe("checking");
    try {
      const ok = await rarCliAvailable(s.rarPath || null);
      setRarProbe(ok ? "ok" : "missing");
    } catch {
      setRarProbe("missing");
    }
  }

  async function pickExtractDir() {
    const sel = await open({ directory: true, multiple: false });
    if (typeof sel === "string") s.set("extractDir", sel);
  }

  async function onDeleteCheckpoint(jobId: string) {
    try {
      await deleteCheckpoint(jobId);
      setCheckpoints((cs) => cs.filter((c) => c.jobId !== jobId));
      toast.info("Checkpoint deleted");
    } catch (e) {
      toast.error(String(e));
    }
  }

  async function onClearCheckpoints() {
    try {
      const n = await clearCheckpoints();
      setCheckpoints([]);
      toast.info(n > 0 ? `Cleared ${n} checkpoint${n === 1 ? "" : "s"}` : "No checkpoints to clear");
    } catch (e) {
      toast.error(String(e));
    }
  }

  return (
    <div className="settings">
      <div className="view-header">
        <h1>Settings</h1>
        <p>Preferences for ZArchiveForge. Everything runs locally — no network access.</p>
      </div>


      <section className="settings-section">
        <h2 className="settings-h2">Appearance</h2>
        <div className="card">
          <div className="set-row">
            <div className="set-label">
              <span className="set-title">Theme</span>
              <span className="set-desc muted">Dark is the default.</span>
            </div>
            <button className="btn" onClick={toggleTheme}>
              {theme === "dark" ? <Moon size={15} /> : <Sun size={15} />}
              {theme === "dark" ? "Dark" : "Light"}
            </button>
          </div>
        </div>
      </section>


      <section className="settings-section">
        <h2 className="settings-h2">Create defaults</h2>
        <div className="card set-stack">
          <div className="set-row">
            <div className="set-label">
              <span className="set-title">Default format</span>
              <span className="set-desc muted">Pre-selected format in the Create view.</span>
            </div>
            <div className="seg">
              {FORMATS.map((f) => (
                <button
                  key={f}
                  className={"seg-btn" + (s.defaultFormat === f ? " active" : "")}
                  onClick={() => s.set("defaultFormat", f)}
                >
                  {FORMAT_LABEL[f]}
                </button>
              ))}
            </div>
          </div>
          <div className="set-row">
            <div className="set-label">
              <span className="set-title">Default compression</span>
              <span className="set-desc muted">Balance of speed vs. archive size.</span>
            </div>
            <div className="seg">
              {LEVELS.map((l) => (
                <button
                  key={l.id}
                  className={"seg-btn" + (s.defaultLevel === l.id ? " active" : "")}
                  onClick={() => s.set("defaultLevel", l.id)}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>


      <section className="settings-section">
        <h2 className="settings-h2">Recovery defaults</h2>
        <div className="card">
          <div className="set-row">
            <div className="set-label">
              <span className="set-title">Worker threads</span>
              <span className="set-desc muted">Auto uses all cores but one.</span>
            </div>
            <div className="threads-row">
              <button
                className={"seg-btn thread-auto" + (s.threadsAuto ? " active" : "")}
                onClick={() => s.set("threadsAuto", true)}
              >
                Auto
              </button>
              <button
                className={"seg-btn thread-auto" + (!s.threadsAuto ? " active" : "")}
                onClick={() => s.set("threadsAuto", false)}
              >
                Manual
              </button>
              {!s.threadsAuto && (
                <input
                  className="input thread-input"
                  type="number"
                  min={1}
                  max={128}
                  value={s.threads}
                  onChange={(e) =>
                    s.set("threads", Math.max(1, Math.min(128, Number(e.currentTarget.value) || 1)))
                  }
                />
              )}
            </div>
          </div>
        </div>
      </section>


      <section className="settings-section">
        <h2 className="settings-h2">Extract defaults</h2>
        <div className="card">
          <div className="set-row">
            <div className="set-label">
              <span className="set-title">Default destination</span>
              <span className="set-desc muted">
                {s.extractDir
                  ? "Archives extract into a subfolder here."
                  : "Not set — extract next to the archive."}
              </span>
            </div>
            <div className="path-row">
              {s.extractDir && (
                <code className="path-chip selectable" title={s.extractDir}>{s.extractDir}</code>
              )}
              <button className="btn" onClick={pickExtractDir}>
                <FolderInput size={15} /> Choose…
              </button>
              {s.extractDir && (
                <button className="icon-btn" title="Clear" onClick={() => s.set("extractDir", "")}>
                  <X size={15} />
                </button>
              )}
            </div>
          </div>
        </div>
      </section>


      <section className="settings-section">
        <h2 className="settings-h2">RAR support</h2>
        <div className="card set-stack">
          <div className="set-row">
            <div className="set-label">
              <span className="set-title">
                <Terminal size={14} /> External <code>rar</code> binary
              </span>
              <span className="set-desc muted">
                RAR creation needs a <code>rar</code> program you install. Leave blank to auto-detect
                (PATH / WinRAR).
              </span>
            </div>
          </div>
          <div className="rar-input-row">
            <input
              className="input selectable rar-input"
              value={s.rarPath}
              spellCheck={false}
              placeholder="e.g. /usr/bin/rar or C:\Program Files\WinRAR\Rar.exe"
              onChange={(e) => {
                s.set("rarPath", e.currentTarget.value);
                setRarProbe("idle");
              }}
            />
            <button className="btn" onClick={checkRar} disabled={rarProbe === "checking"}>
              {rarProbe === "checking" ? <Loader2 size={14} className="spin" /> : null}
              Test
            </button>
          </div>
          {rarProbe === "ok" && (
            <span className="rar-status ok"><Check size={14} /> Found a working <code>rar</code> binary.</span>
          )}
          {rarProbe === "missing" && (
            <span className="rar-status err">
              <TriangleAlert size={14} /> No usable <code>rar</code> binary found.
            </span>
          )}
        </div>
      </section>


      <section className="settings-section">
        <div className="settings-h2-row">
          <h2 className="settings-h2">Saved checkpoints</h2>
          {checkpoints.length > 0 && (
            <button className="btn btn-ghost danger-ghost" onClick={onClearCheckpoints}>
              <Trash2 size={14} /> Clear all
            </button>
          )}
        </div>
        <div className="card">
          {checkpoints.length === 0 ? (
            <span className="muted">No saved checkpoints. Paused recovery jobs appear here.</span>
          ) : (
            <ul className="cp-list">
              {checkpoints.map((cp) => (
                <li key={cp.jobId} className="cp-item">
                  <div className="cp-info">
                    <span className="cp-attack">{attackKind(cp)}</span>
                    <span className="muted cp-sub">
                      {basename(String(cp.archive))} · {cp.tried.toLocaleString("en-US")} tried
                    </span>
                  </div>
                  <button
                    className="icon-btn"
                    title="Delete checkpoint"
                    onClick={() => onDeleteCheckpoint(cp.jobId)}
                  >
                    <Trash2 size={15} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>


      <section className="settings-section">
        <h2 className="settings-h2">About</h2>
        <div className="card set-stack about">
          <div className="about-row"><BadgeInfo size={15} /> <span>ZArchiveForge</span> <code>v{version}</code></div>
          <div className="about-row">
            <User size={15} /> Created by{" "}
            <button className="link-btn" onClick={() => openExternal(LINKS.author)}>TheHolyOneZ</button>
          </div>
          <div className="about-row"><Scale size={15} /> GPL-3.0-or-later · 100% offline</div>
          <div className="about-actions">
            <button className="btn" onClick={() => openExternal(LINKS.repo)}>
              <ExternalLink size={15} /> Project on GitHub
            </button>
            <button className="btn" onClick={() => openExternal(LINKS.website)}>
              <Download size={15} /> Website &amp; downloads
            </button>
            <button className="btn" onClick={() => openExternal(LINKS.moreProjects)}>
              <Globe size={15} /> More projects
            </button>
          </div>
          <div className="about-actions">
            <button className="btn btn-ghost danger-ghost" onClick={() => { s.reset(); toast.info("Settings reset to defaults"); }}>
              <RotateCcw size={14} /> Reset all settings
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
