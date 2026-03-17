import {
  createCalendarEvent,
  deleteCalendarEvent,
  fetchCalendarEvents,
  fetchCurrentRosterMember,
  getSessionContext,
  isSupabaseConfigured,
  onAuthStateChange,
  signInWithPassword,
  signOutCurrentUser,
  signUpForEvent,
  syncEventSignupRequirements,
  updateCalendarEvent,
  waitForSessionContext,
  withdrawFromEvent,
} from "./supabase-client.js";

const CERTIFICATIONS = ["AEMT", "EMT", "68W", "EMR"];
const CERTIFICATION_ELIGIBILITY = {
  AEMT: ["AEMT", "EMT", "68W", "EMR"],
  EMT: ["EMT", "EMR"],
  "68W": ["68W", "EMR"],
  EMR: ["EMR"],
};
const SLOT_FIELD_MAP = {
  AEMT: "slots_aemt",
  EMT: "slots_emt",
  "68W": "slots_68w",
  EMR: "slots_emr",
};

const state = {
  context: {
    user: null,
    role: "guest",
  },
  currentMember: null,
  events: [],
  displayedMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  monthInitialized: false,
  selectedEventId: new URLSearchParams(window.location.search).get("event"),
  editingId: null,
  formBusy: false,
  loginBusy: false,
  actionBusyEventId: null,
};

const authMessage = document.getElementById("calendar-auth-message");
const title = document.getElementById("calendar-title");
const calendarGrid = document.getElementById("calendar-grid");
const monthEvents = document.getElementById("month-events");
const detailModal = document.getElementById("calendar-detail-modal");
const detailContent = document.getElementById("calendar-detail-content");
const detailCloseButton = document.getElementById("calendar-detail-close");
const prevButton = document.getElementById("prev-month");
const nextButton = document.getElementById("next-month");
const adminShell = document.getElementById("calendar-admin-shell");
const adminForm = document.getElementById("calendar-event-form");
const formTitle = document.getElementById("calendar-form-title");
const formSubmit = document.getElementById("calendar-form-submit");
const cancelEdit = document.getElementById("calendar-cancel-edit");
const signupToggle = document.getElementById("calendar-signup-open");
const loginShell = document.getElementById("calendar-staff-login-shell");
const loginForm = document.getElementById("calendar-login-form");
const loginSubmit = document.getElementById("calendar-login-submit");
const sessionShell = document.getElementById("calendar-session-shell");
const sessionBadge = document.getElementById("calendar-session-badge");
const sessionTitle = document.getElementById("calendar-session-title");
const sessionCopy = document.getElementById("calendar-session-copy");
const logoutButtons = document.querySelectorAll("[data-calendar-logout]");

function parseISODate(dateString) {
  const [year, month, day] = String(dateString || "").split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

function getTodayStart() {
  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth(), today.getDate());
}

function formatDate(dateString, options) {
  return new Intl.DateTimeFormat(
    "en-US",
    options || { month: "short", day: "numeric", year: "numeric" }
  ).format(parseISODate(dateString));
}

function formatTimeRange(startTime, endTime) {
  if (!startTime || !endTime) {
    return "Time TBD";
  }

  function toReadableTime(value) {
    const hours = Number(value.slice(0, 2));
    const minutes = value.slice(2);
    const date = new Date(2000, 0, 1, hours, Number(minutes));

    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  }

  return `${toReadableTime(startTime)} - ${toReadableTime(endTime)}`;
}

function toInputTime(value) {
  const normalized = String(value || "");

  if (normalized.length !== 4) {
    return "";
  }

  return `${normalized.slice(0, 2)}:${normalized.slice(2)}`;
}

function fromInputTime(value) {
  return String(value || "").replace(":", "");
}

function slugify(value) {
  const slug = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return /^[0-9]/.test(slug) ? `tag-${slug}` : slug;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getRequirementOpenSlots(requirement) {
  const slotsNeeded = Number(requirement?.slotsNeeded || 0);
  const filledSlots = (requirement?.signups || []).length;

  return Math.max(slotsNeeded - filledSlots, 0);
}

function getEligibleRequirementForMember(event, certification) {
  const eligibleCertifications = CERTIFICATION_ELIGIBILITY[certification];

  if (!eligibleCertifications) {
    return null;
  }

  return (event.signupRequirements || [])
    .filter(
      (requirement) =>
        eligibleCertifications.includes(requirement.certification) &&
        getRequirementOpenSlots(requirement) > 0
    )
    .sort((left, right) => {
      const leftPriority = eligibleCertifications.indexOf(left.certification);
      const rightPriority = eligibleCertifications.indexOf(right.certification);

      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
      }

      return String(left.certification).localeCompare(String(right.certification));
    })[0] || null;
}

