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

/** Grid layout types */
export type GridLayoutMode = "grid-2x2" | "grid-3x3" | "grid-4x4";

/** Minimum viewport widths required for each grid layout mode (in pixels) */
export const GRID_MIN_WIDTHS: Record<GridLayoutMode, number> = {
  "grid-2x2": 1280,
  "grid-3x3": 1920,
  "grid-4x4": 2560,
} as const;

/** Number of cells for each grid layout mode */
export const GRID_CELL_COUNTS: Record<GridLayoutMode, number> = {
  "grid-2x2": 4,
  "grid-3x3": 9,
  "grid-4x4": 16,
} as const;

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
