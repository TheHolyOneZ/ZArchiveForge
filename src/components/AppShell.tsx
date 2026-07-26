
import { useEffect, useState } from "react";
import {
  FileArchive,
  PackageOpen,
  KeyRound,
  Activity,
  Settings,
  Moon,
  Sun,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { useAppStore, type ViewId } from "../store/app";
import { appVersion } from "../lib/ipc";
import "./AppShell.css";

interface NavItem {
  id: ViewId;
  label: string;
  icon: LucideIcon;
  hint: string;
}

const NAV: NavItem[] = [
  { id: "creator", label: "Create", icon: FileArchive, hint: "Pack & encrypt archives" },
  { id: "extract", label: "Extract", icon: PackageOpen, hint: "Unpack ZIP & 7z archives" },
  { id: "cracker", label: "Recover", icon: KeyRound, hint: "Crack encrypted archives" },
  { id: "jobs", label: "Jobs", icon: Activity, hint: "Running & saved recovery jobs" },
  { id: "settings", label: "Settings", icon: Settings, hint: "Preferences" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const view = useAppStore((s) => s.view);
  const setView = useAppStore((s) => s.setView);
  const theme = useAppStore((s) => s.theme);
  const toggleTheme = useAppStore((s) => s.toggleTheme);
  const [version, setVersion] = useState("");

  useEffect(() => {
    appVersion().then(setVersion).catch(() => setVersion("?"));
  }, []);

  return (
    <div className="shell">
      <aside className="sidebar">
        <nav className="nav">
          {NAV.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={"nav-item" + (view === item.id ? " active" : "")}
                onClick={() => setView(item.id)}
                title={item.hint}
              >
                <Icon size={18} strokeWidth={2} className="nav-icon" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="sidebar-foot">
          <button className="theme-toggle" onClick={toggleTheme} title="Toggle theme">
            {theme === "dark" ? <Moon size={15} /> : <Sun size={15} />}
            <span>{theme === "dark" ? "Dark" : "Light"}</span>
          </button>
          <div className="offline-tag muted" title="100% offline — no network access">
            <ShieldCheck size={13} />
            <span>v{version} · GPL-3.0 · offline</span>
          </div>
        </div>
      </aside>

      <main className="content">{children}</main>
    </div>
  );
}
