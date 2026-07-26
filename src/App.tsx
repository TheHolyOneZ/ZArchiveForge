
import { Titlebar } from "./components/Titlebar";
import { AppShell } from "./components/AppShell";
import { ToastHost } from "./components/ToastHost";
import { useAppStore } from "./store/app";
import { CreatorView } from "./views/CreatorView";
import { ExtractView } from "./views/ExtractView";
import { CrackerView } from "./views/CrackerView";
import { JobsView } from "./views/JobsView";
import { SettingsView } from "./views/SettingsView";

function CurrentView() {
  const view = useAppStore((s) => s.view);
  switch (view) {
    case "creator":
      return <CreatorView />;
    case "extract":
      return <ExtractView />;
    case "cracker":
      return <CrackerView />;
    case "jobs":
      return <JobsView />;
    case "settings":
      return <SettingsView />;
  }
}

export default function App() {
  return (
    <>
      <Titlebar />
      <AppShell>
        <CurrentView />
      </AppShell>
      <ToastHost />
    </>
  );
}
