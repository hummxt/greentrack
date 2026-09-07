import type { Habit, LogStatus } from "./data";

const KEY = "greentrack.store";

export type LocalStore = {
  habits: Habit[];
  selectedId: string | null;
};

const STATUSES = new Set<LogStatus>(["done", "partial", "missed"]);

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function parseHabit(value: unknown): Habit | null {
  const item = asRecord(value);
  if (typeof item.id !== "string" || typeof item.name !== "string") return null;

  const notes: Record<string, string> = {};
  for (const [key, note] of Object.entries(asRecord(item.notes))) {
    if (typeof note === "string") notes[key] = note;
  }

  const logs: Record<string, LogStatus> = {};
  for (const [key, status] of Object.entries(asRecord(item.logs))) {
    if (typeof status === "string" && STATUSES.has(status as LogStatus)) logs[key] = status as LogStatus;
  }

  const tags = Array.isArray(item.tags) ? item.tags.filter((tag): tag is string => typeof tag === "string") : [];

  return {
    id: item.id,
    name: item.name,
    color: typeof item.color === "string" ? item.color : "#28E99F",
    frequency: typeof item.frequency === "string" ? item.frequency : "Daily",
    targetDate: typeof item.targetDate === "string" && item.targetDate ? item.targetDate : undefined,
    tags,
    bestStreak: typeof item.bestStreak === "number" ? item.bestStreak : 0,
    notes,
    logs,
  };
}

export function parseStore(raw: string): LocalStore {
  try {
    const data = asRecord(JSON.parse(raw));
    const habits = Array.isArray(data.habits) ? data.habits.map(parseHabit).filter((habit): habit is Habit => Boolean(habit)) : [];
    return {
      habits,
      selectedId: typeof data.selectedId === "string" ? data.selectedId : null,
    };
  } catch {
    return { habits: [], selectedId: null };
  }
}

function toJson(store: LocalStore) {
  return JSON.stringify(store);
}

function writeLocal(store: LocalStore) {
  localStorage.setItem(KEY, toJson(store));
}

async function writeDisk(store: LocalStore) {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("save_store", { json: toJson(store) });
  } catch {
    return;
  }
}

export async function loadStore(): Promise<LocalStore> {
  const local = parseStore(localStorage.getItem(KEY) ?? "{}");

  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const json = await invoke<string>("load_store");
    const disk = parseStore(json);
    if (disk.habits.length === 0 && local.habits.length > 0) {
      await invoke("save_store", { json: toJson(local) });
      return local;
    }
    if (disk.habits.length > 0) writeLocal(disk);
    return disk.habits.length > 0 || disk.selectedId ? disk : local;
  } catch {
    return local;
  }
}

let timer: number | null = null;

export function persistStore(store: LocalStore) {
  writeLocal(store);
  if (timer !== null) window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    timer = null;
    void writeDisk(store);
  }, 250);
}

export function persistStoreNow(store: LocalStore) {
  writeLocal(store);
  if (timer !== null) window.clearTimeout(timer);
  timer = null;
  void writeDisk(store);
}
