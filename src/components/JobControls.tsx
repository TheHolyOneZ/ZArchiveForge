
import { Ban, Pause, Play, Trash2 } from "lucide-react";
import { useJobsStore, type JobState } from "../store/jobs";
import "./JobControls.css";

const TERMINAL = new Set(["found", "exhausted", "error", "cancelled"]);

export function JobControls({ job }: { job: JobState }) {
  const pause = useJobsStore((s) => s.pause);
  const resume = useJobsStore((s) => s.resume);
  const cancel = useJobsStore((s) => s.cancel);
  const remove = useJobsStore((s) => s.remove);

  const isRunning = job.status === "running";
  const isPaused = job.status === "paused";
  const isTerminal = TERMINAL.has(job.status);

  return (
    <div className="jobctl">
      {isRunning && (
        <button className="btn" onClick={() => pause(job.id)}>
          <Pause size={15} /> Pause
        </button>
      )}
      {isPaused && (
        <button className="btn btn-primary" onClick={() => resume(job.id)}>
          <Play size={15} /> Resume
        </button>
      )}
      {(isRunning || isPaused) && (
        <button className="btn jobctl-cancel" onClick={() => cancel(job.id)}>
          <Ban size={15} /> Cancel
        </button>
      )}
      {isTerminal && (
        <button className="btn btn-ghost" onClick={() => remove(job.id)}>
          <Trash2 size={14} /> Dismiss
        </button>
      )}
    </div>
  );
}
