import { openUrl } from "@tauri-apps/plugin-opener";
import gsap from "gsap";
import { playSplash } from "./splash";
import {
  COLORS,
  currentStreak,
  daysUntil,
  heatmapDays,
  isLogged,
  monthGrid,
  parseIso,
  tagColor,
  todayIso,
  weekCompletion,
  type Habit,
  type LogStatus,
  type Pane,
} from "./data";
import { loadStore, persistStore, persistStoreNow } from "./persist";
import {
  ACCENTS,
  BACKDROPS,
  NOTE_SIZES,
  applySettings,
  loadSettings,
  saveSettings,
  type AppSettings,
} from "./settings";

const SESSION_OPTIONS = [
  { minutes: 25, label: "25 min" },
  { minutes: 45, label: "45 min" },
  { minutes: 60, label: "1 hour" },
  { minutes: 120, label: "2 hours" },
  { minutes: 180, label: "3 hours" },
];
const PANE_LABELS: Record<Pane, string> = {
  habits: "Tracks",
  tags: "Tags",
  stats: "Stats",
};
const prefersLessMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const state = {
  habits: [] as Habit[],
  selectedId: null as string | null,
  selectedDate: todayIso(),
  month: new Date(),
  pane: "habits" as Pane,
  tagFilter: null as string | null,
  search: "",
  modalOpen: false,
  deleteConfirmOpen: false,
  settingsOpen: false,
  settingsSection: "appearance",
  sidebarWidth: 268,
  calendarWidth: 352,
};

let settings = loadSettings();
applySettings(settings);

let sessionMinutes = settings.defaultMinutes;
let secondsLeft = sessionMinutes * 60;
let timerOn = false;
let timerId: number | null = null;
let motion: "none" | "month-prev" | "month-next" | "swap" = "none";
let monthLock = false;
let storeReady = false;

function currentStore() {
  return { habits: state.habits, selectedId: state.selectedId };
}

