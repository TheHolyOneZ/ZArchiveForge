
import { useEffect } from "react";
import { ArrowRight, Inbox, Play } from "lucide-react";
import { JobProgressCard } from "../components/JobProgressCard";
import { basename } from "../lib/paths";
import type { CrackAttack } from "../lib/types";
import { useJobsStore } from "../store/jobs";
import { useAppStore } from "../store/app";
import "./JobsView.css";

function attackLabel(a: CrackAttack): string {
  switch (a.kind) {
    case "dictionary":
      return `Dictionary · ${basename(a.wordlist)}`;
    case "mask":
      return `Mask · ${a.pattern}`;
    case "bruteforce":
      return `Brute-force · len ${a.minLen}–${a.maxLen}`;
  }
}

export function JobsView() {
  const jobs = useJobsStore((s) => s.jobs);
  const order = useJobsStore((s) => s.order);
  const checkpoints = useJobsStore((s) => s.checkpoints);
  const refreshCheckpoints = useJobsStore((s) => s.refreshCheckpoints);
  const resume = useJobsStore((s) => s.resume);
  const setView = useAppStore((s) => s.setView);

  useEffect(() => {
    refreshCheckpoints();
  }, [refreshCheckpoints]);

  const activeIds = new Set(order);
  const savedOnly = checkpoints.filter((c) => !activeIds.has(c.jobId));

  const isEmpty = order.length === 0 && savedOnly.length === 0;

  return (
    <div className="jobs">
      <div className="view-header">
        <h1>Jobs</h1>
        <p>Active recovery jobs and saved checkpoints you can resume.</p>
      </div>

      {isEmpty && (
        <div className="placeholder">
          <Inbox className="big" size={42} strokeWidth={1.5} />
          <span>No recovery jobs yet.</span>
          <button className="btn" onClick={() => setView("cracker")}>
            Start one in Recover <ArrowRight size={15} />
          </button>
        </div>
      )}

      {order.length > 0 && (
        <div className="jobs-list">
          {order.map((id) => jobs[id]).filter(Boolean).map((job) => (
            <JobProgressCard key={job.id} job={job} />
          ))}
        </div>
      )}

      {savedOnly.length > 0 && (
        <div className="saved-section">
          <h2 className="saved-head">Saved checkpoints</h2>
          <div className="jobs-list">
            {savedOnly.map((cp) => (
              <div key={cp.jobId} className="card saved-card">
                <div className="saved-info">
                  <span className="saved-attack">{attackLabel(cp.attack)}</span>
                  <span className="muted">{basename(cp.archive)} · {cp.tried.toLocaleString("en-US")} tried</span>
                </div>
                <button className="btn btn-primary" onClick={() => resume(cp.jobId)}>
                  <Play size={15} /> Resume
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
