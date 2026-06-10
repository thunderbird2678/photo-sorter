import { useState, useCallback, useEffect } from "react";
import { getWalThemes } from "@/lib/ipc";

export type Theme = "light" | "dark";

const STORAGE_KEY = "photo-sorter-theme";

const WAL_VAR_NAMES = [
  "background",
  "foreground",
  "card",
  "card-foreground",
  "popover",
  "popover-foreground",
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "muted",
  "muted-foreground",
  "accent",
  "accent-foreground",
  "destructive",
  "border",
  "input",
  "ring",
  "sidebar",
  "sidebar-foreground",
  "sidebar-primary",
  "sidebar-primary-foreground",
  "sidebar-accent",
  "sidebar-accent-foreground",
  "sidebar-border",
  "sidebar-ring",
  "chart-1",
  "chart-2",
  "chart-3",
  "chart-4",
  "chart-5",
] as const;

function clearWalCss() {
  const s = document.documentElement.style;
  for (const name of WAL_VAR_NAMES) {
    s.removeProperty(`--${name}`);
  }
}

function applyWalCss(vars: Record<string, string>) {
  const s = document.documentElement.style;
  for (const [k, v] of Object.entries(vars)) {
    s.setProperty(`--${k}`, v);
  }
}

function readInitialTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "wal") {
    localStorage.setItem(STORAGE_KEY, "dark");
    return "dark";
  }
  if (stored === "dark" || stored === "light") {
    return stored;
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(readInitialTheme);
  const [walPalettes, setWalPalettes] = useState<{
    light: Record<string, string>;
    dark: Record<string, string>;
  } | null>(null);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    localStorage.setItem(STORAGE_KEY, next);
  }, []);

  useEffect(() => {
    getWalThemes()
      .then((pair) => {
        if (pair) setWalPalettes(pair);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    if (walPalettes) {
      applyWalCss(theme === "dark" ? walPalettes.dark : walPalettes.light);
    } else {
      clearWalCss();
    }
  }, [theme, walPalettes]);

  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  return { theme, setTheme, toggleTheme };
}
