import {
  createCalendarEvent,
  deleteCalendarEvent,
  fetchCalendarEvents,
  getSessionContext,
  isSupabaseConfigured,
  onAuthStateChange,
  signInWithPassword,
  signOutCurrentUser,
  updateCalendarEvent,
  waitForSessionContext,
} from "./supabase-client.js";

const state = {
  context: {
    user: null,
    role: "guest",
  },
  events: [],
  displayedMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  monthInitialized: false,
  editingId: null,
  formBusy: false,
  loginBusy: false,
};

const authMessage = document.getElementById("calendar-auth-message");
const title = document.getElementById("calendar-title");
const calendarGrid = document.getElementById("calendar-grid");
const monthEvents = document.getElementById("month-events");
const prevButton = document.getElementById("prev-month");
const nextButton = document.getElementById("next-month");
const adminShell = document.getElementById("calendar-admin-shell");
const adminForm = document.getElementById("calendar-event-form");
const formTitle = document.getElementById("calendar-form-title");
const formSubmit = document.getElementById("calendar-form-submit");
const cancelEdit = document.getElementById("calendar-cancel-edit");
const signupToggle = document.getElementById("calendar-signup-open");
const signupUrlField = document.getElementById("calendar-signup-url-shell");
const signupUrlInput = document.getElementById("calendar-signup-url");
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

function renderMetrics(monthlyEvents) {
  setMetricValue("calendar-total", state.events.length);
  setMetricValue("calendar-month-total", monthlyEvents.length);
  setMetricValue(
    "calendar-open-signups",
    state.events.filter((event) => event.signupOpen).length
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
    sessionCopy.textContent = `${email} is signed in as staff. Calendar changes here also update the homepage and signup page.`;
    return;
  }

  sessionBadge.textContent = "Member Session";
  sessionBadge.className = "page-accent member-accent";
  sessionTitle.textContent = "Viewing enabled.";
  sessionCopy.textContent = `${email} is signed in as a member. Use a staff account below if you need to add, edit, or remove events.`;
}

function setPageUi(isStaff) {
  if (adminShell) {
    adminShell.hidden = !isStaff;
  }

  renderSessionUi();
}

function createMonthEventMarkup(event) {
  const signupMarkup = event.signupOpen && event.signupUrl
    ? `<a class="text-link" href="${escapeHtml(event.signupUrl)}" target="_blank" rel="noreferrer">Signup link</a>`
    : '<span class="muted-text">No signup required</span>';

  const actionMarkup = state.context.role === "staff"
    ? `
      <div class="button-row calendar-event-actions">
        <button class="button button-secondary button-small" type="button" data-edit-id="${escapeHtml(event.id)}">Edit</button>
        <button class="button button-secondary button-small danger-button" type="button" data-delete-id="${escapeHtml(event.id)}">Delete</button>
      </div>
    `
    : "";

  return `
    <article class="timeline-card">
      <div class="timeline-date">
        <strong>${formatDate(event.date, { month: "short", day: "numeric" })}</strong>
        <span>${formatTimeRange(event.startTime, event.endTime)}</span>
      </div>
      <div class="timeline-copy">
        <span class="category-badge ${slugify(event.category)}">${escapeHtml(event.category)}</span>
        <h3>${escapeHtml(event.title)}</h3>
        <p>${escapeHtml(event.description)}</p>
        <div class="detail-list">
          <span>${escapeHtml(event.location)}</span>
        </div>
        ${signupMarkup}
        ${actionMarkup}
      </div>
    </article>
  `;
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
    const eventBadges = events
      .slice(0, 2)
      .map(
        (event) =>
          `<span class="calendar-pill ${slugify(event.category)}">${escapeHtml(event.category)}</span>`
      )
      .join("");
    const overflow = events.length > 2 ? `<span class="calendar-more">+${events.length - 2}</span>` : "";

    calendarCells.push(`
      <article class="calendar-cell">
        <span class="calendar-day">${day}</span>
        <div class="calendar-cell-events">
          ${eventBadges}
          ${overflow}
        </div>
      </article>
    `);
  }

  if (calendarGrid) {
    calendarGrid.innerHTML = calendarCells.join("");
  }

  const monthlyEvents = getMonthEvents();
  renderMetrics(monthlyEvents);

  if (!monthEvents) {
    return;
  }

  monthEvents.innerHTML = monthlyEvents.length
    ? monthlyEvents.map(createMonthEventMarkup).join("")
    : '<p class="empty-state">No events are loaded for this month yet.</p>';

  monthEvents.querySelectorAll("[data-edit-id]").forEach((button) => {
    button.addEventListener("click", () => startEditing(button.dataset.editId));
  });

  monthEvents.querySelectorAll("[data-delete-id]").forEach((button) => {
    button.addEventListener("click", () => handleDelete(button.dataset.deleteId));
  });
}