function setMessage(text, tone = "info") {
  if (!authMessage) {
    return;
  }

  if (!text) {
    authMessage.hidden = true;
    authMessage.textContent = "";
    authMessage.className = "status-banner";
    return;
  }

  authMessage.hidden = false;
  authMessage.textContent = text;
  authMessage.className = `status-banner ${tone}`;
}

function setElementVisible(element, isVisible) {
  if (!element) {
    return;
  }

  element.hidden = !isVisible;
  element.setAttribute("aria-hidden", String(!isVisible));
  element.style.display = isVisible ? "" : "none";
}

function setMetricValue(id, value) {
  const target = document.getElementById(id);

  if (target) {
    target.textContent = String(value);
  }
}

function getCurrentAccessLabel() {
  if (state.context.role === "staff") {
    return "Staff";
  }

  if (state.context.role === "member") {
    return "Member";
  }

  return "Locked";
}

function sortEvents(events) {
  return [...events].sort((left, right) => {
    const dateDelta = parseISODate(left.date) - parseISODate(right.date);

    if (dateDelta !== 0) {
      return dateDelta;
    }

    const startDelta = String(left.startTime || "").localeCompare(String(right.startTime || ""));

    if (startDelta !== 0) {
      return startDelta;
    }

    return String(left.title || "").localeCompare(String(right.title || ""));
  });
}

function getMonthEvents() {
  const year = state.displayedMonth.getFullYear();
  const month = state.displayedMonth.getMonth();

  return state.events.filter((event) => {
    const eventDate = parseISODate(event.date);
    return eventDate.getFullYear() === year && eventDate.getMonth() === month;
  });
}

function getEventById(eventId) {
  return state.events.find((event) => event.id === eventId) || null;
}

function setDisplayedMonthFromDate(dateString) {
  const eventDate = parseISODate(dateString);
  state.displayedMonth = new Date(eventDate.getFullYear(), eventDate.getMonth(), 1);
}

function getSlotSummary(event) {
  const totalSlots = (event.signupRequirements || []).reduce(
    (total, requirement) => total + Number(requirement.slotsNeeded || 0),
    0
  );
  const filledSlots = (event.signupRequirements || []).reduce(
    (total, requirement) => total + (requirement.signups || []).length,
    0
  );

  return {
    totalSlots,
    filledSlots,
    openSlots: Math.max(totalSlots - filledSlots, 0),
  };
}

function getMemberSignup(event) {
  if (!state.currentMember) {
    return null;
  }

  for (const requirement of event.signupRequirements || []) {
    const signup = (requirement.signups || []).find(
      (entry) => entry.memberId === state.currentMember.id
    );

    if (signup) {
      return {
        requirement,
        signup,
      };
    }
  }

  return null;
}

function getEventStatusTone(event) {
  const summary = getSlotSummary(event);

  if (!summary.totalSlots) {
    return "neutral";
  }

  if (!event.signupOpen) {
    return "closed";
  }

  if (!summary.openSlots) {
    return "full";
  }

  return "open";
}

function getEventStatusLabel(event) {
  const summary = getSlotSummary(event);

  if (!summary.totalSlots) {
    return "No signup required";
  }

  if (!event.signupOpen) {
    return summary.filledSlots ? "Signups closed" : "Staffing planned";
  }

  if (!summary.openSlots) {
    return "Fully staffed";
  }

  return `${summary.openSlots} slot${summary.openSlots === 1 ? "" : "s"} open`;
}

function getEventStatusShortLabel(event) {
  const summary = getSlotSummary(event);

  if (!summary.totalSlots) {
    return "Info";
  }

  if (!event.signupOpen) {
    return "Closed";
  }

  if (!summary.openSlots) {
    return "Full";
  }

  return `${summary.openSlots} open`;
}

function getMemberActionState(event) {
  const existingSignup = getMemberSignup(event);
  const summary = getSlotSummary(event);

  if (existingSignup) {
    return {
      kind: "withdraw",
      label: "Withdraw",
      note: `You are currently signed up as ${existingSignup.requirement.certification}.`,
    };
  }

  if (!summary.totalSlots) {
    return {
      kind: "info",
      label: "No signup required",
      note: "This event is on the calendar for awareness only.",
    };
  }

  if (!state.currentMember) {
    return {
      kind: "blocked",
      label: "Roster link required",
      note: "Your signed-in email must match a roster record before you can claim a slot.",
    };
  }

  if (!event.signupOpen) {
    return {
      kind: "blocked",
      label: "Signups closed",
      note: "Staff has closed new signups for this event.",
    };
  }

  const requirement = getEligibleRequirementForMember(event, state.currentMember.certification);

  if (!requirement) {
    return {
      kind: "blocked",
      label: "No eligible open slots",
      note: summary.openSlots
        ? "None of the open slots match your certification level."
        : "All staffing slots are full right now.",
    };
  }

  return {
    kind: "signup",
    label: `Claim ${requirement.certification} slot`,
    note: `${state.currentMember.name} can fill one of the open ${requirement.certification} roles.`,
  };
}

