
import { useEffect, useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  Asterisk,
  Ban,
  Binary,
  BookText,
  Eye,
  FileSearch,
  Info,
  Loader2,
  Lock,
  TriangleAlert,
  X,
  type LucideIcon,
} from "lucide-react";
import { MaskBuilder } from "../components/MaskBuilder";
import { CharsetPicker } from "../components/CharsetPicker";
import { inspectArchive, previewAttack } from "../lib/ipc";
import { basename, formatBytes } from "../lib/paths";
import {
  FORMAT_LABEL,
  type ArchiveInfo,
  type AttackPreview,
  type CrackAttack,
  type CrackConfig,
} from "../lib/types";
import { useJobsStore } from "../store/jobs";
import { useAppStore } from "../store/app";
import { useSettings } from "../store/settings";
import "./CrackerView.css";

type Tab = "dictionary" | "mask" | "bruteforce";

const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: "dictionary", label: "Dictionary", icon: BookText },
  { id: "mask", label: "Mask", icon: Asterisk },
  { id: "bruteforce", label: "Brute-force", icon: Binary },
];

function isSlowScheme(info: ArchiveInfo | null): boolean {
  if (!info) return false;
  if (info.format === "sevenz") return true;
  return (info.scheme ?? "").toLowerCase().includes("aes");
}

