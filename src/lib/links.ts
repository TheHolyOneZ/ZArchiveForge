

import { openUrl } from "@tauri-apps/plugin-opener";

export const LINKS = {

  repo: "https://github.com/TheHolyOneZ/ZArchiveForge",

  website: "https://zsync.eu/zarchiveforge/",

  author: "https://github.com/TheHolyOneZ",

  moreProjects: "https://zsync.eu",
} as const;


export function openExternal(url: string): Promise<void> {
  return openUrl(url).catch(() => {

  });
}