function getActionButtonClass(actionKind, compact) {
  const baseClass = actionKind === "signup" ? "button button-primary" : "button button-secondary";
  return compact ? `${baseClass} button-small` : baseClass;
}

function createPrimaryActionMarkup(event, options = {}) {
  const action = getMemberActionState(event);
  const isBusy = state.actionBusyEventId === event.id;

  if (action.kind === "signup") {
    return `
      <button
        class="${getActionButtonClass("signup", options.compact)}"
        type="button"
        data-signup-id="${escapeHtml(event.id)}"
        ${isBusy ? "disabled" : ""}
      >
        ${escapeHtml(isBusy ? "Saving..." : action.label)}
      </button>
    `;
  }

  if (action.kind === "withdraw") {
    return `
      <button
        class="${getActionButtonClass("withdraw", options.compact)}"
        type="button"
        data-withdraw-id="${escapeHtml(event.id)}"
        ${isBusy ? "disabled" : ""}
      >
        ${escapeHtml(isBusy ? "Updating..." : action.label)}
      </button>
    `;
  }

  if (!options.showDisabled) {
    return "";
  }

  return `
    <button class="${getActionButtonClass("blocked", options.compact)}" type="button" disabled>
      ${escapeHtml(action.label)}
    </button>
  `;
}

function createRequirementGroupsMarkup(event, options = {}) {
  const requirements = event.signupRequirements || [];

  if (!requirements.length) {
    return `
      <div class="signup-requirement-empty">
        <span class="muted-text">No certification-specific staffing plan is attached to this event.</span>
      </div>
    `;
  }

  return requirements
    .map((requirement) => {
      const filledCount = (requirement.signups || []).length;
      const slotsNeeded = Number(requirement.slotsNeeded || 0);
      const namesMarkup = filledCount
        ? `
          <div class="signup-member-list">
            ${requirement.signups
              .map(
                (signup) =>
                  `<span class="signup-member-pill">${escapeHtml(signup.memberName || "Assigned member")}</span>`
              )
              .join("")}
          </div>
        `
        : '<p class="signup-assignment-copy muted-text">Nobody is assigned to this role yet.</p>';

      return `
        <article class="signup-requirement-card ${options.compact ? "compact" : ""}">
          <div class="signup-requirement-head">
            <span class="category-badge ${slugify(requirement.certification)}">${escapeHtml(requirement.certification)}</span>
            <strong>${filledCount} / ${slotsNeeded} filled</strong>
          </div>
          ${namesMarkup}
        </article>
      `;
    })
    .join("");
}

function createStaffActionMarkup(event) {
  if (state.context.role !== "staff") {
    return "";
  }

  return `
    <button class="button button-secondary button-small" type="button" data-edit-id="${escapeHtml(event.id)}">Edit</button>
    <button class="button button-secondary button-small danger-button" type="button" data-delete-id="${escapeHtml(event.id)}">Delete</button>
  `;
}

function createCalendarEntryMarkup(event) {
  const selectedClass = state.selectedEventId === event.id ? " selected" : "";

  return `
    <button class="calendar-entry${selectedClass}" type="button" data-select-event-id="${escapeHtml(event.id)}">
      <span class="calendar-entry-title">${escapeHtml(event.title)}</span>
      <span class="calendar-entry-meta">
        <span class="calendar-entry-category ${slugify(event.category)}">${escapeHtml(event.category)}</span>
        <span>${escapeHtml(getEventStatusShortLabel(event))}</span>
      </span>
    </button>
  `;
}