function saveLocal() {
  if (!storeReady) return;
  persistStore(currentStore());
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function classes(...names: Array<string | false | undefined>) {
  return names.filter(Boolean).join(" ");
}

function selectedHabit() {
  return state.habits.find((habit) => habit.id === state.selectedId) ?? state.habits[0];
}

function visibleHabits() {
  const query = state.search.trim().toLowerCase();
  return state.habits.filter((habit) => {
    const tagOk = !state.tagFilter || habit.tags.includes(state.tagFilter);
    const textOk =
      !query ||
      habit.name.toLowerCase().includes(query) ||
      habit.tags.some((tag) => tag.includes(query));
    return tagOk && textOk;
  });
}

function allTags() {
  return [...new Set(state.habits.flatMap((habit) => habit.tags))];
}

function formatMonth(date: Date) {
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function formatDay(iso: string) {
  return parseIso(iso).toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

function skipMotion() {
  return prefersLessMotion || settings.reduceMotion;
}

function sessionSeconds() {
  return sessionMinutes * 60;
}

function weekDays() {
  return settings.weekStart === 0
    ? ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]
    : ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
}

function commitSettings(next: AppSettings) {
  const minutesChanged = next.defaultMinutes !== settings.defaultMinutes;
  settings = next;
  saveSettings(settings);
  applySettings(settings);
  if (minutesChanged && !timerOn) {
    sessionMinutes = settings.defaultMinutes;
    secondsLeft = sessionSeconds();
  }
  render();
}

function formatClock(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
  const rest = String(seconds % 60).padStart(2, "0");
  if (hours > 0) return `${hours}:${minutes}:${rest}`;
  return `${minutes}:${rest}`;
}

function lineGutter(text: string) {
  const count = Math.max(text.split("\n").length, 8);
  let html = "";
  for (let i = 1; i <= count; i += 1) html += `<div>${String(i).padStart(2, "0")}</div>`;
  return html;
}

function deadlineClass(days: number) {
  if (days <= 14) return "is-hot";
  if (days <= 30) return "is-soon";
  return "";
}

function heatLevel(iso: string) {
  const hits = state.habits.filter((habit) => isLogged(habit.logs[iso])).length;
  if (hits >= 3) return 4;
  if (hits === 2) return 3;
  if (hits === 1) return 2;
  return 0;
}

function changeMonth(step: number) {
  if (monthLock) return;
  monthLock = true;
  state.month = new Date(state.month.getFullYear(), state.month.getMonth() + step, 1);
  motion = step > 0 ? "month-next" : "month-prev";
  render();
  window.setTimeout(() => {
    monthLock = false;
  }, 420);
}

function renderSidebar() {
  if (state.pane === "tags") {
    const buttons = allTags()
      .map((tag) => {
        const count = state.habits.filter((habit) => habit.tags.includes(tag)).length;
        return `
          <button class="${classes("tag", state.tagFilter === tag && "is-on")}" data-tag="${escapeHtml(tag)}">
            <span class="badge" style="background:${tagColor(tag)}">${escapeHtml(tag)}</span>
            <span class="habit-meta">${count}</span>
          </button>`;
      })
      .join("");
    return `<div class="tag-list">${buttons}</div>`;
  }

  if (state.pane === "stats") {
    const done = state.habits.reduce((sum, habit) => sum + weekCompletion(habit).done, 0);
    const possible = state.habits.length * 7;
    const percent = possible ? Math.round((done / possible) * 100) : 0;
    return `
      <div class="stats-side">
        <div class="stat-card">
          <span class="label">This week</span>
          <b>${percent}%</b>
        </div>
      </div>`;
  }

  const rows = visibleHabits()
    .map((habit) => {
      const left = habit.targetDate ? daysUntil(habit.targetDate) : null;
      return `
        <button class="${classes("habit", habit.id === state.selectedId && "is-on")}" data-habit="${habit.id}">
          <span class="swatch" style="background:${habit.color}"></span>
          <span>
            <div class="habit-name">${escapeHtml(habit.name)}</div>
            <div class="habit-meta">
              <span>${escapeHtml(habit.frequency)}</span>
              ${habit.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}
            </div>
          </span>
          <span class="habit-side">
            <div class="streak">${currentStreak(habit)}</div>
            ${left === null ? "" : `<div class="countdown ${deadlineClass(left)}">${left}d</div>`}
          </span>
        </button>`;
    })
    .join("");

  if (!rows) {
    return `
      <div class="habit-empty">
        <p>Press the <b>+</b> button to add something to track.</p>
      </div>`;
  }

  return `<div class="habit-list">${rows}</div>`;
}

function renderSettingsSidebar() {
  const items: [string, string][] = [
    ["appearance", "Appearance"],
    ["timer", "Timer"],
    ["workspace", "Workspace"],
    ["about", "About"],
  ];
  return `
    <nav class="settings-nav">
      ${items.map(([id, name]) => `<button type="button" class="${state.settingsSection === id ? "is-on" : ""}" data-settings-jump="${id}">${name}</button>`).join("")}
    </nav>`;
}

function renderSettings() {
  const modeBtns = (["light", "dark"] as const)
    .map(
      (mode) =>
        `<button type="button" class="${classes("choice", settings.mode === mode && "is-on")}" data-setting="mode" data-value="${mode}">${mode === "light" ? "Light" : "Dark"}</button>`,
    )
    .join("");

  const backdropBtns = BACKDROPS.map((item) => {
    const color = settings.mode === "dark" ? item.dark : item.light;
    return `
      <button type="button" class="${classes("color-swatch", settings.backdrop === item.id && "is-on")}" data-setting="backdrop" data-value="${item.id}">
        <i style="background:${color}"></i>
        <span>${escapeHtml(item.name)}</span>
      </button>`;
  }).join("");

  const accentBtns = ACCENTS.map(
    (item) => `
      <button type="button" class="${classes("color-swatch", settings.accent === item.id && "is-on")}" data-setting="accent" data-value="${item.id}">
        <i style="background:${item.color}"></i>
        <span>${escapeHtml(item.name)}</span>
      </button>`,
  ).join("");

  const timerBtns = SESSION_OPTIONS.map(
    (option) =>
      `<button type="button" class="${classes("choice", settings.defaultMinutes === option.minutes && "is-on")}" data-setting="defaultMinutes" data-value="${option.minutes}">${option.label}</button>`,
  ).join("");

  const heatmapBtns = [
    ["true", "On"],
    ["false", "Off"],
  ]
    .map(
      ([value, label]) =>
        `<button type="button" class="${classes("choice", String(settings.showHeatmap) === value && "is-on")}" data-setting="showHeatmap" data-value="${value}">${label}</button>`,
    )
    .join("");

  const weekBtns = [
    [1, "Monday"],
    [0, "Sunday"],
  ]
    .map(
      ([value, label]) =>
        `<button type="button" class="${classes("choice", settings.weekStart === value && "is-on")}" data-setting="weekStart" data-value="${value}">${label}</button>`,
    )
    .join("");

  const noteBtns = NOTE_SIZES.map(
    (item) =>
      `<button type="button" class="${classes("choice", settings.noteSize === item.id && "is-on")}" data-setting="noteSize" data-value="${item.id}">${item.name}</button>`,
  ).join("");

  const motionBtns = [
    ["true", "On"],
    ["false", "Off"],
  ]
    .map(
      ([value, label]) =>
        `<button type="button" class="${classes("choice", String(settings.reduceMotion) === value && "is-on")}" data-setting="reduceMotion" data-value="${value}">${label}</button>`,
    )
    .join("");

  return `
    <div class="settings-page">
      <header class="settings-hero">
        <div class="kicker">Preferences</div>
        <h1 class="note-title">Settings</h1>
        <p>Theme, timer, and workspace. Everything stays on this device.</p>
      </header>
      <section class="settings-section" id="settings-appearance">
        <h2>Appearance</h2>
        <div class="settings-row">
          <span class="settings-key">Theme</span>
          <div class="choice-row">${modeBtns}</div>
        </div>
        <div class="settings-row">
          <span class="settings-key">Backdrop</span>
          <div class="swatch-grid">${backdropBtns}</div>
        </div>
        <div class="settings-row">
          <span class="settings-key">Accent</span>
          <div class="swatch-grid">${accentBtns}</div>
        </div>
      </section>
      <section class="settings-section" id="settings-timer">
        <h2>Timer</h2>
        <div class="settings-row">
          <span class="settings-key">Default session</span>
          <div class="choice-row">${timerBtns}</div>
        </div>
      </section>
      <section class="settings-section" id="settings-workspace">
        <h2>Workspace</h2>
        <div class="settings-row">
          <span class="settings-key">Show heatmap</span>
          <div class="choice-row">${heatmapBtns}</div>
        </div>
        <div class="settings-row">
          <span class="settings-key">Week starts</span>
          <div class="choice-row">${weekBtns}</div>
        </div>
        <div class="settings-row">
          <span class="settings-key">Note size</span>
          <div class="choice-row">${noteBtns}</div>
        </div>
        <div class="settings-row">
          <span class="settings-key">Reduce motion</span>
          <div class="choice-row">${motionBtns}</div>
        </div>
      </section>
      <section class="settings-section" id="settings-about">
        <h2>About</h2>
        <p>Greentrack is a local tracker for goals, tasks, prep, and daily work. Notes, logs, and settings stay on this computer. There is no cloud account and nothing is uploaded.</p>
        <p>Built by Hummet Azim, <a href="https://www.hummet.dev" target="_blank" rel="noopener" data-open-url="https://www.hummet.dev">www.hummet.dev</a></p>
      </section>
    </div>`;
}

function renderNotes() {
  const habit = selectedHabit();
  if (!habit) {
    return `
      <header class="note-title-row">
        <div>
          <div class="kicker">Notes · ${escapeHtml(formatDay(state.selectedDate))}</div>
          <h1 class="note-title">Start a track</h1>
        </div>
      </header>
      <p class="empty-copy">Quick add a track, then write the session and color the day.</p>`;
  }

  const note = habit.notes[state.selectedDate] ?? "";
  const status = habit.logs[state.selectedDate];
  const left = habit.targetDate ? daysUntil(habit.targetDate) : null;
  const week = weekCompletion(habit, settings.weekStart);
  const pills = (["done", "partial", "missed"] as LogStatus[])
    .map((value) => `<button class="${classes("pill", `pill-${value}`, status === value && "is-on")}" data-log="${value}">${value}</button>`)
    .join("");

  return `
    <header class="note-title-row">
      <div>
        <div class="kicker">Notes · ${escapeHtml(formatDay(state.selectedDate))}${left === null ? "" : ` · ${left} days left`}</div>
        <h1 class="note-title">${escapeHtml(habit.name)}</h1>
      </div>
      <div class="note-actions">
        <div class="pills">${pills}</div>
        <button type="button" class="note-delete" id="delete-habit" title="Delete track">Delete</button>
      </div>
    </header>
    <div class="editor-card">
      <div class="editor-body">
        <div class="gutter" id="gutter">${lineGutter(note)}</div>
        <textarea class="editor" id="note-editor" placeholder="What did you do, where did you stall, what is next.">${escapeHtml(note)}</textarea>
      </div>
    </div>
    <div class="session-bar">
      <div>
        <strong>GREENTRACK</strong>
        <p>${currentStreak(habit)} day streak · ${week.done}/${week.total} days this week · best ${habit.bestStreak}</p>
      </div>
      <div class="pomodoro">
        <label class="session-length">
          <span>Length</span>
          <select id="session-length">
            ${SESSION_OPTIONS.map(
              (option) =>
                `<option value="${option.minutes}" ${option.minutes === sessionMinutes ? "selected" : ""}>${option.label}</option>`,
            ).join("")}
          </select>
        </label>
        <span class="time" id="timer">${formatClock(secondsLeft)}</span>
        <button class="btn btn-ghost" id="timer-toggle">${timerOn ? "Pause" : "Start"}</button>
        <button class="btn" id="timer-reset">Reset</button>
      </div>
    </div>`;
}

function renderStats() {
  const bars = state.habits
    .map((habit) => {
      const week = weekCompletion(habit, settings.weekStart);
      const percent = Math.round((week.done / week.total) * 100);
      return `
        <div class="bar-row">
          <span>${escapeHtml(habit.name)}</span>
          <div class="bar-track"><div class="bar-fill" style="width:${percent}%;background:${habit.color}"></div></div>
          <span class="habit-meta">${percent}%</span>
        </div>`;
    })
    .join("");

  return `
    <div class="stats-panel">
      <div class="kicker">Stats</div>
      <h2>Completion this week</h2>
      <p>How each track did this week. The calendar still follows the one you picked.</p>
      <div class="bars">${bars}</div>
    </div>`;
}

function renderCalendar() {
  const habit = selectedHabit();
  const days = weekDays().map((name) => `<span>${name}</span>`).join("");
  const cells = monthGrid(state.month, settings.weekStart)
    .map((cell) => {
      const log = habit?.logs[cell.iso];
      return `<button class="${classes(
        "day",
        !cell.inMonth && "out",
        cell.iso === todayIso() && "is-today",
        cell.iso === state.selectedDate && "is-selected",
        log && `has-${log}`,
      )}" data-day="${cell.iso}" style="--day:${habit?.color ?? "#28E99F"}">${cell.date.getDate()}</button>`;
    })
    .join("");

  return `
    <div class="month">
      <div class="dow">${days}</div>
      <div class="month-stage"><div class="grid">${cells}</div></div>
    </div>
    <div class="cal-stats">
      <div class="stat-card"><span class="label">Streak</span><b>${habit ? currentStreak(habit) : 0}</b></div>
      <div class="stat-card"><span class="label">Best</span><b>${habit?.bestStreak ?? 0}</b></div>
    </div>
    ${
      settings.showHeatmap
        ? `<div class="heatmap">
      <span class="label">Heatmap</span>
      <div class="heat">${heatmapDays(17, settings.weekStart).map((iso) => `<i class="l${heatLevel(iso)}" title="${iso}"></i>`).join("")}</div>
    </div>`
        : ""
    }`;
}

function renderModal() {
  return `
    <div class="overlay ${state.modalOpen ? "is-open" : ""}" id="overlay">
      <form class="modal" id="quick-form">
        <div class="label">Quick add</div>
        <h3>New track</h3>
        <label class="field"><span>Name</span><input name="name" required placeholder="Reading, run, calculus…" /></label>
        <label class="field">
          <span>Frequency</span>
          <select name="frequency">
            <option>Daily</option>
            <option>Weekdays</option>
            <option>3x per week</option>
          </select>
        </label>
        <label class="field"><span>Goal date</span><input name="target" type="date" /></label>
        <label class="field"><span>Tag</span><input name="tag" placeholder="optional" /></label>
        <div class="modal-actions">
          <button type="button" class="btn" id="modal-cancel">Cancel</button>
          <button type="submit" class="btn btn-primary">Create track</button>
        </div>
      </form>
    </div>`;
}

function renderDeleteConfirm() {
  const habit = selectedHabit();
  if (!habit) return "";
  return `
    <div class="overlay ${state.deleteConfirmOpen ? "is-open" : ""}" id="delete-overlay">
      <div class="modal">
        <div class="label">Delete</div>
        <h3>Delete this track?</h3>
        <p class="modal-copy">${escapeHtml(habit.name)} and its notes and logs will be removed.</p>
        <div class="modal-actions">
          <button type="button" class="btn" id="delete-cancel">Cancel</button>
          <button type="button" class="btn btn-danger" id="delete-confirm">Delete</button>
        </div>
      </div>
    </div>`;
}

function playMotion() {
  if (skipMotion() || motion === "none") {
    motion = "none";
    return;
  }

  if (motion === "month-next" || motion === "month-prev") {
    const dir = motion === "month-next" ? 1 : -1;
    gsap.from(".grid", { x: dir * 36, opacity: 0, duration: 0.42, ease: "power3.out" });
    gsap.from(".cal-nav h2", { y: 8, opacity: 0, duration: 0.3, ease: "power2.out" });
  } else {
    gsap.from(".notes > *", { y: 10, opacity: 0, duration: 0.32, stagger: 0.045, ease: "power2.out" });
  }

  motion = "none";
}

function restoreFocus(wasEditor: boolean, wasSearch: boolean, caret: number | null, searchCaret: number | null, noteScroll: number) {
  const editor = document.querySelector<HTMLTextAreaElement>("#note-editor");
  const editorCard = document.querySelector(".editor-card");
  if (editor && wasEditor) {
    editor.focus();
    if (caret !== null) editor.setSelectionRange(caret, caret);
    if (editorCard) editorCard.scrollTop = noteScroll;
  }

  const search = document.querySelector<HTMLInputElement>("#search");
  if (search && wasSearch) {
    search.focus();
    if (searchCaret !== null) search.setSelectionRange(searchCaret, searchCaret);
  }
}

function render() {
  const app = document.querySelector("#app");
  if (!app) return;

  const editor = document.querySelector<HTMLTextAreaElement>("#note-editor");
  const search = document.querySelector<HTMLInputElement>("#search");
  const settingsPage = document.querySelector(".settings-page");
  const wasEditor = document.activeElement?.id === "note-editor";
  const wasSearch = document.activeElement?.id === "search";
  const caret = editor?.selectionStart ?? null;
  const searchCaret = wasSearch ? search?.selectionStart ?? null : null;
  const noteScroll = document.querySelector(".editor-card")?.scrollTop ?? 0;
  const settingsScroll = settingsPage?.scrollTop ?? 0;

  app.innerHTML = `
    <div class="shell" style="--sidebar:${state.sidebarWidth}px;--calendar:${state.calendarWidth}px">
      <header class="topbar" data-tauri-drag-region>
        <div class="brand">
          <div class="wordmark">Green<span>track</span></div>
        </div>
        <nav class="nav-links">
          <button data-pane="habits" class="${!state.settingsOpen && state.pane === "habits" ? "is-on" : ""}">Tracks</button>
          <button data-pane="tags" class="${!state.settingsOpen && state.pane === "tags" ? "is-on" : ""}">Tags</button>
          <button data-pane="stats" class="${!state.settingsOpen && state.pane === "stats" ? "is-on" : ""}">Stats</button>
        </nav>
        <label class="search">
          <input id="search" placeholder="Tracks, tags, notes" value="${escapeHtml(state.search)}" />
        </label>
        <div class="top-actions">
          <button class="btn btn-ghost" id="quick-add">Quick add</button>
          <button class="btn btn-primary" id="timer-toggle-top">${timerOn ? "Pause session" : "Start session"}</button>
          <button type="button" class="${classes("btn", "btn-ghost", state.settingsOpen && "is-on")}" id="open-settings">Settings</button>
        </div>
        <div class="win-controls">
          <button type="button" class="js-win-min" aria-label="Minimize">─</button>
          <button type="button" class="js-win-max" aria-label="Maximize">□</button>
          <button type="button" class="js-win-close" aria-label="Close">✕</button>
        </div>
      </header>
      <div class="workspace${state.settingsOpen ? " is-settings" : ""}">
        <aside class="pane sidebar">
          <div class="pane-head">
            <span class="label">${state.settingsOpen ? "Settings" : PANE_LABELS[state.pane]}</span>
            ${
              state.settingsOpen
                ? `<button type="button" class="settings-back" id="settings-back">Back</button>`
                : `<button class="icon-btn" id="quick-add-icon" title="New track">+</button>`
            }
          </div>
          ${state.settingsOpen ? renderSettingsSidebar() : renderSidebar()}
        </aside>
        <div class="handle" data-handle="sidebar"></div>
        <section class="pane notes">${state.settingsOpen ? renderSettings() : state.pane === "stats" ? renderStats() : renderNotes()}</section>
        ${
          state.settingsOpen
            ? ""
            : `<div class="handle" data-handle="calendar"></div>
        <aside class="pane calendar">
          <div class="pane-head">
            <span class="label">Calendar</span>
            <div class="cal-nav">
              <button class="icon-btn" data-shift="-1">‹</button>
              <h2>${formatMonth(state.month)}</h2>
              <button class="icon-btn" data-shift="1">›</button>
            </div>
          </div>
          ${renderCalendar()}
        </aside>`
        }
      </div>
    </div>
    ${renderModal()}
    ${renderDeleteConfirm()}
  `;

  playMotion();
  restoreFocus(wasEditor, wasSearch, caret, searchCaret, noteScroll);
  const nextSettings = document.querySelector(".settings-page");
  if (nextSettings) nextSettings.scrollTop = settingsScroll;
  gsap.set("#overlay", { autoAlpha: state.modalOpen ? 1 : 0 });
  gsap.set("#delete-overlay", { autoAlpha: state.deleteConfirmOpen ? 1 : 0 });
  document.documentElement.style.setProperty("--day", selectedHabit()?.color ?? "#28E99F");
  saveLocal();
}

function closest(event: Event, selector: string) {
  const target = event.target;
  if (!(target instanceof Element)) return null;
  return target.closest(selector);
}

function openModal() {
  state.modalOpen = true;
  const overlay = document.querySelector<HTMLElement>("#overlay");
  const modal = document.querySelector<HTMLElement>(".modal");
  if (!overlay || !modal) return;

  overlay.classList.add("is-open");
  gsap.killTweensOf([overlay, modal]);

  if (skipMotion()) {
    gsap.set(overlay, { autoAlpha: 1 });
    gsap.set(modal, { y: 0, scale: 1, opacity: 1 });
  } else {
    gsap.set(overlay, { autoAlpha: 0 });
    gsap.set(modal, { y: 18, scale: 0.96, opacity: 0 });
    gsap.to(overlay, { autoAlpha: 1, duration: 0.28, ease: "power2.out" });
    gsap.to(modal, { y: 0, scale: 1, opacity: 1, duration: 0.4, ease: "power3.out" });
  }

  document.querySelector<HTMLInputElement>("input[name=name]")?.focus();
}

function closeModal(after?: () => void) {
  const overlay = document.querySelector<HTMLElement>("#overlay");
  const modal = document.querySelector<HTMLElement>(".modal");
  const done = () => {
    state.modalOpen = false;
    overlay?.classList.remove("is-open");
    gsap.set(overlay, { autoAlpha: 0 });
    after?.();
  };

  if (!overlay || !modal || skipMotion()) {
    done();
    return;
  }

  gsap.killTweensOf([overlay, modal]);
  gsap.to(modal, { y: 12, scale: 0.98, opacity: 0, duration: 0.22, ease: "power2.in" });
  gsap.to(overlay, { autoAlpha: 0, duration: 0.22, ease: "power2.in", onComplete: done });
}

function closeDeleteConfirm() {
  if (!state.deleteConfirmOpen) return;
  state.deleteConfirmOpen = false;
  render();
}

function deleteSelectedHabit() {
  const habit = selectedHabit();
  if (!habit) return;

  state.habits = state.habits.filter((item) => item.id !== habit.id);
  state.selectedId = state.habits[0]?.id ?? null;
  state.pane = "habits";
  state.deleteConfirmOpen = false;
  motion = "swap";
  render();
}

function addHabit(form: HTMLFormElement) {
  const data = new FormData(form);
  const name = String(data.get("name") ?? "").trim();
  if (!name) return;

  const tag = String(data.get("tag") ?? "").trim();
  const target = String(data.get("target") ?? "");
  const habit: Habit = {
    id: `h-${Date.now()}`,
    name,
    color: COLORS[state.habits.length % COLORS.length],
    frequency: String(data.get("frequency") ?? "Daily"),
    targetDate: target || undefined,
    tags: tag ? [tag] : [],
    bestStreak: 0,
    notes: {},
    logs: {},
  };

  state.habits.unshift(habit);
  state.selectedId = habit.id;
  state.pane = "habits";
  motion = "swap";
  closeModal(() => render());
}

function toggleTimer() {
  timerOn = !timerOn;

  if (timerOn) {
    timerId = window.setInterval(() => {
      secondsLeft -= 1;
      if (secondsLeft > 0) {
        const timer = document.querySelector("#timer");
        if (timer) timer.textContent = formatClock(secondsLeft);
        return;
      }

      secondsLeft = sessionSeconds();
      timerOn = false;
      if (timerId !== null) window.clearInterval(timerId);
      timerId = null;

      const habit = selectedHabit();
      if (habit) {
        habit.logs[todayIso()] = "done";
        habit.bestStreak = Math.max(habit.bestStreak, currentStreak(habit));
      }
      render();
    }, 1000);
  } else if (timerId !== null) {
    window.clearInterval(timerId);
    timerId = null;
  }

  render();
}

function resetTimer() {
  secondsLeft = sessionSeconds();
  timerOn = false;
  if (timerId !== null) window.clearInterval(timerId);
  timerId = null;
  render();
}

function setSessionLength(minutes: number) {
  sessionMinutes = minutes;
  resetTimer();
}

async function windowAction(action: "min" | "max" | "hide") {
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const win = getCurrentWindow();
    if (action === "min") await win.minimize();
    if (action === "max") await win.toggleMaximize();
    if (action === "hide") await win.hide();
  } catch {
    if (action === "hide") window.close();
  }
}

function listen() {
  document.addEventListener("click", (event) => {
    const pane = closest(event, "[data-pane]");
    if (pane) {
      state.pane = (pane.getAttribute("data-pane") ?? "habits") as Pane;
      if (state.pane !== "tags") state.tagFilter = null;
      state.settingsOpen = false;
      motion = "swap";
      render();
      return;
    }

    const openLink = closest(event, "[data-open-url]");
    if (openLink) {
      event.preventDefault();
      const url = openLink.getAttribute("data-open-url");
      if (url) void openUrl(url);
      return;
    }

    if (closest(event, "#open-settings")) {
      state.settingsOpen = !state.settingsOpen;
      if (state.settingsOpen) state.settingsSection = "appearance";
      motion = "swap";
      render();
      return;
    }

    if (closest(event, "#settings-back")) {
      state.settingsOpen = false;
      motion = "swap";
      render();
      return;
    }

    const jump = closest(event, "[data-settings-jump]");
    if (jump) {
      state.settingsSection = jump.getAttribute("data-settings-jump") ?? "appearance";
      document.querySelectorAll("[data-settings-jump]").forEach((btn) => {
        btn.classList.toggle("is-on", btn === jump);
      });
      const section = document.querySelector(`#settings-${state.settingsSection}`);
      section?.scrollIntoView({ behavior: skipMotion() ? "auto" : "smooth", block: "start" });
      return;
    }

    const setting = closest(event, "[data-setting]");
    if (setting) {
      const key = setting.getAttribute("data-setting");
      const raw = setting.getAttribute("data-value");
      if (!key || raw === null) return;
      const next = { ...settings };
      if (key === "mode" && (raw === "light" || raw === "dark")) next.mode = raw;
      else if (key === "backdrop" && BACKDROPS.some((item) => item.id === raw)) next.backdrop = raw as AppSettings["backdrop"];
      else if (key === "accent" && ACCENTS.some((item) => item.id === raw)) next.accent = raw as AppSettings["accent"];
      else if (key === "defaultMinutes" && SESSION_OPTIONS.some((option) => option.minutes === Number(raw))) {
        next.defaultMinutes = Number(raw);
      }
      else if (key === "showHeatmap") next.showHeatmap = raw === "true";
      else if (key === "weekStart") next.weekStart = raw === "0" ? 0 : 1;
      else if (key === "noteSize" && NOTE_SIZES.some((item) => item.id === raw)) next.noteSize = raw as AppSettings["noteSize"];
      else if (key === "reduceMotion") next.reduceMotion = raw === "true";
      else return;
      commitSettings(next);
      return;
    }

    const habit = closest(event, "[data-habit]");
    if (habit) {
      state.selectedId = habit.getAttribute("data-habit");
      state.pane = "habits";
      motion = "swap";
      render();
      return;
    }

    const tag = closest(event, "[data-tag]");
    if (tag) {
      const value = tag.getAttribute("data-tag");
      state.tagFilter = state.tagFilter === value ? null : value;
      motion = "swap";
      render();
      return;
    }

    const day = closest(event, "[data-day]");
    if (day) {
      state.selectedDate = day.getAttribute("data-day") ?? state.selectedDate;
      state.pane = "habits";
      motion = "swap";
      render();
      return;
    }

    const log = closest(event, "[data-log]");
    if (log) {
      const habitItem = selectedHabit();
      const next = log.getAttribute("data-log") as LogStatus | null;
      if (!habitItem || !next) return;
      if (habitItem.logs[state.selectedDate] === next) delete habitItem.logs[state.selectedDate];
      else habitItem.logs[state.selectedDate] = next;
      habitItem.bestStreak = Math.max(habitItem.bestStreak, currentStreak(habitItem));
      render();
      return;
    }

    if (closest(event, "#delete-habit")) {
      if (!selectedHabit()) return;
      state.deleteConfirmOpen = true;
      render();
      return;
    }

    if (closest(event, "#delete-cancel")) {
      closeDeleteConfirm();
      return;
    }

    if (closest(event, "#delete-confirm")) {
      deleteSelectedHabit();
      return;
    }

    if (event.target === document.querySelector("#delete-overlay")) {
      closeDeleteConfirm();
      return;
    }

    const shift = closest(event, "[data-shift]");
    if (shift) {
      changeMonth(Number(shift.getAttribute("data-shift")));
      return;
    }

    if (closest(event, ".js-win-min")) {
      windowAction("min");
      return;
    }
    if (closest(event, ".js-win-max")) {
      windowAction("max");
      return;
    }
    if (closest(event, ".js-win-close")) {
      windowAction("hide");
      return;
    }

    if (closest(event, "#quick-add") || closest(event, "#quick-add-icon")) {
      openModal();
      return;
    }

    if (closest(event, "#modal-cancel")) {
      closeModal();
      return;
    }

    if (event.target === document.querySelector("#overlay")) {
      closeModal();
      return;
    }

    if (closest(event, "#timer-toggle") || closest(event, "#timer-toggle-top")) toggleTimer();
    if (closest(event, "#timer-reset")) resetTimer();
  });

  document.addEventListener("change", (event) => {
    const target = event.target;
    if (target instanceof HTMLSelectElement && target.id === "session-length") {
      setSessionLength(Number(target.value));
    }
  });

  document.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    if (target.id === "search" && target instanceof HTMLInputElement) {
      state.search = target.value;
      render();
      return;
    }

    if (target.id === "note-editor" && target instanceof HTMLTextAreaElement) {
      const habit = selectedHabit();
      if (!habit) return;
      habit.notes[state.selectedDate] = target.value;
      const gutter = document.querySelector("#gutter");
      if (gutter) gutter.innerHTML = lineGutter(target.value);
      saveLocal();
    }
  });

  document.addEventListener("submit", (event) => {
    const form = closest(event, "#quick-form");
    if (!(form instanceof HTMLFormElement)) return;
    event.preventDefault();
    addHabit(form);
  });

  document.addEventListener(
    "wheel",
    (event) => {
      if (!(event.target instanceof Element) || !event.target.closest(".calendar")) return;
      if (Math.abs(event.deltaY) < 18) return;
      event.preventDefault();
      changeMonth(event.deltaY > 0 ? 1 : -1);
    },
    { passive: false },
  );

  document.addEventListener("pointerdown", (event) => {
    const handle = closest(event, "[data-handle]");
    if (!handle) return;

    const which = handle.getAttribute("data-handle") === "sidebar" ? "sidebarWidth" : "calendarWidth";
    const startX = event.clientX;
    const start = state[which];
    handle.classList.add("is-drag");

    const move = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startX;
      if (which === "sidebarWidth") state.sidebarWidth = Math.min(380, Math.max(220, start + delta));
      else state.calendarWidth = Math.min(460, Math.max(280, start - delta));
      const shell = document.querySelector<HTMLElement>(".shell");
      shell?.style.setProperty("--sidebar", `${state.sidebarWidth}px`);
      shell?.style.setProperty("--calendar", `${state.calendarWidth}px`);
    };

    const up = () => {
      handle.classList.remove("is-drag");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  });

  window.addEventListener("keydown", (event) => {
    if (document.querySelector("#splash")) return;
    const typing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;

    if (event.key === "Escape" && state.deleteConfirmOpen) closeDeleteConfirm();
    else if (event.key === "Escape" && state.modalOpen) closeModal();
    else if (event.key === "Escape" && state.settingsOpen) {
      state.settingsOpen = false;
      render();
    } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      openModal();
    } else if (!typing && event.key === "/") {
      event.preventDefault();
      document.querySelector<HTMLInputElement>("#search")?.focus();
    }
  });
}

listen();
playSplash();
loadStore().then((store) => {
  state.habits = store.habits;
  state.selectedId = store.selectedId;
  storeReady = true;
  render();
});
window.addEventListener("pagehide", () => {
  if (storeReady) persistStoreNow(currentStore());
});
