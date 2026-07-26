
import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, Copy, X, Plus } from "lucide-react";
import { detectOS } from "../lib/platform";
import logoUrl from "../assets/logo.png";
import "./Titlebar.css";

const appWindow = getCurrentWindow();
const os = detectOS();


function WinControls({ maximized }: { maximized: boolean }) {
  return (
    <div className="tb-controls win">
      <button className="tb-btn" onClick={() => appWindow.minimize()} aria-label="Minimize" title="Minimize">
        <Minus size={16} />
      </button>
      <button
        className="tb-btn"
        onClick={() => appWindow.toggleMaximize()}
        aria-label={maximized ? "Restore" : "Maximize"}
        title={maximized ? "Restore" : "Maximize"}
      >
        {maximized ? <Copy size={13} /> : <Square size={13} />}
      </button>
      <button className="tb-btn close" onClick={() => appWindow.close()} aria-label="Close" title="Close">
        <X size={16} />
      </button>
    </div>
  );
}


function MacControls() {
  return (
    <div className="tb-controls mac">
      <button className="tb-light close" onClick={() => appWindow.close()} aria-label="Close" title="Close">
        <X size={9} strokeWidth={2.5} />
      </button>
      <button className="tb-light min" onClick={() => appWindow.minimize()} aria-label="Minimize" title="Minimize">
        <Minus size={9} strokeWidth={2.5} />
      </button>
      <button className="tb-light max" onClick={() => appWindow.toggleMaximize()} aria-label="Zoom" title="Zoom">
        <Plus size={9} strokeWidth={2.5} />
      </button>
    </div>
  );
}

export function Titlebar() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    appWindow.isMaximized().then(setMaximized).catch(() => {});
    appWindow
      .onResized(() => {
        appWindow.isMaximized().then(setMaximized).catch(() => {});
      })
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  const maximizeOnDoubleClick = () => appWindow.toggleMaximize();

  const brand = (
    <div className="tb-brand" data-tauri-drag-region onDoubleClick={maximizeOnDoubleClick}>
      <img src={logoUrl} className="tb-brand-mark" alt="" draggable={false} />
      <span className="tb-brand-name">ZArchiveForge</span>
    </div>
  );

  const spacer = (
    <div className="tb-spacer" data-tauri-drag-region onDoubleClick={maximizeOnDoubleClick} />
  );

  return (
    <div className={"titlebar os-" + os}>
      {os === "mac" ? (
        <>
          <MacControls />
          {brand}
          {spacer}
        </>
      ) : (
        <>
          {brand}
          {spacer}
          <WinControls maximized={maximized} />
        </>
      )}
    </div>
  );
}