function createMonthEventMarkup(event) {
  const action = getMemberActionState(event);
  const selectedClass = state.selectedEventId === event.id ? " selected" : "";

  return `
    <article class="timeline-card event-list-card${selectedClass}">
      <div class="timeline-date">
        <strong>${formatDate(event.date, { month: "short", day: "numeric" })}</strong>
        <span>${formatTimeRange(event.startTime, event.endTime)}</span>
      </div>
      <div class="timeline-copy">
        <div class="event-list-head">
          <span class="category-badge ${slugify(event.category)}">${escapeHtml(event.category)}</span>
          <span class="event-status-pill ${getEventStatusTone(event)}">${escapeHtml(getEventStatusLabel(event))}</span>
        </div>
        <h3>${escapeHtml(event.title)}</h3>
        <p>${escapeHtml(event.description)}</p>
        <div class="detail-list">
          <span>${escapeHtml(event.location)}</span>
          <span>${escapeHtml(formatDate(event.date))}</span>
        </div>
        <div class="signup-requirement-stack compact">
          ${createRequirementGroupsMarkup(event, { compact: true })}
        </div>
        <p class="signup-assignment-copy">${escapeHtml(action.note)}</p>
        <div class="button-row calendar-event-actions">
          ${createPrimaryActionMarkup(event, { compact: true, showDisabled: true })}
          <button class="button button-secondary button-small" type="button" data-select-event-id="${escapeHtml(event.id)}">
            ${state.selectedEventId === event.id ? "Viewing details" : "View details"}
          </button>
          ${createStaffActionMarkup(event)}
        </div>
      </div>
    </article>
  `;
}

function renderMetrics(monthlyEvents) {
  setMetricValue("calendar-total", state.events.length);
  setMetricValue("calendar-month-total", monthlyEvents.length);
  setMetricValue(
    "calendar-open-signups",
    state.events.filter((event) => event.signupOpen && getSlotSummary(event).totalSlots > 0).length
  );
  setMetricValue("calendar-access-level", getCurrentAccessLabel());
}

function renderSessionUi() {
  const hasUser = Boolean(state.context.user);
  const isStaff = state.context.role === "staff";

  setElementVisible(sessionShell, hasUser);
  setElementVisible(loginShell, hasUser && !isStaff);

  if (!hasUser || !sessionBadge || !sessionTitle || !sessionCopy) {
    if (sessionBadge) {
      sessionBadge.textContent = "";
    }

    if (sessionTitle) {
      sessionTitle.textContent = "";
    }

    if (sessionCopy) {
      sessionCopy.textContent = "";
    }

    return;
  }

  const email = state.context.user?.email || "This account";

  if (isStaff) {
    sessionBadge.textContent = "Staff Session";
    sessionBadge.className = "page-accent staff-accent";
    sessionTitle.textContent = "Editing enabled.";
    sessionCopy.textContent = `${email} is signed in as staff. Calendar changes here update event details, staffing requirements, and member signup visibility.`;
    return;
  }

  sessionBadge.textContent = "Member Session";
  sessionBadge.className = "page-accent member-accent";
  sessionTitle.textContent = "Viewing enabled.";
  sessionCopy.textContent = `${email} is signed in as a member. You can claim the highest eligible open slot for your roster certification.`;
}

function setPageUi(isStaff) {
  if (adminShell) {
    adminShell.hidden = !isStaff;
  }

  renderSessionUi();
}

