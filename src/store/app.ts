
import { create } from "zustand";

export type ViewId = "creator" | "extract" | "cracker" | "jobs" | "settings";

export type Theme = "dark" | "light";

interface AppState {
  view: ViewId;
  theme: Theme;
  setView: (view: ViewId) => void;
  toggleTheme: () => void;
}

const THEME_KEY = "zaf.theme";

function initialTheme(): Theme {
  const stored = localStorage.getItem(THEME_KEY);
  return stored === "light" ? "light" : "dark";
}

export const useAppStore = create<AppState>((set, get) => ({
  view: "creator",
  theme: initialTheme(),
  setView: (view) => set({ view }),
  toggleTheme: () => {
    const theme = get().theme === "dark" ? "light" : "dark";
    localStorage.setItem(THEME_KEY, theme);
    document.documentElement.setAttribute("data-theme", theme);
    set({ theme });
  },
}));
