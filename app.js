(() => {
  "use strict";

  const KEYS = {
    lessons: "student-hub-lessons-v2",
    deadlines: "student-hub-deadlines-v1",
    expenses: "student-hub-expenses-v1",
    pomodoro: "student-hub-pomodoro-v1",
  };

  const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  const PERIODS = [
    { num: 1, start: "08:15", end: "09:00", block: "morning", blockLabel: "上午 · Morning" },
    { num: 2, start: "09:00", end: "09:45", block: "morning", blockLabel: "上午 · Morning" },
    { num: 3, start: "10:05", end: "10:50", block: "morning", blockLabel: "上午 · Morning" },
    { num: 4, start: "10:50", end: "11:35", block: "morning", blockLabel: "上午 · Morning" },
    { num: 5, start: "13:00", end: "13:45", block: "afternoon", blockLabel: "下午 · Afternoon" },
    { num: 6, start: "13:45", end: "14:30", block: "afternoon", blockLabel: "下午 · Afternoon" },
    { num: 7, start: "14:50", end: "15:35", block: "afternoon", blockLabel: "下午 · Afternoon" },
    { num: 8, start: "15:35", end: "16:20", block: "afternoon", blockLabel: "下午 · Afternoon" },
    { num: 9, start: "16:20", end: "17:05", block: "afternoon", blockLabel: "下午 · Afternoon" },
    { num: 10, start: "18:00", end: "18:45", block: "evening", blockLabel: "晚上 · Evening" },
    { num: 11, start: "18:45", end: "19:30", block: "evening", blockLabel: "晚上 · Evening" },
    { num: 12, start: "19:50", end: "20:35", block: "evening", blockLabel: "晚上 · Evening" },
    { num: 13, start: "20:35", end: "21:20", block: "evening", blockLabel: "晚上 · Evening" },
  ];

  const COLORS = [
    "#6C5CE7",
    "#4F46E5",
    "#0EA5E9",
    "#0984E3",
    "#6366F1",
    "#8B5CF6",
    "#EC4899",
    "#64748B",
  ];

  const FOCUS_SEC = 25 * 60;
  const BREAK_SEC = 5 * 60;

  /* —— Storage helpers —— */
  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function saveJSON(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function uid() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escapeAttr(str) {
    return escapeHtml(str).replace(/'/g, "&#39;");
  }

  function periodInfo(num) {
    return PERIODS.find((p) => p.num === num);
  }

  /* —— State —— */
  /** @type {Array<{id:string,day:number,startPeriod:number,endPeriod:number,subject:string,room:string,teacher:string,color:string}>} */
  let lessons = normalizeLessons(loadJSON(KEYS.lessons, []));
  /** @type {Array<{id:string,title:string,subject:string,dueDate:string,status:string}>} */
  let deadlines = loadJSON(KEYS.deadlines, []);
  let expensesData = loadJSON(KEYS.expenses, { budget: 1000, currency: "¥", items: [] });
  let pomodoroSessions = loadJSON(KEYS.pomodoro, { sessions: 0 }).sessions || 0;

  let selectedColor = COLORS[0];
  let editingLessonId = null;
  let detailsLessonId = null;

  let pomoMode = "focus";
  let pomoRemaining = FOCUS_SEC;
  let pomoTotal = FOCUS_SEC;
  let pomoRunning = false;
  let pomoTimerId = null;

  const $ = (id) => document.getElementById(id);

  /* —— Migrate old single-slot format if present —— */
  function normalizeLessons(data) {
    if (Array.isArray(data)) {
      return data.map((l) => ({
        id: l.id || uid(),
        day: +l.day,
        startPeriod: +l.startPeriod || +l.period || 1,
        endPeriod: +l.endPeriod || +l.startPeriod || +l.period || 1,
        subject: l.subject || "",
        room: l.room || "",
        teacher: l.teacher || "",
        color: l.color || COLORS[0],
      }));
    }
    // Old object map day-period -> lesson
    if (data && typeof data === "object") {
      return Object.entries(data).map(([key, l]) => {
        const [day, period] = key.split("-").map(Number);
        return {
          id: uid(),
          day,
          startPeriod: period,
          endPeriod: period,
          subject: l.subject || "",
          room: l.room || "",
          teacher: l.teacher || "",
          color: l.color || COLORS[0],
        };
      });
    }
    return [];
  }

  function saveLessons() {
    saveJSON(KEYS.lessons, lessons);
  }

  function saveDeadlines() {
    saveJSON(KEYS.deadlines, deadlines);
  }

  function saveExpenses() {
    saveJSON(KEYS.expenses, expensesData);
  }

  function savePomodoro() {
    saveJSON(KEYS.pomodoro, { sessions: pomodoroSessions });
  }

  /* —— SPA navigation —— */
  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tabId = btn.dataset.tab;
      document.querySelectorAll(".nav-item").forEach((b) => {
        b.classList.toggle("active", b.dataset.tab === tabId);
      });
      document.querySelectorAll(".view").forEach((view) => {
        const match = view.dataset.view === tabId;
        view.classList.toggle("active", match);
        view.hidden = !match;
      });
    });
  });

  /* ===================== SCHEDULE ===================== */
  function buildPeriodOptions(selectEl) {
    selectEl.innerHTML = PERIODS.map(
      (p) =>
        `<option value="${p.num}">Period ${p.num} · ${p.start}–${p.end}</option>`
    ).join("");
  }

  function buildColorPicker() {
    const picker = $("color-picker");
    picker.innerHTML = COLORS.map(
      (c) =>
        `<button type="button" class="color-swatch" data-color="${c}" style="background:${c}" role="radio" aria-label="Color ${c}" aria-checked="false"></button>`
    ).join("");

    picker.addEventListener("click", (e) => {
      const swatch = e.target.closest(".color-swatch");
      if (!swatch) return;
      selectColor(swatch.dataset.color);
    });
  }

  function selectColor(color) {
    selectedColor = color;
    $("color-picker").querySelectorAll(".color-swatch").forEach((el) => {
      const on = el.dataset.color === color;
      el.classList.toggle("selected", on);
      el.setAttribute("aria-checked", String(on));
    });
  }

  function findLessonAt(day, period) {
    return lessons.find(
      (l) => l.day === day && period >= l.startPeriod && period <= l.endPeriod
    );
  }

  function rangesOverlap(aStart, aEnd, bStart, bEnd) {
    return aStart <= bEnd && bStart <= aEnd;
  }

  function hasConflict(day, start, end, excludeId) {
    return lessons.some(
      (l) =>
        l.id !== excludeId &&
        l.day === day &&
        rangesOverlap(start, end, l.startPeriod, l.endPeriod)
    );
  }

  function renderSchedule() {
    const body = $("schedule-body");
    const covered = new Set(); // `${day}-${period}` covered by rowspan continuation

    body.innerHTML = PERIODS.map((period) => {
      const cells = DAYS.map((_, dayIndex) => {
        const coverKey = `${dayIndex}-${period.num}`;
        if (covered.has(coverKey)) return "";

        const lesson = findLessonAt(dayIndex, period.num);
        if (lesson && lesson.startPeriod === period.num) {
          const span = lesson.endPeriod - lesson.startPeriod + 1;
          for (let p = lesson.startPeriod + 1; p <= lesson.endPeriod; p++) {
            covered.add(`${dayIndex}-${p}`);
          }
          const startP = periodInfo(lesson.startPeriod);
          const endP = periodInfo(lesson.endPeriod);
          const timeLabel =
            span > 1
              ? `${startP.start}–${endP.end}`
              : `${startP.start}–${startP.end}`;
          const roomTeacher = [lesson.room, lesson.teacher].filter(Boolean).join(" · ");
          return `
            <td class="slot slot--span" rowspan="${span}"
                style="height: calc(${span} * var(--slot-h))"
                data-lesson-id="${escapeAttr(lesson.id)}"
                data-day="${dayIndex}" data-period="${period.num}"
                tabindex="0" role="button"
                aria-label="Subject details: ${escapeAttr(lesson.subject)}">
              <div class="lesson-card" style="background:${escapeAttr(lesson.color)}">
                <span class="subject">${escapeHtml(lesson.subject)}</span>
                <span class="time-badge">${escapeHtml(timeLabel)}</span>
                ${roomTeacher ? `<span class="meta">${escapeHtml(roomTeacher)}</span>` : ""}
              </div>
            </td>`;
        }

        return `
          <td class="slot" data-day="${dayIndex}" data-period="${period.num}"
              tabindex="0" role="button"
              aria-label="Add subject: ${DAY_SHORT[dayIndex]}, Period ${period.num}">
            <div class="slot-empty">+</div>
          </td>`;
      }).join("");

      return `
        <tr>
          <td class="period-cell">
            <span class="period-num">Period ${period.num}</span>
            <span class="period-time">${period.start} – ${period.end}</span>
            <span class="period-block period-block--${period.block}">${period.blockLabel}</span>
          </td>
          ${cells}
        </tr>`;
    }).join("");
  }

  function updateSubjectTags() {
    const tags = [...new Set(lessons.map((l) => l.subject).filter(Boolean))];
    $("subject-tags").innerHTML = tags
      .map((t) => `<option value="${escapeAttr(t)}"></option>`)
      .join("");
  }

  $("schedule-body").addEventListener("click", (e) => {
    const slot = e.target.closest(".slot");
    if (!slot) return;
    if (slot.dataset.lessonId) {
      openDetails(slot.dataset.lessonId);
    } else {
      openLessonModal(+slot.dataset.day, +slot.dataset.period);
    }
  });

  $("schedule-body").addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const slot = e.target.closest(".slot");
    if (!slot) return;
    e.preventDefault();
    if (slot.dataset.lessonId) openDetails(slot.dataset.lessonId);
    else openLessonModal(+slot.dataset.day, +slot.dataset.period);
  });

  /* —— Add / Edit Subject Modal —— */
  function openLessonModal(day, period, lessonId = null) {
    const lesson = lessonId ? lessons.find((l) => l.id === lessonId) : null;
    editingLessonId = lesson ? lesson.id : null;

    $("modal-title").textContent = lesson ? "Edit Subject" : "Add Subject";
    $("lesson-day-select").value = String(lesson ? lesson.day : day);
    $("lesson-start-period").value = String(lesson ? lesson.startPeriod : period);
    $("lesson-end-period").value = String(lesson ? lesson.endPeriod : period);
    $("lesson-subject").value = lesson?.subject || "";
    $("lesson-room").value = lesson?.room || "";
    $("lesson-teacher").value = lesson?.teacher || "";
    selectColor(lesson?.color || COLORS[0]);
    $("btn-delete-lesson").hidden = !lesson;

    $("modal-overlay").hidden = false;
    document.body.style.overflow = "hidden";
    $("lesson-subject").focus();
  }

  function closeLessonModal() {
    $("modal-overlay").hidden = true;
    document.body.style.overflow = "";
    editingLessonId = null;
    $("lesson-form").reset();
  }

  $("btn-add-lesson").addEventListener("click", () => openLessonModal(0, 1));
  $("modal-close").addEventListener("click", closeLessonModal);
  $("btn-cancel").addEventListener("click", closeLessonModal);

  $("modal-overlay").addEventListener("click", (e) => {
    if (e.target === $("modal-overlay")) closeLessonModal();
  });

  $("lesson-start-period").addEventListener("change", () => {
    const start = +$("lesson-start-period").value;
    const end = +$("lesson-end-period").value;
    if (end < start) $("lesson-end-period").value = String(start);
  });

  $("lesson-end-period").addEventListener("change", () => {
    const start = +$("lesson-start-period").value;
    const end = +$("lesson-end-period").value;
    if (end < start) $("lesson-start-period").value = String(end);
  });

  $("lesson-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const day = +$("lesson-day-select").value;
    let startPeriod = +$("lesson-start-period").value;
    let endPeriod = +$("lesson-end-period").value;
    if (endPeriod < startPeriod) [startPeriod, endPeriod] = [endPeriod, startPeriod];

    const subject = $("lesson-subject").value.trim();
    if (!subject) return;

    if (hasConflict(day, startPeriod, endPeriod, editingLessonId)) {
      alert("This time range overlaps another class on the same day. Please choose different periods.");
      return;
    }

    const payload = {
      day,
      startPeriod,
      endPeriod,
      subject,
      room: $("lesson-room").value.trim(),
      teacher: $("lesson-teacher").value.trim(),
      color: selectedColor,
    };

    if (editingLessonId) {
      const idx = lessons.findIndex((l) => l.id === editingLessonId);
      if (idx !== -1) lessons[idx] = { ...lessons[idx], ...payload };
    } else {
      lessons.push({ id: uid(), ...payload });
    }

    saveLessons();
    renderSchedule();
    updateSubjectTags();
    closeLessonModal();
  });

  $("btn-delete-lesson").addEventListener("click", () => {
    if (!editingLessonId) return;
    lessons = lessons.filter((l) => l.id !== editingLessonId);
    saveLessons();
    renderSchedule();
    updateSubjectTags();
    closeLessonModal();
  });

  /* —— Subject Details Modal —— */
  function openDetails(lessonId) {
    const lesson = lessons.find((l) => l.id === lessonId);
    if (!lesson) return;
    detailsLessonId = lessonId;

    const startP = periodInfo(lesson.startPeriod);
    const endP = periodInfo(lesson.endPeriod);
    const periodLabel =
      lesson.startPeriod === lesson.endPeriod
        ? `Period ${lesson.startPeriod} (${startP.start}–${startP.end})`
        : `Periods ${lesson.startPeriod}–${lesson.endPeriod} (${startP.start}–${endP.end})`;

    const linked = deadlines.filter(
      (d) => d.subject.trim().toLowerCase() === lesson.subject.trim().toLowerCase()
    );

    const linkedHtml =
      linked.length === 0
        ? `<p class="empty-state">No linked deadlines for this subject.</p>`
        : `<ul class="item-list">${linked
            .map(
              (d) => `
            <li class="list-item ${d.status === "done" ? "done" : ""}">
              <div class="item-main">
                <span class="item-title">${escapeHtml(d.title)}</span>
                <div class="item-meta">
                  <span class="badge badge--${d.status === "done" ? "done" : "pending"}">${
                    d.status === "done" ? "Done" : "Pending"
                  }</span>
                  <span class="badge badge--sky">Due ${escapeHtml(d.dueDate)}</span>
                </div>
              </div>
            </li>`
            )
            .join("")}</ul>`;

    $("details-body").innerHTML = `
      <dl class="details-grid">
        <div class="details-row"><dt>Subject</dt><dd>${escapeHtml(lesson.subject)}</dd></div>
        <div class="details-row"><dt>Day</dt><dd>${DAYS[lesson.day]}</dd></div>
        <div class="details-row"><dt>Period</dt><dd>${escapeHtml(periodLabel)}</dd></div>
        <div class="details-row"><dt>Room</dt><dd>${escapeHtml(lesson.room || "—")}</dd></div>
        <div class="details-row"><dt>Teacher</dt><dd>${escapeHtml(lesson.teacher || "—")}</dd></div>
        <div class="details-row"><dt>Color</dt><dd><span class="details-color" style="background:${escapeAttr(
          lesson.color
        )}"></span>${escapeHtml(lesson.color)}</dd></div>
      </dl>
      <h3 class="details-section-title">Linked Deadlines</h3>
      ${linkedHtml}
    `;

    $("details-overlay").hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeDetails() {
    $("details-overlay").hidden = true;
    if ($("modal-overlay").hidden) document.body.style.overflow = "";
    detailsLessonId = null;
  }

  $("details-close").addEventListener("click", closeDetails);
  $("details-close-btn").addEventListener("click", closeDetails);
  $("details-overlay").addEventListener("click", (e) => {
    if (e.target === $("details-overlay")) closeDetails();
  });

  $("details-edit").addEventListener("click", () => {
    const id = detailsLessonId;
    closeDetails();
    if (id) {
      const lesson = lessons.find((l) => l.id === id);
      if (lesson) openLessonModal(lesson.day, lesson.startPeriod, id);
    }
  });

  $("details-delete").addEventListener("click", () => {
    if (!detailsLessonId) return;
    lessons = lessons.filter((l) => l.id !== detailsLessonId);
    saveLessons();
    renderSchedule();
    updateSubjectTags();
    closeDetails();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!$("details-overlay").hidden) closeDetails();
    else if (!$("modal-overlay").hidden) closeLessonModal();
  });

  /* ===================== DEADLINES ===================== */
  function renderDeadlines() {
    const list = $("deadline-list");
    const empty = $("deadline-empty");
    const sorted = [...deadlines].sort((a, b) => {
      if (a.status !== b.status) return a.status === "done" ? 1 : -1;
      return a.dueDate.localeCompare(b.dueDate);
    });

    $("deadline-count").textContent = `${deadlines.length} task${deadlines.length === 1 ? "" : "s"}`;
    empty.hidden = sorted.length > 0;

    list.innerHTML = sorted
      .map(
        (d) => `
      <li class="list-item ${d.status === "done" ? "done" : ""}" data-id="${escapeAttr(d.id)}">
        <div class="item-main">
          <span class="item-title">${escapeHtml(d.title)}</span>
          <div class="item-meta">
            ${d.subject ? `<span class="badge">${escapeHtml(d.subject)}</span>` : ""}
            <span class="badge badge--sky">Due ${escapeHtml(d.dueDate)}</span>
            <span class="badge badge--${d.status === "done" ? "done" : "pending"}">${
              d.status === "done" ? "Done" : "Pending"
            }</span>
          </div>
        </div>
        <div class="item-actions">
          <button class="btn btn-ghost btn-tiny" type="button" data-action="toggle">${
            d.status === "done" ? "Undo" : "Done"
          }</button>
          <button class="btn btn-danger btn-tiny" type="button" data-action="delete">Delete</button>
        </div>
      </li>`
      )
      .join("");
  }

  $("deadline-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const title = $("deadline-title").value.trim();
    const subject = $("deadline-subject").value.trim();
    const dueDate = $("deadline-due").value;
    if (!title || !dueDate) return;

    deadlines.push({ id: uid(), title, subject, dueDate, status: "pending" });
    saveDeadlines();
    renderDeadlines();
    $("deadline-form").reset();
  });

  $("deadline-list").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const item = btn.closest(".list-item");
    const id = item?.dataset.id;
    if (!id) return;

    if (btn.dataset.action === "toggle") {
      const d = deadlines.find((x) => x.id === id);
      if (d) d.status = d.status === "done" ? "pending" : "done";
    } else if (btn.dataset.action === "delete") {
      deadlines = deadlines.filter((x) => x.id !== id);
    }
    saveDeadlines();
    renderDeadlines();
  });

  /* ===================== EXPENSES ===================== */
  function formatMoney(amount) {
    const cur = expensesData.currency || "¥";
    return `${cur}${Number(amount).toFixed(2)}`;
  }

  function renderExpenses() {
    const items = expensesData.items || [];
    const spent = items.reduce((sum, i) => sum + Number(i.amount || 0), 0);
    const budget = Number(expensesData.budget) || 0;
    const remaining = budget - spent;

    $("budget-input").value = String(budget);
    $("currency-select").value = expensesData.currency || "¥";
    $("spent-value").textContent = formatMoney(spent);
    $("remaining-value").textContent = formatMoney(remaining);
    $("remaining-value").style.color = remaining < 0 ? "var(--danger)" : "";

    $("expense-count").textContent = `${items.length} item${items.length === 1 ? "" : "s"}`;
    $("expense-empty").hidden = items.length > 0;

    const sorted = [...items].sort((a, b) => b.date.localeCompare(a.date));
    $("expense-list").innerHTML = sorted
      .map(
        (item) => `
      <li class="list-item" data-id="${escapeAttr(item.id)}">
        <div class="item-main">
          <span class="item-title">${escapeHtml(item.title)}</span>
          <div class="item-meta">
            <span class="badge badge--${escapeAttr(item.category)}">${escapeHtml(item.category)}</span>
            <span class="badge badge--sky">${escapeHtml(item.date)}</span>
            <span class="badge">${formatMoney(item.amount)}</span>
          </div>
        </div>
        <div class="item-actions">
          <button class="btn btn-danger btn-tiny" type="button" data-action="delete">Delete</button>
        </div>
      </li>`
      )
      .join("");
  }

  function syncBudgetFromInputs() {
    expensesData.budget = Math.max(0, Number($("budget-input").value) || 0);
    expensesData.currency = $("currency-select").value;
    saveExpenses();
    renderExpenses();
  }

  $("budget-input").addEventListener("change", syncBudgetFromInputs);
  $("currency-select").addEventListener("change", syncBudgetFromInputs);

  $("expense-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const title = $("expense-title").value.trim();
    const amount = Number($("expense-amount").value);
    const category = $("expense-category").value;
    const date = $("expense-date").value;
    if (!title || !amount || amount <= 0 || !date) return;

    expensesData.items.push({ id: uid(), title, amount, category, date });
    saveExpenses();
    renderExpenses();
    $("expense-form").reset();
    $("expense-date").value = new Date().toISOString().slice(0, 10);
  });

  $("expense-list").addEventListener("click", (e) => {
    const btn = e.target.closest('[data-action="delete"]');
    if (!btn) return;
    const id = btn.closest(".list-item")?.dataset.id;
    if (!id) return;
    expensesData.items = expensesData.items.filter((i) => i.id !== id);
    saveExpenses();
    renderExpenses();
  });

  /* ===================== POMODORO ===================== */
  const RING_CIRCUMFERENCE = 2 * Math.PI * 88; // ≈ 552.92
  let soundEnabled = true;
  let toastTimer = null;

  function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  function updatePomodoroUI() {
    $("pomodoro-display").textContent = formatTime(pomoRemaining);
    $("pomo-mode-label").textContent = pomoMode === "focus" ? "Focus time" : "Break time";
    $("pomo-tomato").textContent = pomoMode === "focus" ? "🍅" : "☕";

    const progress = (pomoTotal - pomoRemaining) / pomoTotal;
    const offset = RING_CIRCUMFERENCE * (1 - Math.min(1, Math.max(0, progress)));
    const ring = $("pomodoro-ring");
    ring.style.strokeDasharray = String(RING_CIRCUMFERENCE);
    ring.style.strokeDashoffset = String(offset);

    const card = document.querySelector(".pomodoro-card");
    card.classList.toggle("is-break", pomoMode === "break");
    card.classList.toggle("is-running", pomoRunning);

    $("pomodoro-sessions").textContent = String(pomodoroSessions);
    $("pomodoro-start").disabled = pomoRunning;
    $("pomodoro-pause").disabled = !pomoRunning;
  }

  function setPomodoroMode(mode) {
    stopPomodoroTick();
    pomoMode = mode;
    pomoTotal = mode === "focus" ? FOCUS_SEC : BREAK_SEC;
    pomoRemaining = pomoTotal;
    pomoRunning = false;
    document.querySelectorAll(".mode-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.mode === mode);
    });
    updatePomodoroUI();
  }

  function stopPomodoroTick() {
    if (pomoTimerId) {
      clearInterval(pomoTimerId);
      pomoTimerId = null;
    }
  }

  function playSessionSound() {
    if (!soundEnabled) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const notes = [523.25, 659.25, 783.99];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.value = 0;
        osc.connect(gain);
        gain.connect(ctx.destination);
        const t = ctx.currentTime + i * 0.18;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.08, t + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
        osc.start(t);
        osc.stop(t + 0.4);
      });
      setTimeout(() => ctx.close(), 1200);
    } catch {
      /* ignore audio errors */
    }
  }

  function showSessionToast(message) {
    const toast = $("pomo-toast");
    $("pomo-toast-text").textContent = message;
    toast.hidden = false;
    requestAnimationFrame(() => toast.classList.add("show"));
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => {
        toast.hidden = true;
      }, 300);
    }, 3200);
  }

  function onSessionComplete() {
    pomoRemaining = 0;
    stopPomodoroTick();
    pomoRunning = false;
    if (pomoMode === "focus") {
      pomodoroSessions += 1;
      savePomodoro();
      showSessionToast("Focus complete! Time for a break 🍅");
    } else {
      showSessionToast("Break over — ready to focus again!");
    }
    playSessionSound();
    updatePomodoroUI();
  }

  function startPomodoro() {
    if (pomoRunning) return;
    if (pomoRemaining <= 0) pomoRemaining = pomoTotal;
    pomoRunning = true;
    updatePomodoroUI();
    pomoTimerId = setInterval(() => {
      pomoRemaining -= 1;
      if (pomoRemaining <= 0) {
        onSessionComplete();
        return;
      }
      updatePomodoroUI();
    }, 1000);
  }

  function pausePomodoro() {
    stopPomodoroTick();
    pomoRunning = false;
    updatePomodoroUI();
  }

  function resetPomodoro() {
    stopPomodoroTick();
    pomoRunning = false;
    pomoRemaining = pomoTotal;
    updatePomodoroUI();
  }

  document.querySelectorAll(".mode-btn").forEach((btn) => {
    btn.addEventListener("click", () => setPomodoroMode(btn.dataset.mode));
  });
  $("pomodoro-start").addEventListener("click", startPomodoro);
  $("pomodoro-pause").addEventListener("click", pausePomodoro);
  $("pomodoro-reset").addEventListener("click", resetPomodoro);

  $("sound-toggle").addEventListener("click", () => {
    soundEnabled = !soundEnabled;
    const btn = $("sound-toggle");
    btn.setAttribute("aria-pressed", String(soundEnabled));
    btn.textContent = soundEnabled ? "🔔 Sounds on" : "🔕 Sounds off";
  });

  // Initialize ring geometry once
  $("pomodoro-ring").style.strokeDasharray = String(RING_CIRCUMFERENCE);
  $("pomodoro-ring").style.strokeDashoffset = String(RING_CIRCUMFERENCE);

  /* —— Init —— */
  buildPeriodOptions($("lesson-start-period"));
  buildPeriodOptions($("lesson-end-period"));
  buildColorPicker();
  selectColor(COLORS[0]);
  renderSchedule();
  updateSubjectTags();
  renderDeadlines();
  renderExpenses();
  updatePomodoroUI();

  const today = new Date().toISOString().slice(0, 10);
  if (!$("expense-date").value) $("expense-date").value = today;
  if (!$("deadline-due").value) $("deadline-due").value = today;

  // One-time migrate from old schedule key
  const old = localStorage.getItem("student-hub-schedule-v1");
  if (old && lessons.length === 0) {
    try {
      const migrated = normalizeLessons(JSON.parse(old));
      if (migrated.length) {
        lessons = migrated;
        saveLessons();
        renderSchedule();
        updateSubjectTags();
      }
    } catch {
      /* ignore */
    }
  }
})();