function updateSelectedEventInUrl() {
  if (!window.history?.replaceState) {
    return;
  }

  const url = new URL(window.location.href);

  if (state.selectedEventId) {
    url.searchParams.set("event", state.selectedEventId);
  } else {
    url.searchParams.delete("event");
  }

  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

function closeSelectedEvent(options = {}) {
  if (!state.selectedEventId && !options.force) {
    return;
  }

  state.selectedEventId = null;
  document.body.classList.remove("calendar-modal-open");
  updateSelectedEventInUrl();

  if (!options.skipRender) {
    renderCalendar();
  }
}

function renderDetailModal() {
  const selectedEvent = getEventById(state.selectedEventId);

  if (!selectedEvent) {
    setElementVisible(detailModal, false);
    document.body.classList.remove("calendar-modal-open");
    if (detailContent) {
      detailContent.innerHTML = "";
    }

    return;
  }

  const action = getMemberActionState(selectedEvent);
  const summary = getSlotSummary(selectedEvent);
  const memberCopy = state.currentMember
    ? `${state.currentMember.name} is rostered as ${state.currentMember.certification} and can claim the highest eligible open slot for that certification.`
    : "Your signed-in account is not linked to a roster record yet.";

  setElementVisible(detailModal, true);
  document.body.classList.add("calendar-modal-open");

  detailContent.innerHTML = `
    <div class="calendar-detail-head">
      <div>
        <span class="page-accent member-accent">Event Detail</span>
        <h3 id="calendar-detail-title">${escapeHtml(selectedEvent.title)}</h3>
      </div>
      <span class="event-status-pill ${getEventStatusTone(selectedEvent)}">${escapeHtml(getEventStatusLabel(selectedEvent))}</span>
    </div>
    <p class="calendar-detail-description">${escapeHtml(selectedEvent.description)}</p>
    <div class="detail-list calendar-detail-meta">
      <span>${escapeHtml(formatDate(selectedEvent.date))}</span>
      <span>${escapeHtml(formatTimeRange(selectedEvent.startTime, selectedEvent.endTime))}</span>
      <span>${escapeHtml(selectedEvent.location)}</span>
      <span>${escapeHtml(selectedEvent.category)}</span>
    </div>
    <div class="calendar-member-panel ${state.currentMember ? "" : "warning"}">
      <strong>Member view</strong>
      <p>${escapeHtml(memberCopy)}</p>
      <p>${escapeHtml(action.note)}</p>
    </div>
    <div class="calendar-detail-section">
      <div class="calendar-detail-section-head">
        <h4>Staffing assignments</h4>
        <span class="muted-text">${summary.filledSlots} of ${summary.totalSlots} slots filled</span>
      </div>
      <div class="signup-requirement-stack">
        ${createRequirementGroupsMarkup(selectedEvent)}
      </div>
    </div>
    <div class="button-row calendar-detail-actions">
      ${createPrimaryActionMarkup(selectedEvent, { showDisabled: true })}
      ${state.context.role === "staff"
        ? `
          <button class="button button-secondary" type="button" data-edit-id="${escapeHtml(selectedEvent.id)}">Edit event</button>
          <button class="button button-secondary danger-button" type="button" data-delete-id="${escapeHtml(selectedEvent.id)}">Delete event</button>
        `
        : ""
      }
    </div>
  `;
}

function bindCalendarActions() {
  document.querySelectorAll("[data-select-event-id]").forEach((button) => {
    button.addEventListener("click", () => {
      selectEvent(button.dataset.selectEventId);
    });
  });

  document.querySelectorAll("[data-signup-id]").forEach((button) => {
    button.addEventListener("click", () => handleSignup(button.dataset.signupId));
  });

  document.querySelectorAll("[data-withdraw-id]").forEach((button) => {
    button.addEventListener("click", () => handleWithdraw(button.dataset.withdrawId));
  });

  document.querySelectorAll("[data-edit-id]").forEach((button) => {
    button.addEventListener("click", () => startEditing(button.dataset.editId));
  });

  document.querySelectorAll("[data-delete-id]").forEach((button) => {
    button.addEventListener("click", () => handleDelete(button.dataset.deleteId));
  });
}

function renderCalendar() {
  const year = state.displayedMonth.getFullYear();
  const month = state.displayedMonth.getMonth();

  if (title) {
    title.textContent = state.displayedMonth.toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    });
  }

  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);
  const startingWeekday = firstDayOfMonth.getDay();
  const totalDays = lastDayOfMonth.getDate();

  const eventMap = state.events.reduce((map, event) => {
    if (!map[event.date]) {
      map[event.date] = [];
    }

    map[event.date].push(event);
    return map;
  }, {});

  const monthlyEvents = getMonthEvents();

  if (state.selectedEventId && !getEventById(state.selectedEventId)) {
    closeSelectedEvent({ force: true, skipRender: true });
  }

  const calendarCells = [];

  for (let index = 0; index < startingWeekday; index += 1) {
    calendarCells.push('<div class="calendar-cell empty" aria-hidden="true"></div>');
  }

  for (let day = 1; day <= totalDays; day += 1) {
    const isoDate = [
      year,
      String(month + 1).padStart(2, "0"),
      String(day).padStart(2, "0"),
    ].join("-");
    const events = eventMap[isoDate] || [];
    const eventButtons = events.slice(0, 2).map(createCalendarEntryMarkup).join("");
    const overflow = events.length > 2
      ? `<span class="calendar-more">+${events.length - 2} more in list</span>`
      : "";

    calendarCells.push(`
      <article class="calendar-cell ${events.length ? "has-events" : ""}">
        <span class="calendar-day">${day}</span>
        <div class="calendar-cell-events">
          ${eventButtons}
          ${overflow}
        </div>
      </article>
    `);
  }

  if (calendarGrid) {
    calendarGrid.innerHTML = calendarCells.join("");
  }

  if (monthEvents) {
    monthEvents.innerHTML = monthlyEvents.length
      ? monthlyEvents.map(createMonthEventMarkup).join("")
      : '<p class="empty-state">No events are loaded for this month yet.</p>';
  }

  renderMetrics(monthlyEvents);
  renderDetailModal();
  bindCalendarActions();
}

