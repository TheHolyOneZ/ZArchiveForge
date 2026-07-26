
import { Clock, Gauge, Hash, Timer, type LucideIcon } from "lucide-react";
import "./MetricsBar.css";

interface Props {
  perSec: number;
  tried: number;
  elapsedMs: number;
  etaMs: number | null;
  total: number | null;
}

export function formatCount(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

export function formatPerSec(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M P/s`;
  return `${formatCount(n)} P/s`;
}


export function formatClock(ms: number): string {
  const total = Math.floor(ms / 1000);
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const pad = (v: number) => v.toString().padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}


export function formatDuration(ms: number | null): string {
  if (ms === null || !isFinite(ms)) return "—";
  const s = Math.floor(ms / 1000);
  if (s < 1) return "<1s";
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  if (d < 365) return `${d}d ${h % 24}h`;
  return `${(d / 365).toFixed(1)}y`;
}

export function MetricsBar({ perSec, tried, elapsedMs, etaMs, total }: Props) {
  return (
    <div className="metrics">
      <Stat icon={Gauge} label="Speed" value={formatPerSec(perSec)} />
      <Stat icon={Hash} label="Tried" value={total ? `${formatCount(tried)} / ${formatCount(total)}` : formatCount(tried)} />
      <Stat icon={Clock} label="Elapsed" value={formatClock(elapsedMs)} />
      <Stat icon={Timer} label="ETA" value={formatDuration(etaMs)} />
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="metric">
      <span className="metric-label">
        <Icon size={13} /> {label}
      </span>
      <span className="metric-value">{value}</span>
    </div>
  );
}
