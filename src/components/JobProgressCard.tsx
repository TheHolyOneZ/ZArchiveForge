
import { useState } from "react";
import {
  Ban,
  Check,
  ChevronDown,
  CircleCheck,
  CircleX,
  Copy,
  Loader2,
  Pause,
  SearchX,
  Unlock,
  type LucideIcon,
} from "lucide-react";
import { basename } from "../lib/paths";
import type { CrackAttack, CrackConfig } from "../lib/types";
import type { JobState, JobStatus } from "../store/jobs";
import { MetricsBar } from "./MetricsBar";
import { ProgressBar } from "./ProgressBar";
import { JobControls } from "./JobControls";
import "./JobProgressCard.css";

function attackSummary(a: CrackAttack | undefined): string {
  if (!a) return "—";
  switch (a.kind) {
    case "dictionary":
      return `Dictionary · ${basename(a.wordlist)}`;
    case "mask":
      return `Mask · ${a.pattern}`;
    case "bruteforce":
      return `Brute-force · ${a.charset.length} chars · len ${a.minLen}–${a.maxLen}`;
  }
}


function configRows(config: CrackConfig | null): { label: string; value: string; mono?: boolean }[] {
  if (!config) return [];
  const rows: { label: string; value: string; mono?: boolean }[] = [
    { label: "Archive", value: basename(config.archive), mono: true },
    { label: "Threads", value: config.threads == null ? "Auto" : String(config.threads) },
  ];
  const a = config.attack;
  if (a.kind === "dictionary") {
    rows.push({ label: "Attack", value: "Dictionary" });
    rows.push({ label: "Wordlist", value: basename(a.wordlist), mono: true });
  } else if (a.kind === "mask") {
    rows.push({ label: "Attack", value: "Mask" });
    rows.push({ label: "Pattern", value: a.pattern, mono: true });
  } else {
    rows.push({ label: "Attack", value: "Brute-force" });
    rows.push({ label: "Charset", value: a.charset, mono: true });
    rows.push({ label: "Length", value: `${a.minLen}–${a.maxLen}` });
  }
  return rows;
}

const STATUS_LABEL: Record<JobStatus, string> = {
  running: "Running",
  paused: "Paused",
  found: "Found",
  exhausted: "Exhausted",
  error: "Error",
  cancelled: "Cancelled",
};

const STATUS_ICON: Record<JobStatus, LucideIcon> = {
  running: Loader2,
  paused: Pause,
  found: CircleCheck,
  exhausted: SearchX,
  error: CircleX,
  cancelled: Ban,
};

export function JobProgressCard({ job }: { job: JobState }) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const archive = job.config?.archive;
  const tone =
    job.status === "found" ? "success" : job.status === "error" ? "danger" : "accent";
  const StatusIcon = STATUS_ICON[job.status];

  async function copyPassword() {
    if (!job.password) return;
    try {
      await navigator.clipboard.writeText(job.password);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {

    }
  }

  return (
    <div className="card jobcard">
      <button
        className="jobcard-head"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        title={expanded ? "Hide details" : "Show details"}
      >
        <ChevronDown size={16} className={"jobcard-chevron" + (expanded ? " open" : "")} />
        <div className="jobcard-title">
          <span className="jobcard-attack">{attackSummary(job.config?.attack)}</span>
          {archive && <span className="jobcard-archive muted">{basename(archive)}</span>}
        </div>
        <span className={"status-pill s-" + job.status}>
          <StatusIcon size={13} className={job.status === "running" ? "spin" : undefined} />
          {STATUS_LABEL[job.status]}
        </span>
      </button>

      <ProgressBar percent={job.percent} tone={tone} />

      <MetricsBar
        perSec={job.perSec}
        tried={job.tried}
        elapsedMs={job.elapsedMs}
        etaMs={job.etaMs}
        total={job.total}
      />

      {job.status === "found" && job.password !== undefined && (
        <div className="found-row">
          <span className="found-label"><Unlock size={15} /> Password recovered</span>
          <code className="found-pw selectable">{job.password || "(empty password)"}</code>
          <button className="btn found-copy" onClick={copyPassword}>
            {copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy</>}
          </button>
        </div>
      )}
      {job.status === "error" && (
        <div className="job-msg err"><CircleX size={15} /> {job.error}</div>
      )}
      {job.status === "exhausted" && (
        <div className="job-msg muted">No match found in the search space.</div>
      )}
      {job.status === "cancelled" && <div className="job-msg muted">Cancelled.</div>}

      {expanded && (
        <div className="jobcard-details">
          <dl className="detail-grid">
            {configRows(job.config).map((r) => (
              <div className="detail-row" key={r.label}>
                <dt>{r.label}</dt>
                <dd className={r.mono ? "mono selectable" : undefined} title={r.value}>{r.value}</dd>
              </div>
            ))}
            <div className="detail-row">
              <dt>Tried</dt>
              <dd className="mono">{job.tried.toLocaleString("en-US")}</dd>
            </div>
            <div className="detail-row">
              <dt>At now</dt>
              <dd className="mono selectable">{job.current ? (job.current || "∅") : "—"}</dd>
            </div>
          </dl>

          {job.recent.length > 0 && (
            <div className="recent">
              <div className="recent-head">Recently tried (newest first)</div>
              <div className="recent-list selectable">
                {job.recent.slice().reverse().map((c, i) => (
                  <code key={i} className="recent-chip">{c === "" ? "∅" : c}</code>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="jobcard-foot">
        <JobControls job={job} />
      </div>
    </div>
  );
}