function selectEvent(eventId) {
  const eventRecord = getEventById(eventId);

  if (!eventRecord) {
    return;
  }

  const eventDate = parseISODate(eventRecord.date);
  const differentMonth =
    eventDate.getFullYear() !== state.displayedMonth.getFullYear() ||
    eventDate.getMonth() !== state.displayedMonth.getMonth();

  state.selectedEventId = eventId;

  if (differentMonth) {
    state.displayedMonth = new Date(eventDate.getFullYear(), eventDate.getMonth(), 1);
  }

  updateSelectedEventInUrl();
  renderCalendar();
}

function getSignupRequirementsFromForm() {
  return CERTIFICATIONS.map((certification) => {
    const value = adminForm.elements[SLOT_FIELD_MAP[certification]].value;
    const slotsNeeded = Number(value || 0);

    return {
      certification,
      slotsNeeded: Number.isFinite(slotsNeeded) ? Math.max(0, Math.trunc(slotsNeeded)) : 0,
    };
  }).filter((requirement) => requirement.slotsNeeded > 0);
}

function resetForm() {
  state.editingId = null;
  formTitle.textContent = "Add calendar event";
  formSubmit.textContent = "Save event";
  cancelEdit.hidden = true;
  adminForm.reset();
  adminForm.elements.category.value = "Staffing";
  adminForm.elements.signup_open.checked = false;

  Object.values(SLOT_FIELD_MAP).forEach((fieldName) => {
    adminForm.elements[fieldName].value = "0";
  });
}

