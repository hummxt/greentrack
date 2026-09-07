export type LogStatus = "done" | "partial" | "missed";
export type Pane = "habits" | "tags" | "stats";

export type Habit = {
  id: string;
  name: string;
  color: string;
  frequency: string;
  targetDate?: string;
  tags: string[];
  bestStreak: number;
  notes: Record<string, string>;
  logs: Record<string, LogStatus>;
};

export const COLORS = [
  "#756CF5",
  "#71ADFF",
  "#28E99F",
  "#FF7F59",
  "#FFACFE",
  "#5882FF",
];

const TAG_COLORS = ["#ECFFA3", "#FFCFFE", "#C5FFD6", "#71ADFF", "#DAFF01", "#FF7F59"];

export function toIso(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseIso(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function todayIso(): string {
  return toIso(new Date());
}

export function addDays(iso: string, days: number): string {
  const date = parseIso(iso);
  date.setDate(date.getDate() + days);
  return toIso(date);
}

export function daysUntil(iso: string): number {
  const ms = parseIso(iso).getTime() - parseIso(todayIso()).getTime();
  return Math.round(ms / 86_400_000);
}

export function isLogged(status?: LogStatus): boolean {
  return status === "done" || status === "partial";
}

export function currentStreak(habit: Habit): number {
  let day = todayIso();
  if (!habit.logs[day]) day = addDays(day, -1);

  let streak = 0;
  while (isLogged(habit.logs[day])) {
    streak += 1;
    day = addDays(day, -1);
  }
  return streak;
}

function weekOffset(date: Date, weekStart: 0 | 1) {
  return (date.getDay() - weekStart + 7) % 7;
}

export function weekCompletion(habit: Habit, weekStart: 0 | 1 = 1): { done: number; total: number } {
  const today = parseIso(todayIso());
  const start = new Date(today);
  start.setDate(today.getDate() - weekOffset(today, weekStart));

  let done = 0;
  for (let i = 0; i < 7; i += 1) {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    if (isLogged(habit.logs[toIso(day)])) done += 1;
  }
  return { done, total: 7 };
}

export function monthGrid(month: Date, weekStart: 0 | 1 = 1) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first);
  start.setDate(1 - weekOffset(first, weekStart));

  const cells = [];
  for (let i = 0; i < 42; i += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    cells.push({
      date,
      iso: toIso(date),
      inMonth: date.getMonth() === month.getMonth(),
    });
  }
  return cells;
}

export function heatmapDays(weeks = 17, weekStart: 0 | 1 = 1): string[] {
  const end = parseIso(todayIso());
  const start = new Date(end);
  start.setDate(end.getDate() - weekOffset(end, weekStart) - (weeks - 1) * 7);

  const days: string[] = [];
  for (let i = 0; i < weeks * 7; i += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    days.push(toIso(date));
  }
  return days;
}

export function tagColor(tag: string): string {
  let hash = 0;
  for (const char of tag) hash += char.charCodeAt(0);
  return TAG_COLORS[hash % TAG_COLORS.length];
}