function syncSignupUrlState() {
  const isOpen = Boolean(signupToggle?.checked);

  setElementVisible(signupUrlField, isOpen);

  if (signupUrlInput) {
    signupUrlInput.disabled = !isOpen;

    if (!isOpen) {
      signupUrlInput.value = "";
    }
  }
}

function resetForm() {
  state.editingId = null;
  formTitle.textContent = "Add calendar event";
  formSubmit.textContent = "Save event";
  cancelEdit.hidden = true;
  adminForm.reset();
  adminForm.elements.category.value = "Staffing";
  adminForm.elements.signup_open.checked = false;
  syncSignupUrlState();
}

function startEditing(eventId) {
  if (state.context.role !== "staff") {
    return;
  }

  const eventRecord = state.events.find((entry) => entry.id === eventId);

  if (!eventRecord) {
    return;
  }

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
  adminForm.elements.signup_url.value = eventRecord.signupUrl;
  syncSignupUrlState();
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

function setDisplayedMonthFromDate(dateString) {
  const eventDate = parseISODate(dateString);
  state.displayedMonth = new Date(eventDate.getFullYear(), eventDate.getMonth(), 1);
}

async function loadCalendar(options = {}) {
  const preserveMessage = Boolean(options.preserveMessage);

  try {
    state.events = sortEvents(await fetchCalendarEvents());

    if (!state.monthInitialized) {
      const firstUpcoming = state.events.find((event) => parseISODate(event.date) >= new Date());
      const initialDate = firstUpcoming ? parseISODate(firstUpcoming.date) : new Date();
      state.displayedMonth = new Date(initialDate.getFullYear(), initialDate.getMonth(), 1);
      state.monthInitialized = true;
    }

    renderCalendar();

    if (!preserveMessage) {
      setMessage("");
    }
  } catch (error) {
    setMessage(error.message || "Unable to load the calendar. Double-check your Supabase event table and access policies.", "error");
    state.events = [];
    renderCalendar();
  }
}

async function handleDelete(eventId) {
  if (state.context.role !== "staff") {
    return;
  }

  const eventRecord = state.events.find((entry) => entry.id === eventId);

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
    renderCalendar();
    resetForm();
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
    signupUrl: adminForm.elements.signup_url.value.trim(),
  };

  if (!eventRecord.title || !eventRecord.date || !eventRecord.location || !eventRecord.category || !eventRecord.description) {
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

  if (eventRecord.signupOpen && !eventRecord.signupUrl) {
    setMessage("Enter a signup URL for open-signup events.", "warning");
    return;
  }

  try {
    setFormBusy(true);
    setMessage(state.editingId ? "Updating event..." : "Creating event...", "info");

    if (state.editingId) {
      const updated = await updateCalendarEvent(state.editingId, eventRecord);
      state.events = sortEvents(
        state.events.map((entry) => (entry.id === state.editingId ? updated : entry))
      );
      setDisplayedMonthFromDate(updated.date);
      setMessage(`${updated.title} was updated.`, "success");
    } else {
      const created = await createCalendarEvent(eventRecord);
      state.events = sortEvents([...state.events, created]);
      setDisplayedMonthFromDate(created.date);
      setMessage(`${created.title} was added to the calendar.`, "success");
    }

    renderCalendar();
    resetForm();
  } catch (error) {
    setMessage(error.message || "Unable to save that event.", "error");
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
    setPageUi(state.context.role === "staff");
    await loadCalendar();
  } catch (error) {
    setPageUi(false);
    setMessage(error.message || "Unable to initialize the calendar.", "error");
  }
}

prevButton.addEventListener("click", () => {
  state.displayedMonth = new Date(state.displayedMonth.getFullYear(), state.displayedMonth.getMonth() - 1, 1);
  renderCalendar();
});

nextButton.addEventListener("click", () => {
  state.displayedMonth = new Date(state.displayedMonth.getFullYear(), state.displayedMonth.getMonth() + 1, 1);
  renderCalendar();
});

signupToggle.addEventListener("change", syncSignupUrlState);
loginForm.addEventListener("submit", handleLogin);
adminForm.addEventListener("submit", handleSave);
cancelEdit.addEventListener("click", resetForm);
logoutButtons.forEach((button) => button.addEventListener("click", handleLogout));

onAuthStateChange(async (context) => {
  if (!context.user) {
    return;
  }

  state.context = context;

  if (context.role !== "staff") {
    resetForm();
  }

  setPageUi(context.role === "staff");
  await loadCalendar({ preserveMessage: true });
});

initializePage();