function startEditing(eventId) {
  if (state.context.role !== "staff") {
    return;
  }

  const eventRecord = getEventById(eventId);

  if (!eventRecord) {
    return;
  }

  const requirementMap = (eventRecord.signupRequirements || []).reduce((map, requirement) => {
    map[requirement.certification] = Number(requirement.slotsNeeded || 0);
    return map;
  }, {});

  state.editingId = eventId;
  formTitle.textContent = "Edit calendar event";
  formSubmit.textContent = "Update event";
  cancelEdit.hidden = false;

  adminForm.elements.title.value = eventRecord.title;
  adminForm.elements.date.value = eventRecord.date;
  adminForm.elements.start_time.value = toInputTime(eventRecord.startTime);
  adminForm.elements.end_time.value = toInputTime(eventRecord.endTime);
  adminForm.elements.location.value = eventRecord.location;
  adminForm.elements.category.value = eventRecord.category;
  adminForm.elements.description.value = eventRecord.description;
  adminForm.elements.signup_open.checked = eventRecord.signupOpen;

  CERTIFICATIONS.forEach((certification) => {
    adminForm.elements[SLOT_FIELD_MAP[certification]].value = String(requirementMap[certification] || 0);
  });

  closeSelectedEvent({ force: true, skipRender: true });
  renderCalendar();
  adminForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

function setFormBusy(isBusy) {
  state.formBusy = isBusy;
  formSubmit.disabled = isBusy;
  formSubmit.textContent = isBusy
    ? state.editingId
      ? "Updating..."
      : "Saving..."
    : state.editingId
      ? "Update event"
      : "Save event";
}

function setLoginBusy(isBusy) {
  state.loginBusy = isBusy;
  loginSubmit.disabled = isBusy;
  loginSubmit.textContent = isBusy ? "Signing In..." : "Sign in as staff";
}

async function refreshCurrentMember() {
  try {
    state.currentMember = await fetchCurrentRosterMember();
  } catch (error) {
    state.currentMember = null;
    console.warn("Unable to load the current member record.", error);
  }
}

async function loadCalendar(options = {}) {
  const preserveMessage = Boolean(options.preserveMessage);

  try {
    state.events = sortEvents(await fetchCalendarEvents());

    if (!state.monthInitialized) {
      const requestedEvent = getEventById(state.selectedEventId);
      const firstUpcoming = state.events.find((event) => parseISODate(event.date) >= getTodayStart());
      const initialEvent = requestedEvent || firstUpcoming || state.events[0] || null;

      if (initialEvent) {
        setDisplayedMonthFromDate(initialEvent.date);
      }

      if (requestedEvent) {
        state.selectedEventId = requestedEvent.id;
      }

      state.monthInitialized = true;
    }

    if (options.selectedEventId && getEventById(options.selectedEventId)) {
      state.selectedEventId = options.selectedEventId;
      setDisplayedMonthFromDate(getEventById(options.selectedEventId).date);
    }

    renderCalendar();

    if (!preserveMessage) {
      setMessage("");
    }
  } catch (error) {
    setMessage(
      error.message || "Unable to load the calendar. Double-check your Supabase event table and access policies.",
      "error"
    );
    state.events = [];
    renderCalendar();
  }
}

async function handleSignup(eventId) {
  if (state.actionBusyEventId) {
    return;
  }

  const eventRecord = getEventById(eventId);

  if (!eventRecord) {
    return;
  }

  try {
    state.actionBusyEventId = eventId;
    renderCalendar();
    setMessage(`Claiming a slot for ${eventRecord.title}...`, "info");
    await signUpForEvent(eventId);
    await loadCalendar({ preserveMessage: true, selectedEventId: eventId });
    setMessage(`You are signed up for ${eventRecord.title}.`, "success");
  } catch (error) {
    setMessage(error.message || "Unable to claim that slot.", "error");
  } finally {
    state.actionBusyEventId = null;
    renderCalendar();
  }
}

async function handleWithdraw(eventId) {
  if (state.actionBusyEventId) {
    return;
  }

  const eventRecord = getEventById(eventId);

  if (!eventRecord) {
    return;
  }

  try {
    state.actionBusyEventId = eventId;
    renderCalendar();
    setMessage(`Removing your signup from ${eventRecord.title}...`, "info");
    await withdrawFromEvent(eventId);
    await loadCalendar({ preserveMessage: true, selectedEventId: eventId });
    setMessage(`You were removed from ${eventRecord.title}.`, "success");
  } catch (error) {
    setMessage(error.message || "Unable to update that signup.", "error");
  } finally {
    state.actionBusyEventId = null;
    renderCalendar();
  }
}

async function handleDelete(eventId) {
  if (state.context.role !== "staff") {
    return;
  }

  const eventRecord = getEventById(eventId);

  if (!eventRecord) {
    return;
  }

  const confirmed = window.confirm(`Delete ${eventRecord.title} from the calendar?`);

  if (!confirmed) {
    return;
  }

  try {
    setMessage(`Deleting ${eventRecord.title}...`, "info");
    await deleteCalendarEvent(eventId);
    state.events = state.events.filter((entry) => entry.id !== eventId);
    state.selectedEventId = state.selectedEventId === eventId ? null : state.selectedEventId;
    resetForm();
    renderCalendar();
    setMessage(`${eventRecord.title} was removed from the calendar.`, "success");
  } catch (error) {
    setMessage(error.message || "Unable to delete that event.", "error");
  }
}

async function handleSave(event) {
  event.preventDefault();

  if (state.context.role !== "staff" || state.formBusy) {
    return;
  }

  const eventRecord = {
    title: adminForm.elements.title.value.trim(),
    date: adminForm.elements.date.value,
    startTime: fromInputTime(adminForm.elements.start_time.value),
    endTime: fromInputTime(adminForm.elements.end_time.value),
    location: adminForm.elements.location.value.trim(),
    category: adminForm.elements.category.value,
    description: adminForm.elements.description.value.trim(),
    signupOpen: adminForm.elements.signup_open.checked,
  };
  const signupRequirements = getSignupRequirementsFromForm();
  let savedBaseEvent = null;

  if (
    !eventRecord.title ||
    !eventRecord.date ||
    !eventRecord.location ||
    !eventRecord.category ||
    !eventRecord.description
  ) {
    setMessage("Complete the title, date, location, category, and description before saving.", "warning");
    return;
  }

  if ((eventRecord.startTime && !eventRecord.endTime) || (!eventRecord.startTime && eventRecord.endTime)) {
    setMessage("Enter both the start and end time, or leave both blank.", "warning");
    return;
  }

  if (eventRecord.startTime && eventRecord.endTime && eventRecord.endTime < eventRecord.startTime) {
    setMessage("End time must be after the start time.", "warning");
    return;
  }

  if (eventRecord.signupOpen && !signupRequirements.length) {
    setMessage("Open signup events need at least one requested certification slot.", "warning");
    return;
  }

  try {
    setFormBusy(true);
    setMessage(state.editingId ? "Updating event..." : "Creating event...", "info");

    if (state.editingId) {
      savedBaseEvent = await updateCalendarEvent(state.editingId, eventRecord);
    } else {
      savedBaseEvent = await createCalendarEvent(eventRecord);
    }

    const savedEvent = await syncEventSignupRequirements(savedBaseEvent.id, signupRequirements);

    if (state.editingId) {
      state.events = sortEvents(
        state.events.map((entry) => (entry.id === state.editingId ? savedEvent : entry))
      );
      setMessage(`${savedEvent.title} was updated.`, "success");
    } else {
      state.events = sortEvents([...state.events, savedEvent]);
      setMessage(`${savedEvent.title} was added to the calendar.`, "success");
    }

    setDisplayedMonthFromDate(savedEvent.date);
    state.selectedEventId = savedEvent.id;
    renderCalendar();
    resetForm();
  } catch (error) {
    if (savedBaseEvent) {
      await loadCalendar({ preserveMessage: true, selectedEventId: savedBaseEvent.id });
      setMessage(
        `${savedBaseEvent.title} was saved, but the staffing slots were not updated. ${error.message || ""}`.trim(),
        "warning"
      );
    } else {
      setMessage(error.message || "Unable to save that event.", "error");
    }
  } finally {
    setFormBusy(false);
  }
}

async function handleLogin(event) {
  event.preventDefault();

  if (state.loginBusy) {
    return;
  }

  const email = loginForm.elements.email.value.trim();
  const password = loginForm.elements.password.value;

  if (!email || !password) {
    setMessage("Enter both your email and password.", "warning");
    return;
  }

  if (!isSupabaseConfigured()) {
    setMessage("Supabase is not configured yet. Update assets/js/supabase-config.js first.", "warning");
    return;
  }

  try {
    setLoginBusy(true);
    setMessage("Signing in to staff tools...", "info");

    const { data, error } = await signInWithPassword(email, password);

    if (error) {
      throw error;
    }

    if (!data?.session && !data?.user) {
      throw new Error("Supabase did not return a usable session. Check your Auth settings for this account.");
    }

    const context = await waitForSessionContext();

    if (!context.user) {
      throw new Error("Login succeeded, but the browser session was not available yet. Try again once or refresh the page.");
    }

    state.context = context;
    await refreshCurrentMember();
    loginForm.reset();
    setPageUi(context.role === "staff");
    await loadCalendar({ preserveMessage: true });

    if (context.role === "staff") {
      setMessage("Staff login successful. Calendar editing is enabled.", "success");
    } else {
      setMessage("This account is signed in, but it does not have staff permissions. The calendar remains view-only.", "warning");
    }
  } catch (error) {
    setMessage(error.message || "Unable to sign in right now.", "error");
  } finally {
    setLoginBusy(false);
  }
}

async function handleLogout() {
  setMessage("Signing out...", "info");
  const { error } = await signOutCurrentUser();

  if (error) {
    setMessage(error.message || "Unable to sign out right now.", "error");
    return;
  }

  window.location.replace("portal.html");
}

async function initializePage() {
  renderCalendar();
  resetForm();
  setPageUi(false);

  if (!isSupabaseConfigured()) {
    setMessage(
      "Supabase is not configured yet. Update assets/js/supabase-config.js with your project URL and publishable or anon key first.",
      "warning"
    );
    return;
  }

  try {
    state.context = await getSessionContext();
    await refreshCurrentMember();
    setPageUi(state.context.role === "staff");
    await loadCalendar();
  } catch (error) {
    setPageUi(false);
    setMessage(error.message || "Unable to initialize the calendar.", "error");
  }
}

prevButton.addEventListener("click", () => {
  state.displayedMonth = new Date(
    state.displayedMonth.getFullYear(),
    state.displayedMonth.getMonth() - 1,
    1
  );
  renderCalendar();
});

nextButton.addEventListener("click", () => {
  state.displayedMonth = new Date(
    state.displayedMonth.getFullYear(),
    state.displayedMonth.getMonth() + 1,
    1
  );
  renderCalendar();
});

signupToggle.addEventListener("change", () => {
  if (!signupToggle.checked && state.editingId) {
    setMessage("New signups are closed for this event, but current assignments will still remain visible.", "info");
  }
});
loginForm.addEventListener("submit", handleLogin);
adminForm.addEventListener("submit", handleSave);
cancelEdit.addEventListener("click", resetForm);
logoutButtons.forEach((button) => button.addEventListener("click", handleLogout));

if (detailCloseButton) {
  detailCloseButton.addEventListener("click", () => closeSelectedEvent());
}

document.querySelectorAll("[data-close-event-modal]").forEach((element) => {
  element.addEventListener("click", () => closeSelectedEvent());
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && state.selectedEventId) {
    closeSelectedEvent();
  }
});

onAuthStateChange(async (context) => {
  if (!context.user) {
    return;
  }

  state.context = context;
  await refreshCurrentMember();

  if (context.role !== "staff") {
    resetForm();
  }

  setPageUi(context.role === "staff");
  await loadCalendar({ preserveMessage: true });
});

initializePage();
