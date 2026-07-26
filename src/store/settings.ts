

import { create } from "zustand";
import type { ArchiveFormat, CompressionLevel } from "../lib/types";

export interface Settings {

  defaultFormat: ArchiveFormat;

  defaultLevel: CompressionLevel;

  threadsAuto: boolean;

  threads: number;

  extractDir: string;

  rarPath: string;
}

const DEFAULTS: Settings = {
  defaultFormat: "zip",
  defaultLevel: "normal",
  threadsAuto: true,
  threads: 4,
  extractDir: "",
  rarPath: "",
};

const KEY = "zaf.settings";

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return DEFAULTS;
  }
}

interface SettingsStore extends Settings {
  set: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  reset: () => void;
}

function persist(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {

  }
}

export const useSettings = create<SettingsStore>((set, get) => ({
  ...load(),
  set(key, value) {
    set({ [key]: value } as Pick<Settings, typeof key>);
    const { set: _s, reset: _r, ...rest } = get();
    persist({ ...rest, [key]: value });
  },
  reset() {
    set({ ...DEFAULTS });
    persist(DEFAULTS);
  },
}));

export { DEFAULTS as DEFAULT_SETTINGS };
