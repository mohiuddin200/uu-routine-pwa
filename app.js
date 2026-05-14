const data = window.ROUTINE_DATA;

const SELECT_ALL = "__all__";
const STORAGE_KEY = "uu-routine-pwa-state";

const icons = {
  teacher:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 21a8 8 0 0 0-16 0"/><path d="M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z"/></svg>',
  room:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s7-4.4 7-11a7 7 0 1 0-14 0c0 6.6 7 11 7 11Z"/><path d="M12 10.5h.01"/></svg>',
  slot:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7v5l3 2"/><path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></svg>',
};

const state = {
  day: "Friday",
  batch: SELECT_ALL,
  query: "",
  filter: "all",
};

const els = {};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function todayName() {
  return new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(new Date());
}

function toMinutes(time) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function nowMinutes() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function formatTime(time) {
  const [hoursValue, minutes] = time.split(":").map(Number);
  const period = hoursValue >= 12 ? "PM" : "AM";
  const hours = hoursValue % 12 || 12;
  return `${hours}:${String(minutes).padStart(2, "0")} ${period}`;
}

function formatRange(start, end) {
  return `${formatTime(start)} - ${formatTime(end)}`;
}

function timeLabel(entry) {
  return formatRange(entry.start, entry.end);
}

function normalize(value) {
  return String(value ?? "").toLowerCase().trim();
}

function isLab(entry) {
  return normalize(entry.room).includes("lab");
}

function isTba(entry) {
  return !entry.room || normalize(entry.room).includes("tba");
}

function matchesQuery(entry) {
  const query = normalize(state.query);
  if (!query) return true;
  return [entry.batch, entry.course, entry.teacher, entry.room, entry.start, entry.end, timeLabel(entry), entry.program]
    .map(normalize)
    .some((value) => value.includes(query));
}

function baseEntries() {
  return data.entries.filter((entry) => {
    const dayMatch = entry.day === state.day;
    const batchMatch = state.batch === SELECT_ALL || entry.batch === state.batch;
    return dayMatch && batchMatch;
  });
}

function filteredEntries() {
  const currentDay = todayName();
  const minutes = nowMinutes();

  return baseEntries()
    .filter(matchesQuery)
    .filter((entry) => {
      if (state.filter === "labs") return isLab(entry);
      if (state.filter === "tba") return isTba(entry);
      if (state.filter === "upcoming" && state.day === currentDay) {
        return toMinutes(entry.end) > minutes;
      }
      return true;
    })
    .sort((a, b) => toMinutes(a.start) - toMinutes(b.start) || a.batch.localeCompare(b.batch));
}

function countByDay(day) {
  return data.entries.filter((entry) => entry.day === day).length;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function loadSavedState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    if (data.days.includes(saved.day)) state.day = saved.day;
    if (saved.batch === SELECT_ALL || data.batches.includes(saved.batch)) state.batch = saved.batch;
    if (["all", "upcoming", "labs", "tba"].includes(saved.filter)) state.filter = saved.filter;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }

  const currentDay = todayName();
  if (!data.meta.availableDays.includes(state.day)) {
    state.day = data.meta.availableDays.includes(currentDay) ? currentDay : "Friday";
  }
}

function saveState() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ day: state.day, batch: state.batch, filter: state.filter }),
  );
}

function renderStats() {
  const rooms = unique(data.entries.map((entry) => entry.room));
  els.statClasses.textContent = data.entries.length;
  els.statBatches.textContent = data.batches.length;
  els.statRooms.textContent = rooms.length;
  els.heroSummary.textContent = `${data.entries.length} Friday classes for Batch 67 across ${data.batches.length} sections, extracted from the official ${data.meta.generatedFromPages}-page PDF.`;
}

function renderBatchSelect() {
  const options = [
    `<option value="${SELECT_ALL}">All 67 sections</option>`,
    ...data.batches.map((batch) => `<option value="${escapeHtml(batch)}">${escapeHtml(batch)}</option>`),
  ];
  els.batchSelect.innerHTML = options.join("");
  els.batchSelect.value = state.batch;
}

function renderDayStrip() {
  els.dayStrip.innerHTML = data.meta.availableDays
    .map((day) => {
      const active = day === state.day ? "active" : "";
      const count = countByDay(day);
      return `<button class="${active}" type="button" data-day="${escapeHtml(day)}" aria-pressed="${day === state.day}">
        ${escapeHtml(day)}
        <small>${count}</small>
      </button>`;
    })
    .join("");
}

function renderBatchRail() {
  const buttons = [
    `<button class="${state.batch === SELECT_ALL ? "active" : ""}" type="button" data-batch="${SELECT_ALL}" aria-pressed="${state.batch === SELECT_ALL}">All</button>`,
    ...data.batches.map((batch) => {
      const active = batch === state.batch ? "active" : "";
      return `<button class="${active}" type="button" data-batch="${escapeHtml(batch)}" aria-pressed="${batch === state.batch}">${escapeHtml(batch)}</button>`;
    }),
  ];
  els.batchRail.innerHTML = buttons.join("");
}

