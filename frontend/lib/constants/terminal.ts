/** WebSocket connection timeout in milliseconds */
export const CONNECTION_TIMEOUT = 10000;

/** Retry backoff delay in milliseconds */
export const RETRY_BACKOFF = 2000;

/** Terminal scrollback buffer size (default: 10000 lines) */
export const SCROLLBACK = 10000;

/** Mobile device width threshold in pixels */
export const MOBILE_WIDTH_THRESHOLD = 768;

/** Terminal fit delay after initialization in milliseconds */
export const FIT_DELAY_MS = 100;

/** WebSocket close code for dead session */
export const WS_CLOSE_CODE_SESSION_DEAD = 4000;

/** ResizeObserver debounce delay in milliseconds */
export const RESIZE_DEBOUNCE_MS = 150;

/** Scroll threshold for touch scroll handling (pixels) */
export const SCROLL_THRESHOLD = 50;

/** Copy-mode timeout in milliseconds (auto-exit after inactivity) */
export const COPY_MODE_TIMEOUT_MS = 10000;

/** Grid layout types (only 2x2 supported - max 4 panes) */
export type GridLayoutMode = "grid-2x2";

/** Minimum viewport widths required for each grid layout mode (in pixels) */
export const GRID_MIN_WIDTHS: Record<GridLayoutMode, number> = {
  "grid-2x2": 1280,
} as const;

/** Number of cells for each grid layout mode */
export const GRID_CELL_COUNTS: Record<GridLayoutMode, number> = {
  "grid-2x2": 4,
} as const;

/** Maximum number of panes allowed */
export const MAX_PANES = 4;

/** Phosphor terminal theme colors */
export const PHOSPHOR_THEME = {
  background: "#0a0e14",
  foreground: "#e6edf3",
  cursor: "#00ff9f",
  cursorAccent: "#ffffff",
  selectionBackground: "rgba(0, 255, 159, 0.3)",
  selectionForeground: "#e6edf3",
  black: "#0f1419",
  red: "#f85149",
  green: "#00ff9f",
  yellow: "#d29922",
  blue: "#58a6ff",
  magenta: "#bc8cff",
  cyan: "#39c5cf",
  white: "#e6edf3",
  brightBlack: "#7d8590",
  brightRed: "#ffa198",
  brightGreen: "#56d364",
  brightYellow: "#e3b341",
  brightBlue: "#79c0ff",
  brightMagenta: "#d2a8ff",
  brightCyan: "#56d4dd",
  brightWhite: "#ffffff",
} as const;

/** Dracula theme */
export const DRACULA_THEME = {
  background: "#282a36",
  foreground: "#f8f8f2",
  cursor: "#f8f8f2",
  cursorAccent: "#282a36",
  selectionBackground: "rgba(68, 71, 90, 0.5)",
  selectionForeground: "#f8f8f2",
  black: "#21222c",
  red: "#ff5555",
  green: "#50fa7b",
  yellow: "#f1fa8c",
  blue: "#bd93f9",
  magenta: "#ff79c6",
  cyan: "#8be9fd",
  white: "#f8f8f2",
  brightBlack: "#6272a4",
  brightRed: "#ff6e6e",
  brightGreen: "#69ff94",
  brightYellow: "#ffffa5",
  brightBlue: "#d6acff",
  brightMagenta: "#ff92df",
  brightCyan: "#a4ffff",
  brightWhite: "#ffffff",
} as const;

/** Monokai theme */
export const MONOKAI_THEME = {
  background: "#272822",
  foreground: "#f8f8f2",
  cursor: "#f8f8f2",
  cursorAccent: "#272822",
  selectionBackground: "rgba(73, 72, 62, 0.5)",
  selectionForeground: "#f8f8f2",
  black: "#272822",
  red: "#f92672",
  green: "#a6e22e",
  yellow: "#f4bf75",
  blue: "#66d9ef",
  magenta: "#ae81ff",
  cyan: "#a1efe4",
  white: "#f8f8f2",
  brightBlack: "#75715e",
  brightRed: "#f92672",
  brightGreen: "#a6e22e",
  brightYellow: "#f4bf75",
  brightBlue: "#66d9ef",
  brightMagenta: "#ae81ff",
  brightCyan: "#a1efe4",
  brightWhite: "#f9f8f5",
} as const;

/** Solarized Dark theme */
export const SOLARIZED_DARK_THEME = {
  background: "#002b36",
  foreground: "#839496",
  cursor: "#839496",
  cursorAccent: "#002b36",
  selectionBackground: "rgba(7, 54, 66, 0.5)",
  selectionForeground: "#93a1a1",
  black: "#073642",
  red: "#dc322f",
  green: "#859900",
  yellow: "#b58900",
  blue: "#268bd2",
  magenta: "#d33682",
  cyan: "#2aa198",
  white: "#eee8d5",
  brightBlack: "#586e75",
  brightRed: "#cb4b16",
  brightGreen: "#586e75",
  brightYellow: "#657b83",
  brightBlue: "#839496",
  brightMagenta: "#6c71c4",
  brightCyan: "#93a1a1",
  brightWhite: "#fdf6e3",
} as const;

/** Tokyo Night theme */
export const TOKYO_NIGHT_THEME = {
  background: "#1a1b26",
  foreground: "#a9b1d6",
  cursor: "#c0caf5",
  cursorAccent: "#1a1b26",
  selectionBackground: "rgba(33, 38, 67, 0.5)",
  selectionForeground: "#c0caf5",
  black: "#15161e",
  red: "#f7768e",
  green: "#9ece6a",
  yellow: "#e0af68",
  blue: "#7aa2f7",
  magenta: "#bb9af7",
  cyan: "#7dcfff",
  white: "#a9b1d6",
  brightBlack: "#414868",
  brightRed: "#f7768e",
  brightGreen: "#9ece6a",
  brightYellow: "#e0af68",
  brightBlue: "#7aa2f7",
  brightMagenta: "#bb9af7",
  brightCyan: "#7dcfff",
  brightWhite: "#c0caf5",
} as const;

/** All available themes */
export const TERMINAL_THEMES = {
  phosphor: { name: "Phosphor", theme: PHOSPHOR_THEME },
  dracula: { name: "Dracula", theme: DRACULA_THEME },
  monokai: { name: "Monokai", theme: MONOKAI_THEME },
  "solarized-dark": { name: "Solarized Dark", theme: SOLARIZED_DARK_THEME },
  "tokyo-night": { name: "Tokyo Night", theme: TOKYO_NIGHT_THEME },
} as const;

export type TerminalThemeId = keyof typeof TERMINAL_THEMES;
