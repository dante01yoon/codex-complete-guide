"use client";

import { useSyncExternalStore } from "react";

type Theme = "system" | "light" | "dark";
const isTheme = (value: string | undefined): value is Theme =>
  value === "system" || value === "light" || value === "dark";

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.classList.toggle("dark", theme === "dark" ||
    (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches));
}
function subscribe(callback: () => void) {
  const media = matchMedia("(prefers-color-scheme: dark)");
  const update = () => {
    const theme = document.documentElement.dataset.theme;
    applyTheme(isTheme(theme) ? theme : "system");
    callback();
  };
  const storage = () => {
    let theme: string | null = null;
    try { theme = localStorage.getItem("journal-theme"); } catch {}
    applyTheme(isTheme(theme ?? undefined) ? theme as Theme : "system");
    callback();
  };
  window.addEventListener("journal-theme-change", update);
  window.addEventListener("storage", storage);
  media.addEventListener("change", update);
  return () => {
    window.removeEventListener("journal-theme-change", update);
    window.removeEventListener("storage", storage);
    media.removeEventListener("change", update);
  };
}
function getSnapshot(): Theme {
  const theme = document.documentElement.dataset.theme;
  return isTheme(theme) ? theme : "system";
}

export function ThemePicker() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, () => "system");
  return (
    <div className="theme-picker">
      <label htmlFor="screen-theme" className="label">화면 테마</label>
      <select id="screen-theme" value={theme} onChange={(event) => {
        const next = event.target.value;
        if (!isTheme(next)) return;
        applyTheme(next);
        try { localStorage.setItem("journal-theme", next); } catch {}
        window.dispatchEvent(new Event("journal-theme-change"));
      }}>
        <option value="system">시스템</option>
        <option value="light">라이트</option>
        <option value="dark">다크</option>
      </select>
    </div>
  );
}
