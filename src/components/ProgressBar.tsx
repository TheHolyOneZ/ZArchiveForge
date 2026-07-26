
import "./ProgressBar.css";

interface Props {
  percent: number | null;
  tone?: "accent" | "success" | "danger";
}


export function ProgressBar({ percent, tone = "accent" }: Props) {
  if (percent === null) {
    return (
      <div className="pbar indeterminate">
        <div className="pbar-stripe" />
      </div>
    );
  }
  const pct = Math.max(0, Math.min(100, percent));
  return (
    <div className="pbar">
      <div className={"pbar-fill tone-" + tone} style={{ width: `${pct}%` }} />
    </div>
  );
}
