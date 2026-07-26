
import { useEffect, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open } from "@tauri-apps/plugin-dialog";
import { FilePlus2, FolderPlus, UploadCloud } from "lucide-react";
import "./DropZone.css";

interface Props {
  onAdd: (paths: string[]) => void;
}


export function DropZone({ onAdd }: Props) {
  const [hover, setHover] = useState(false);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;

    getCurrentWebview()
      .onDragDropEvent((event) => {
        const p = event.payload;
        if (p.type === "over" || p.type === "enter") {
          setHover(true);
        } else if (p.type === "drop") {
          setHover(false);
          if (p.paths && p.paths.length) onAdd(p.paths);
        } else {
          setHover(false);
        }
      })
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [onAdd]);

  async function browseFiles() {
    const sel = await open({ multiple: true, directory: false });
    if (Array.isArray(sel)) onAdd(sel);
    else if (typeof sel === "string") onAdd([sel]);
  }

  async function browseFolder() {
    const sel = await open({ multiple: false, directory: true });
    if (typeof sel === "string") onAdd([sel]);
  }

  return (
    <div className={"dropzone" + (hover ? " hover" : "")}>
      <UploadCloud className="dropzone-icon" size={32} strokeWidth={1.6} />
      <div className="dropzone-text">
        <strong>Drag files or folders here</strong>
        <span className="muted">or browse to add them</span>
      </div>
      <div className="dropzone-actions">
        <button className="btn" onClick={browseFiles}>
          <FilePlus2 size={16} /> Add files…
        </button>
        <button className="btn" onClick={browseFolder}>
          <FolderPlus size={16} /> Add folder…
        </button>
      </div>
    </div>
  );
}