export function CrackerView() {
  const [archive, setArchive] = useState<string | null>(null);
  const [info, setInfo] = useState<ArchiveInfo | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const [inspectError, setInspectError] = useState<string | null>(null);

  const [tab, setTab] = useState<Tab>("dictionary");
  const [wordlist, setWordlist] = useState<string | null>(null);
  const [maskPattern, setMaskPattern] = useState("");
  const [charset, setCharset] = useState("");
  const [minLen, setMinLen] = useState(1);
  const [maxLen, setMaxLen] = useState(4);

  const [threadsAuto, setThreadsAuto] = useState(useSettings.getState().threadsAuto);
  const [threads, setThreads] = useState(useSettings.getState().threads);
  const [startError, setStartError] = useState<string | null>(null);

  const start = useJobsStore((s) => s.start);
  const setView = useAppStore((s) => s.setView);

  async function pickArchive() {
    const sel = await open({ multiple: false, directory: false });
    if (typeof sel !== "string") return;
    setArchive(sel);
    setInfo(null);
    setInspectError(null);
    setInspecting(true);
    try {
      setInfo(await inspectArchive(sel));
    } catch (e) {
      setInspectError(String(e));
    } finally {
      setInspecting(false);
    }
  }

  async function pickWordlist() {
    const sel = await open({ multiple: false, directory: false });
    if (typeof sel === "string") setWordlist(sel);
  }

  const attack: CrackAttack | null = useMemo(() => {
    if (tab === "dictionary") return wordlist ? { kind: "dictionary", wordlist } : null;
    if (tab === "mask") return maskPattern.trim() ? { kind: "mask", pattern: maskPattern } : null;
    if (charset.length > 0 && minLen >= 1 && minLen <= maxLen)
      return { kind: "bruteforce", charset, minLen, maxLen };
    return null;
  }, [tab, wordlist, maskPattern, charset, minLen, maxLen]);


  const [preview, setPreview] = useState<AttackPreview | null>(null);
  const [previewErr, setPreviewErr] = useState<string | null>(null);

  useEffect(() => {
    if (!attack) {
      setPreview(null);
      setPreviewErr(null);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      previewAttack(attack)
        .then((p) => {
          if (!cancelled) {
            setPreview(p);
            setPreviewErr(null);
          }
        })
        .catch((e) => {
          if (!cancelled) {
            setPreview(null);
            setPreviewErr(String(e));
          }
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [attack]);

  const canStart = Boolean(archive && info?.crackable && info?.encrypted && attack);

  async function onStart() {
    if (!archive || !attack) return;
    setStartError(null);
    const cfg: CrackConfig = {
      archive,
      entry: null,
      attack,
      threads: threadsAuto ? null : threads,
    };
    try {
      await start(cfg);
      setView("jobs");
    } catch (e) {
      setStartError(String(e));
    }
  }

  return (
    <div className="cracker">
      <div className="view-header">
        <h1>Recover Password</h1>
        <p>Test dictionary and brute-force candidates against an encrypted archive.</p>
      </div>


      <div className="card">
        <div className="archive-pick">
          <button className="btn" onClick={pickArchive}>
            <FileSearch size={16} /> Choose archive…
          </button>
          {archive && <span className="archive-name selectable" title={archive}>{basename(archive)}</span>}
          {inspecting && (
            <span className="muted inspecting">
              <Loader2 size={14} className="spin" /> Inspecting…
            </span>
          )}
        </div>

        {inspectError && (
          <div className="banner err"><X size={16} /> {inspectError}</div>
        )}

        {info && (
          <div className="inspect">
            <div className="inspect-summary">
              <span className="badge">{FORMAT_LABEL[info.format]}</span>
              {info.scheme && <span className="badge">{info.scheme}</span>}
              <span className="muted">{info.entries.length} entr{info.entries.length === 1 ? "y" : "ies"}</span>
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

            {!info.crackable && (
              <div className="banner warn">
                <Ban size={16} />
                RAR password recovery isn’t supported — only ZIP and 7z can be cracked.
              </div>
            )}
            {info.crackable && !info.encrypted && (
              <div className="banner">
                <Info size={16} />
                This archive isn’t encrypted — nothing to recover.
              </div>
            )}
            {info.crackable && info.encrypted && isSlowScheme(info) && (
              <div className="banner warn">
                <TriangleAlert size={16} />
                AES-256 / 7z use slow key derivation by design — brute-force is only realistic for
                short or dictionary-known passwords.
              </div>
            )}
          </div>
        )}
      </div>


      <div className="card">
        <div className="seg attack-tabs">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                className={"seg-btn" + (tab === t.id ? " active" : "")}
                onClick={() => setTab(t.id)}
              >
                <Icon size={15} /> {t.label}
              </button>
            );
          })}
        </div>

        <div className="attack-body">
          {tab === "dictionary" && (
            <div className="field">
              <label>Wordlist</label>
              <div className="wordlist-pick">
                <button className="btn" onClick={pickWordlist}>Choose wordlist…</button>
                {wordlist && <span className="selectable" title={wordlist}>{basename(wordlist)}</span>}
              </div>
              <span className="hint muted">A UTF-8 text file with one candidate password per line.</span>
            </div>
          )}

          {tab === "mask" && (
            <div className="field">
              <label>Mask pattern</label>
              <MaskBuilder value={maskPattern} onChange={setMaskPattern} />
            </div>
          )}

          {tab === "bruteforce" && (
            <>
              <div className="field">
                <label>Character set</label>
                <CharsetPicker onChange={setCharset} />
              </div>
              <div className="len-row">
                <div className="field">
                  <label>Min length</label>
                  <input
                    className="input len-input"
                    type="number"
                    min={1}
                    max={12}
                    value={minLen}
                    onChange={(e) => setMinLen(Math.max(1, Math.min(12, Number(e.currentTarget.value) || 1)))}
                  />
                </div>
                <div className="field">
                  <label>Max length</label>
                  <input
                    className="input len-input"
                    type="number"
                    min={1}
                    max={12}
                    value={maxLen}
                    onChange={(e) => setMaxLen(Math.max(1, Math.min(12, Number(e.currentTarget.value) || 1)))}
                  />
                </div>
              </div>
              {minLen > maxLen && <span className="hint err">Min length must not exceed max length.</span>}
            </>
          )}
        </div>

        {(preview || previewErr) && (
          <div className="preview">
            <div className="preview-head">
              <span className="preview-title"><Eye size={14} /> What will be tried</span>
              {preview && (
                <span className="preview-total muted">
                  {preview.total != null
                    ? `${preview.total.toLocaleString("en-US")} candidate${preview.total === 1 ? "" : "s"}`
                    : "enormous keyspace"}
                </span>
              )}
            </div>
            {previewErr ? (
              <span className="hint err">{previewErr}</span>
            ) : (
              <div className="preview-samples selectable">
                {preview!.samples.map((s, i) => (
                  <code key={i} className="preview-chip">{s === "" ? "∅" : s}</code>
                ))}
                {preview!.truncated && <span className="preview-more muted">… and more</span>}
              </div>
            )}
          </div>
        )}
      </div>


      <div className="card start-card">
        <div className="field threads-field">
          <label>Worker threads</label>
          <div className="threads-row">
            <button
              className={"seg-btn thread-auto" + (threadsAuto ? " active" : "")}
              onClick={() => setThreadsAuto(true)}
            >
              Auto
            </button>
            <button
              className={"seg-btn thread-auto" + (!threadsAuto ? " active" : "")}
              onClick={() => setThreadsAuto(false)}
            >
              Manual
            </button>
            {!threadsAuto && (
              <input
                className="input thread-input"
                type="number"
                min={1}
                max={128}
                value={threads}
                onChange={(e) => setThreads(Math.max(1, Math.min(128, Number(e.currentTarget.value) || 1)))}
              />
            )}
          </div>
        </div>

        <div className="start-bar">
          <button className="btn btn-primary start-btn" disabled={!canStart} onClick={onStart}>
            Start Recovery
          </button>
          {startError && (
            <span className="hint err start-err">
              <X size={14} /> {startError}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