function renderFilterTabs() {
  [...els.filterTabs.querySelectorAll("button")].forEach((button) => {
    const active = button.dataset.filter === state.filter;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function findCurrent(entries) {
  if (state.day !== todayName()) return [];
  const minutes = nowMinutes();
  return entries.filter((entry) => toMinutes(entry.start) <= minutes && toMinutes(entry.end) > minutes);
}

function findNext(entries) {
  if (state.day !== todayName()) {
    return entries[0] || null;
  }
  const minutes = nowMinutes();
  return entries.find((entry) => toMinutes(entry.start) >= minutes) || null;
}

function renderNowPanel() {
  const scoped = baseEntries().sort(
    (a, b) => toMinutes(a.start) - toMinutes(b.start) || a.batch.localeCompare(b.batch),
  );
  const current = findCurrent(scoped);
  const next = findNext(scoped);
  const batchLabel = state.batch === SELECT_ALL ? "all 67 sections" : state.batch;

  if (!data.meta.availableDays.includes(state.day)) {
    els.nowPanel.innerHTML = `
      <div class="now-content">
        <span class="now-label">No routine</span>
        <div class="now-main">
          <div>
            <strong>${escapeHtml(state.day)} has no listed classes</strong>
            <span>The PDF only contains ${escapeHtml(data.meta.availableDays.join(", "))} classes.</span>
          </div>
        </div>
      </div>`;
    return;
  }

  if (!scoped.length) {
    els.nowPanel.innerHTML = `
      <div class="now-content">
        <span class="now-label">No class</span>
        <div class="now-main">
          <div>
            <strong>No classes for ${escapeHtml(batchLabel)}</strong>
            <span>Change the batch filter to see another routine.</span>
          </div>
        </div>
      </div>`;
    return;
  }

  if (current.length) {
    const headline =
      state.batch === SELECT_ALL
        ? `${current.length} classes are running now`
        : `${current[0].course} is running now`;
    const detail =
      state.batch === SELECT_ALL
        ? `${timeLabel(current[0])} across selected batches`
        : `${current[0].teacher || "Teacher TBA"} · ${current[0].room || "Room TBA"}`;
    els.nowPanel.innerHTML = `
      <div class="now-content">
        <span class="now-label">Now</span>
        <div class="now-main">
          <div>
            <strong>${escapeHtml(headline)}</strong>
            <span>${escapeHtml(detail)}</span>
          </div>
          <div class="now-time">${escapeHtml(timeLabel(current[0]))}</div>
        </div>
      </div>`;
    return;
  }

  if (next) {
    const label = state.day === todayName() ? "Next" : "First";
    const headline =
      state.batch === SELECT_ALL
        ? `${scoped.filter((entry) => entry.start === next.start).length} classes at ${formatTime(next.start)}`
        : next.course;
    const detail =
      state.batch === SELECT_ALL
        ? `${escapeHtml(state.day)} · ${escapeHtml(batchLabel)}`
        : `${next.teacher || "Teacher TBA"} · ${next.room || "Room TBA"}`;
    els.nowPanel.innerHTML = `
      <div class="now-content">
        <span class="now-label">${label}</span>
        <div class="now-main">
          <div>
            <strong>${escapeHtml(headline)}</strong>
            <span>${escapeHtml(detail)}</span>
          </div>
          <div class="now-time">${escapeHtml(timeLabel(next))}</div>
        </div>
      </div>`;
    return;
  }

  els.nowPanel.innerHTML = `
    <div class="now-content">
      <span class="now-label">Done</span>
      <div class="now-main">
        <div>
          <strong>All listed classes are finished</strong>
          <span>${escapeHtml(state.day)} routine for ${escapeHtml(batchLabel)}</span>
        </div>
      </div>
    </div>`;
}

function renderMiniSummary(entries) {
  const first = entries[0];
  const last = entries[entries.length - 1];
  const labs = entries.filter(isLab).length;
  const tba = entries.filter(isTba).length;

  els.miniSummary.innerHTML = [
    { value: entries.length, label: "Shown" },
    { value: first ? formatTime(first.start) : "-", label: "First" },
    { value: last ? formatTime(last.end) : "-", label: "Last" },
    { value: labs || tba, label: labs ? "Labs" : "TBA" },
  ]
    .map(
      (item) => `<span><strong>${escapeHtml(item.value)}</strong><small>${escapeHtml(item.label)}</small></span>`,
    )
    .join("");
}

function cardHtml(entry) {
  const current = findCurrent([entry]).length ? " current" : "";
  const lab = isLab(entry) ? " lab" : "";
  const room = entry.room || "Room TBA";
  const teacher = entry.teacher || "Teacher TBA";
  const badges = [
    entry.batch,
    isLab(entry) ? "Lab" : "",
    isTba(entry) ? "Room TBA" : "",
  ].filter(Boolean);

  const details = [
    ["Day", entry.day],
    ["Time", timeLabel(entry)],
    ["Batch", entry.batch],
    ["Teacher", teacher],
    ["Room", room],
    ["Slot", `Slot ${entry.slot}`],
    ["Program", entry.program],
  ];

  return `
    <article class="class-card${current}${lab}">
      <div class="time-box">
        <strong>${escapeHtml(formatTime(entry.start))}</strong>
        <span>${escapeHtml(formatTime(entry.end))}</span>
      </div>
      <div class="class-body">
        <div class="class-top">
          <h3 class="course">${escapeHtml(entry.course || "Course TBA")}</h3>
          <div class="class-badges">
            ${badges.map((badge) => `<span>${escapeHtml(badge)}</span>`).join("")}
          </div>
        </div>
        <div class="meta-list" aria-label="Class details">
          ${details
            .map(
              ([label, value]) => `<div class="meta-item">
                <small>${escapeHtml(label)}</small>
                <span>${escapeHtml(value)}</span>
              </div>`,
            )
            .join("")}
        </div>
      </div>
    </article>`;
}

function renderTimeline(entries) {
  els.emptyState.classList.toggle("hidden", entries.length > 0);
  els.timeline.classList.toggle("hidden", entries.length === 0);

  if (!entries.length) {
    els.timeline.innerHTML = "";
    return;
  }

  const groups = new Map();
  for (const entry of entries) {
    const key = `${entry.start}-${entry.end}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }

  els.timeline.innerHTML = [...groups.entries()]
    .map(([key, group]) => {
      const [start, end] = key.split("-");
      return `
        <div class="time-group">
          <div class="time-heading">
            <strong>${escapeHtml(formatRange(start, end))}</strong>
            <small>${group.length} ${group.length === 1 ? "class" : "classes"}</small>
          </div>
          ${group.map(cardHtml).join("")}
        </div>`;
    })
    .join("");
}

function renderTitle(entries) {
  const batch = state.batch === SELECT_ALL ? "All batches" : state.batch;
  els.scheduleTitle.textContent = `${state.day} Classes`;
  document.title = `${batch} · ${state.day} Routine`;

  const suffix = state.query ? ` matching "${state.query}"` : "";
  els.scheduleTitle.setAttribute("aria-label", `${entries.length} ${state.day} classes for ${batch}${suffix}`);
}

function render() {
  const entries = filteredEntries();
  renderDayStrip();
  renderBatchRail();
  renderFilterTabs();
  renderNowPanel();
  renderMiniSummary(entries);
  renderTitle(entries);
  renderTimeline(entries);
  saveState();
}

function bindEvents() {
  els.searchInput.addEventListener("input", (event) => {
    state.query = event.target.value;
    render();
  });

  els.batchSelect.addEventListener("change", (event) => {
    state.batch = event.target.value;
    render();
  });

  els.dayStrip.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-day]");
    if (!button) return;
    state.day = button.dataset.day;
    render();
  });

  els.batchRail.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-batch]");
    if (!button) return;
    state.batch = button.dataset.batch;
    els.batchSelect.value = state.batch;
    render();
  });

  els.filterTabs.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-filter]");
    if (!button) return;
    state.filter = button.dataset.filter;
    render();
  });

  window.setInterval(render, 60_000);
}

function registerPwa() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    });
  }

  let deferredPrompt = null;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event;
    els.installButton.classList.remove("hidden");
  });

  els.installButton.addEventListener("click", async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    els.installButton.classList.add("hidden");
  });

  window.addEventListener("appinstalled", () => {
    els.installButton.classList.add("hidden");
  });
}

function init() {
  Object.assign(els, {
    installButton: document.querySelector("#installButton"),
    heroSummary: document.querySelector("#heroSummary"),
    statClasses: document.querySelector("#statClasses"),
    statBatches: document.querySelector("#statBatches"),
    statRooms: document.querySelector("#statRooms"),
    searchInput: document.querySelector("#searchInput"),
    batchSelect: document.querySelector("#batchSelect"),
    dayStrip: document.querySelector("#dayStrip"),
    batchRail: document.querySelector("#batchRail"),
    filterTabs: document.querySelector("#filterTabs"),
    nowPanel: document.querySelector("#nowPanel"),
    miniSummary: document.querySelector("#miniSummary"),
    scheduleTitle: document.querySelector("#scheduleTitle"),
    timeline: document.querySelector("#timeline"),
    emptyState: document.querySelector("#emptyState"),
  });

  if (!data?.entries?.length) {
    els.heroSummary.textContent = "Routine data could not be loaded.";
    return;
  }

  loadSavedState();
  renderStats();
  renderBatchSelect();
  bindEvents();
  render();
  registerPwa();
}

document.addEventListener("DOMContentLoaded", init);
