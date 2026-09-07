export type ThemeMode = "light" | "dark";
export type BackdropId = "stone" | "sage" | "sand" | "sky" | "rose";
export type AccentId = "mint" | "violet" | "blue" | "coral" | "gold";
export type NoteSize = "s" | "m" | "l";
export type WeekStart = 0 | 1;

export type AppSettings = {
  mode: ThemeMode;
  backdrop: BackdropId;
  accent: AccentId;
  defaultMinutes: number;
  showHeatmap: boolean;
  weekStart: WeekStart;
  noteSize: NoteSize;
  reduceMotion: boolean;
};

export const BACKDROPS: { id: BackdropId; name: string; light: string; dark: string }[] = [
  { id: "stone", name: "Stone", light: "#F1EFEB", dark: "#161513" },
  { id: "sage", name: "Sage", light: "#E8EDE4", dark: "#121612" },
  { id: "sand", name: "Sand", light: "#F3EBDD", dark: "#1A1610" },
  { id: "sky", name: "Sky", light: "#E7EEF6", dark: "#10141A" },
  { id: "rose", name: "Rose", light: "#F4E8E8", dark: "#1A1213" },
];

export const ACCENTS: { id: AccentId; name: string; color: string; deep: string }[] = [
  { id: "mint", name: "Mint", color: "#28E99F", deep: "#107A4D" },
  { id: "violet", name: "Violet", color: "#756CF5", deep: "#4A44C4" },
  { id: "blue", name: "Blue", color: "#71ADFF", deep: "#2F5FB8" },
  { id: "coral", name: "Coral", color: "#FF7F59", deep: "#C44A2A" },
  { id: "gold", name: "Gold", color: "#DAFF01", deep: "#6B7A00" },
];

export const NOTE_SIZES: { id: NoteSize; name: string }[] = [
  { id: "s", name: "Small" },
  { id: "m", name: "Medium" },
  { id: "l", name: "Large" },
];

const STORAGE_KEY = "greentrack.settings";

export const DEFAULT_SETTINGS: AppSettings = {
  mode: "light",
  backdrop: "stone",
  accent: "mint",
  defaultMinutes: 25,
  showHeatmap: true,
  weekStart: 1,
  noteSize: "m",
  reduceMotion: false,
};

function isMode(value: unknown): value is ThemeMode {
  return value === "light" || value === "dark";
}

function isBackdrop(value: unknown): value is BackdropId {
  return BACKDROPS.some((item) => item.id === value);
}

function isAccent(value: unknown): value is AccentId {
  return ACCENTS.some((item) => item.id === value);
}

function isNoteSize(value: unknown): value is NoteSize {
  return value === "s" || value === "m" || value === "l";
}

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      mode: isMode(parsed.mode) ? parsed.mode : DEFAULT_SETTINGS.mode,
      backdrop: isBackdrop(parsed.backdrop) ? parsed.backdrop : DEFAULT_SETTINGS.backdrop,
      accent: isAccent(parsed.accent) ? parsed.accent : DEFAULT_SETTINGS.accent,
      defaultMinutes: [25, 45, 60, 120, 180].includes(Number(parsed.defaultMinutes))
        ? Number(parsed.defaultMinutes)
        : DEFAULT_SETTINGS.defaultMinutes,
      showHeatmap: typeof parsed.showHeatmap === "boolean" ? parsed.showHeatmap : DEFAULT_SETTINGS.showHeatmap,
      weekStart: parsed.weekStart === 0 || parsed.weekStart === 1 ? parsed.weekStart : DEFAULT_SETTINGS.weekStart,
      noteSize: isNoteSize(parsed.noteSize) ? parsed.noteSize : DEFAULT_SETTINGS.noteSize,
      reduceMotion: typeof parsed.reduceMotion === "boolean" ? parsed.reduceMotion : DEFAULT_SETTINGS.reduceMotion,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: AppSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function applySettings(settings: AppSettings) {
  const root = document.documentElement;
  root.dataset.mode = settings.mode;
  root.dataset.bg = settings.backdrop;
  root.dataset.accent = settings.accent;
  root.dataset.note = settings.noteSize;
  root.dataset.motion = settings.reduceMotion ? "reduce" : "ok";
  root.style.colorScheme = settings.mode;
}
