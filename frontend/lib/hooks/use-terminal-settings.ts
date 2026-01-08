"use client";

import { useState, useCallback } from "react";

// Popular monospace fonts for terminals
// Mix of Google Fonts (loaded) and system fonts (fallback)
export const TERMINAL_FONTS = [
  { id: "jetbrains-mono", name: "JetBrains Mono", family: "'JetBrains Mono', monospace" },
  { id: "fira-code", name: "Fira Code", family: "'Fira Code', monospace" },
  { id: "source-code-pro", name: "Source Code Pro", family: "'Source Code Pro', monospace" },
  { id: "roboto-mono", name: "Roboto Mono", family: "'Roboto Mono', monospace" },
  { id: "ubuntu-mono", name: "Ubuntu Mono", family: "'Ubuntu Mono', monospace" },
  { id: "inconsolata", name: "Inconsolata", family: "'Inconsolata', monospace" },
  { id: "ibm-plex-mono", name: "IBM Plex Mono", family: "'IBM Plex Mono', monospace" },
  { id: "menlo", name: "Menlo", family: "Menlo, Monaco, monospace" },
  { id: "consolas", name: "Consolas", family: "Consolas, monospace" },
  { id: "cascadia", name: "Cascadia Code", family: "'Cascadia Code', 'Cascadia Mono', monospace" },
] as const;

export const TERMINAL_FONT_SIZES = [10, 11, 12, 13, 14, 15, 16, 18, 20] as const;

// Scrollback buffer sizes (lines)
export const TERMINAL_SCROLLBACK_OPTIONS = [
  { value: 1000, label: "1K lines" },
  { value: 10000, label: "10K lines" },
  { value: 50000, label: "50K lines" },
  { value: 999999, label: "Unlimited" },
] as const;

export type TerminalFontId = typeof TERMINAL_FONTS[number]["id"];
export type TerminalFontSize = typeof TERMINAL_FONT_SIZES[number];
export type TerminalScrollback = typeof TERMINAL_SCROLLBACK_OPTIONS[number]["value"];

interface TerminalSettings {
  fontId: TerminalFontId;
  fontSize: TerminalFontSize;
  scrollback: TerminalScrollback;
}

const STORAGE_KEY = "terminal-settings";

const DEFAULT_SETTINGS: TerminalSettings = {
  fontId: "jetbrains-mono",
  fontSize: 14,
  scrollback: 10000,
};

function loadSettings(): TerminalSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        fontId: TERMINAL_FONTS.some(f => f.id === parsed.fontId) ? parsed.fontId : DEFAULT_SETTINGS.fontId,
        fontSize: TERMINAL_FONT_SIZES.includes(parsed.fontSize) ? parsed.fontSize : DEFAULT_SETTINGS.fontSize,
        scrollback: TERMINAL_SCROLLBACK_OPTIONS.some(o => o.value === parsed.scrollback)
          ? parsed.scrollback
          : DEFAULT_SETTINGS.scrollback,
      };
    }
  } catch {
    // Ignore parse errors
  }
  return DEFAULT_SETTINGS;
}

function saveSettings(settings: TerminalSettings): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function useTerminalSettings() {
  // Use lazy initialization to load settings synchronously
  const [settings, setSettings] = useState<TerminalSettings>(() => loadSettings());
  // isLoaded is now always true after initial render since we use lazy init
  const isLoaded = true;

  // Get the font family string for the current font
  const fontFamily = TERMINAL_FONTS.find(f => f.id === settings.fontId)?.family ?? TERMINAL_FONTS[0].family;

  const setFontId = useCallback((fontId: TerminalFontId) => {
    setSettings(prev => {
      const next = { ...prev, fontId };
      saveSettings(next);
      return next;
    });
  }, []);

  const setFontSize = useCallback((fontSize: TerminalFontSize) => {
    setSettings(prev => {
      const next = { ...prev, fontSize };
      saveSettings(next);
      return next;
    });
  }, []);

  const setScrollback = useCallback((scrollback: TerminalScrollback) => {
    setSettings(prev => {
      const next = { ...prev, scrollback };
      saveSettings(next);
      return next;
    });
  }, []);

  return {
    fontId: settings.fontId,
    fontSize: settings.fontSize,
    fontFamily,
    scrollback: settings.scrollback,
    setFontId,
    setFontSize,
    setScrollback,
    isLoaded,
  };
}
