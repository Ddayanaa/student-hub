(() => {
  "use strict";

  const STORAGE_KEY = "student-hub-schedule-v1";

  const DAYS = [
    "Понедельник",
    "Вторник",
    "Среда",
    "Четверг",
    "Пятница",
    "Суббота",
    "Воскресенье",
  ];

  const PERIODS = [
    { num: 1, start: "08:15", end: "09:00", block: "morning", blockLabel: "上午 · Утро" },
    { num: 2, start: "09:00", end: "09:45", block: "morning", blockLabel: "上午 · Утро" },
    { num: 3, start: "10:05", end: "10:50", block: "morning", blockLabel: "上午 · Утро" },
    { num: 4, start: "10:50", end: "11:35", block: "morning", blockLabel: "上午 · Утро" },
    { num: 5, start: "13:00", end: "13:45", block: "afternoon", blockLabel: "下午 · День" },
    { num: 6, start: "13:45", end: "14:30", block: "afternoon", blockLabel: "下午 · День" },
    { num: 7, start: "14:50", end: "15:35", block: "afternoon", blockLabel: "下午 · День" },
    { num: 8, start: "15:35", end: "16:20", block: "afternoon", blockLabel: "下午 · День" },
    { num: 9, start: "16:20", end: "17:05", block: "afternoon", blockLabel: "下午 · День" },
    { num: 10, start: "18:00", end: "18:45", block: "evening", blockLabel: "晚上 · Вечер" },
    { num: 11, start: "18:45", end: "19:30", block: "evening", blockLabel: "晚上 · Вечер" },
    { num: 12, start: "19:50", end: "20:35", block: "evening", blockLabel: "晚上 · Вечер" },
    { num: 13, start: "20:35", end: "21:20", block: "evening", blockLabel: "晚上 · Вечер" },
  ];

  const COLORS = [
    "#0f6e6a",
    "#2a6f97",
    "#3d5a80",
    "#7b5ea7",
    "#c45c26",
    "#b08900",
    "#c23b3b",
    "#2d6a4f",
  ];

  /** @type {Record<string, { subject: string, room: string, teacher: string, color: string }>} */
  let lessons = loadLessons();
  let selectedColor = COLORS[0];
  let editingKey = null;

  const els = {
    navItems: document.querySelectorAll(".nav-item"),
    views: document.querySelectorAll(".view"),
    scheduleBody: document.getElementById("schedule-body"),
    btnAdd: document.getElementById("btn-add-lesson"),
    overlay: document.getElementById("modal-overlay"),
    modalTitle: document.getElementById("modal-title"),
    form: document.getElementById("lesson-form"),
    daySelect: document.getElementById("lesson-day-select"),
    periodSelect: document.getElementById("lesson-period-select"),
    subject: document.getElementById("lesson-subject"),
    room: document.getElementById("lesson-room"),
    teacher: document.getElementById("lesson-teacher"),
    colorPicker: document.getElementById("color-picker"),
    btnClose: document.getElementById("modal-close"),
    btnCancel: document.getElementById("btn-cancel"),
    btnDelete: document.getElementById("btn-delete-lesson"),
  };

  function lessonKey(day, period) {
    return `${day}-${period}`;
  }

  function loadLessons() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      const data = JSON.parse(raw);
      return data && typeof data === "object" ? data : {};
    } catch {
      return {};
    }
  }

  function saveLessons() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lessons));
  }

  /* —— SPA navigation —— */
  function switchTab(tabId) {
    els.navItems.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tab === tabId);
    });
    els.views.forEach((view) => {
      const match = view.dataset.view === tabId;
      view.classList.toggle("active", match);
      view.hidden = !match;
    });
  }

  els.navItems.forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  /* —— Schedule table —— */
  function buildPeriodSelect() {
    els.periodSelect.innerHTML = PERIODS.map(
      (p) =>
        `<option value="${p.num}">${p.num}-я · ${p.start}–${p.end} (${p.blockLabel})</option>`
    ).join("");
  }

  function buildColorPicker() {
    els.colorPicker.innerHTML = COLORS.map(
      (c) =>
        `<button type="button" class="color-swatch" data-color="${c}" style="background:${c}" role="radio" aria-label="Цвет ${c}" aria-checked="false"></button>`
    ).join("");

    els.colorPicker.addEventListener("click", (e) => {
      const swatch = e.target.closest(".color-swatch");
      if (!swatch) return;
      selectColor(swatch.dataset.color);
    });
  }

  function selectColor(color) {
    selectedColor = color;
    els.colorPicker.querySelectorAll(".color-swatch").forEach((el) => {
      const on = el.dataset.color === color;
      el.classList.toggle("selected", on);
      el.setAttribute("aria-checked", String(on));
    });
  }

  function renderSchedule() {
    els.scheduleBody.innerHTML = PERIODS.map((period) => {
      const cells = DAYS.map((_, dayIndex) => {
        const key = lessonKey(dayIndex, period.num);
        const lesson = lessons[key];
        if (lesson) {
          const meta = [lesson.room, lesson.teacher].filter(Boolean).join(" · ");
          return `
            <td class="slot" data-day="${dayIndex}" data-period="${period.num}" tabindex="0" role="button" aria-label="Редактировать: ${escapeAttr(lesson.subject)}">
              <div class="lesson-card" style="background:${escapeAttr(lesson.color)}">
                <span class="subject">${escapeHtml(lesson.subject)}</span>
                ${meta ? `<span class="meta">${escapeHtml(meta)}</span>` : ""}
              </div>
            </td>`;
        }
        return `
          <td class="slot" data-day="${dayIndex}" data-period="${period.num}" tabindex="0" role="button" aria-label="Добавить пару: ${DAYS[dayIndex]}, ${period.num}-я">
            <div class="slot-empty">+</div>
          </td>`;
      }).join("");

      return `
        <tr>
          <td class="period-cell">
            <span class="period-num">${period.num}-я пара</span>
            <span class="period-time">${period.start} – ${period.end}</span>
            <span class="period-block period-block--${period.block}">${period.blockLabel}</span>
          </td>
          ${cells}
        </tr>`;
    }).join("");
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

  els.scheduleBody.addEventListener("click", (e) => {
    const slot = e.target.closest(".slot");
    if (!slot) return;
    openModal(+slot.dataset.day, +slot.dataset.period);
  });

  els.scheduleBody.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const slot = e.target.closest(".slot");
    if (!slot) return;
    e.preventDefault();
    openModal(+slot.dataset.day, +slot.dataset.period);
  });

  /* —— Modal —— */
  function openModal(day, period) {
    const key = lessonKey(day, period);
    const existing = lessons[key];
    editingKey = existing ? key : null;

    els.modalTitle.textContent = existing ? "Редактировать пару" : "Добавить пару";
    els.daySelect.value = String(day);
    els.periodSelect.value = String(period);
    els.subject.value = existing?.subject || "";
    els.room.value = existing?.room || "";
    els.teacher.value = existing?.teacher || "";
    selectColor(existing?.color || COLORS[0]);
    els.btnDelete.hidden = !existing;

    els.overlay.hidden = false;
    document.body.style.overflow = "hidden";
    els.subject.focus();
  }

  function closeModal() {
    els.overlay.hidden = true;
    document.body.style.overflow = "";
    editingKey = null;
    els.form.reset();
  }

  function openAddModal() {
    openModal(0, 1);
  }

  els.btnAdd.addEventListener("click", openAddModal);
  els.btnClose.addEventListener("click", closeModal);
  els.btnCancel.addEventListener("click", closeModal);

  els.overlay.addEventListener("click", (e) => {
    if (e.target === els.overlay) closeModal();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !els.overlay.hidden) closeModal();
  });

  els.form.addEventListener("submit", (e) => {
    e.preventDefault();
    const day = +els.daySelect.value;
    const period = +els.periodSelect.value;
    const subject = els.subject.value.trim();
    if (!subject) return;

    const newKey = lessonKey(day, period);

    // If editing and moving to another slot that already has a lesson, overwrite that slot
    if (editingKey && editingKey !== newKey) {
      delete lessons[editingKey];
    }

    lessons[newKey] = {
      subject,
      room: els.room.value.trim(),
      teacher: els.teacher.value.trim(),
      color: selectedColor,
    };

    saveLessons();
    renderSchedule();
    closeModal();
  });

  els.btnDelete.addEventListener("click", () => {
    if (!editingKey) return;
    delete lessons[editingKey];
    saveLessons();
    renderSchedule();
    closeModal();
  });

  /* —— Init —— */
  buildPeriodSelect();
  buildColorPicker();
  selectColor(COLORS[0]);
  renderSchedule();
})();
