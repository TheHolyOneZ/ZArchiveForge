
import { CircleCheck, CircleX, Info, X, type LucideIcon } from "lucide-react";
import { useToasts, type ToastKind } from "../store/toasts";
import "./ToastHost.css";

const ICON: Record<ToastKind, LucideIcon> = {
  success: CircleCheck,
  error: CircleX,
  info: Info,
};

export function ToastHost() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-host" role="status" aria-live="polite">
      {toasts.map((t) => {
        const Icon = ICON[t.kind];
        return (
          <div key={t.id} className={"toast t-" + t.kind}>
            <Icon size={16} className="toast-icon" />
            <span className="toast-msg">{t.message}</span>
            <button
              className="toast-close"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
