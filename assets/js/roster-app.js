import {
  createRosterMember,
  deleteRosterMember,
  fetchRosterMembers,
  getSessionContext,
  isSupabaseConfigured,
  onAuthStateChange,
  signInWithPassword,
  signOutCurrentUser,
  updateRosterMember,
  waitForSessionContext,
} from "./supabase-client.js";

const state = {
  context: {
    user: null,
    role: "guest",
  },
  members: [],
  editingId: null,
  formBusy: false,
  loginBusy: false,
};

const authMessage = document.getElementById("roster-auth-message");
const loginShell = document.getElementById("roster-staff-login-shell");
const sessionShell = document.getElementById("roster-staff-session-shell");
const sessionTitle = document.getElementById("roster-session-title");
const sessionCopy = document.getElementById("roster-session-copy");
const loginForm = document.getElementById("roster-login-form");
const loginSubmit = document.getElementById("roster-login-submit");
const metricsShell = document.getElementById("roster-metrics-shell");
const protectedShell = document.getElementById("roster-protected-shell");
const searchInput = document.getElementById("roster-search");
const certificationFilter = document.getElementById("cert-filter");
const rosterBody = document.getElementById("roster-body");
const rosterEmpty = document.getElementById("roster-empty");
const adminShell = document.getElementById("staff-admin-shell");
const adminForm = document.getElementById("staff-member-form");
const formTitle = document.getElementById("staff-form-title");
const formSubmit = document.getElementById("staff-form-submit");
const cancelEdit = document.getElementById("staff-cancel-edit");
const logoutButtons = document.querySelectorAll("[data-roster-logout]");
const staffActionsHeader = document.getElementById("staff-actions-header");

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

function normalizeMember(member) {
  return {
    id: member.id,
    name: member.name || "",
    certification: member.certification || "",
    contact: member.contact || "",
    company: member.company || "",
    class_year: member.class_year || "",
    leadership: member.leadership || "",
  };
}

function createContactMarkup(value) {
  if (!value) {
    return "";
  }

  if (value.includes("@")) {
    return `<a class="table-link" href="mailto:${value}">${value}</a>`;
  }

  const digits = value.replace(/[^0-9]/g, "");
  if (digits.length >= 10) {
    return `<a class="table-link" href="tel:${digits}">${value}</a>`;
  }

  return value;
}

function slugify(value) {
  const slug = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return /^[0-9]/.test(slug) ? `tag-${slug}` : slug;
}

function getCurrentAccessLabel() {
  if (state.context.role === "staff") {
    return "Staff";
  }

  if (state.context.role === "member") {
    return "Signed In";
  }

  return "Public";
}

function setElementVisible(element, isVisible) {
  if (!element) {
    return;
  }

  element.hidden = !isVisible;
  element.setAttribute("aria-hidden", String(!isVisible));
  element.style.display = isVisible ? "" : "none";
}

function renderStaffAuth() {
  const isStaff = state.context.role === "staff";

  setElementVisible(loginShell, !isStaff);
  setElementVisible(sessionShell, isStaff);

  if (!isStaff || !sessionTitle || !sessionCopy) {
    if (sessionTitle) {
      sessionTitle.textContent = "";
    }

    if (sessionCopy) {
      sessionCopy.textContent = "";
    }

    return;
  }

  const email = state.context.user?.email || "This account";
  sessionTitle.textContent = "Editing enabled.";
  sessionCopy.textContent = `${email} is signed in as staff. You can add, edit, and remove roster members above.`;
}

function setPageUi(isStaff) {
  metricsShell.hidden = false;
  protectedShell.hidden = false;
  adminShell.hidden = !isStaff;

  if (staffActionsHeader) {
    staffActionsHeader.hidden = !isStaff;
  }

  renderStaffAuth();
}

function getFilteredMembers() {
  const searchValue = searchInput.value.trim().toLowerCase();
  const certificationValue = certificationFilter.value;

  return state.members.filter((member) => {
    const matchesSearch = [
      member.name,
      member.contact,
      member.company,
      member.leadership,
      member.class_year,
    ]
      .join(" ")
      .toLowerCase()
      .includes(searchValue);

    const matchesCertification =
      certificationValue === "All" || member.certification === certificationValue;

    return matchesSearch && matchesCertification;
  });
}

function renderMetrics(filteredMembers) {
  document.getElementById("roster-total").textContent = String(state.members.length);
  document.getElementById("roster-visible").textContent = String(filteredMembers.length);

  const uniqueCertifications = [...new Set(state.members.map((member) => member.certification))].filter(Boolean);
  document.getElementById("roster-certifications").textContent = String(uniqueCertifications.length);
  document.getElementById("roster-access-level").textContent = getCurrentAccessLabel();
}

function renderCertificationOptions() {
  const certifications = [...new Set(state.members.map((member) => member.certification))].filter(Boolean).sort();
  const currentValue = certificationFilter.value || "All";

  certificationFilter.innerHTML = '<option value="All">All certifications</option>';
  certifications.forEach((certification) => {
    const option = document.createElement("option");
    option.value = certification;
    option.textContent = certification;
    certificationFilter.appendChild(option);
  });

  certificationFilter.value = certifications.includes(currentValue) || currentValue === "All" ? currentValue : "All";
}

function renderRoster() {
  const filteredMembers = getFilteredMembers();
  renderMetrics(filteredMembers);

  if (!filteredMembers.length) {
    rosterBody.innerHTML = "";
    rosterEmpty.hidden = false;
    return;
  }

  rosterEmpty.hidden = true;
  rosterBody.innerHTML = filteredMembers
    .map((member) => {
      const actionCell = state.context.role === "staff"
        ? `
          <td>
            <div class="action-cell">
              <button class="button button-secondary button-small" type="button" data-edit-id="${member.id}">Edit</button>
              <button class="button button-secondary button-small danger-button" type="button" data-delete-id="${member.id}">Delete</button>
            </div>
          </td>
        `
        : "";

      return `
        <tr>
          <td>${member.name}</td>
          <td><span class="category-badge ${slugify(member.certification)}">${member.certification}</span></td>
          <td>${createContactMarkup(member.contact)}</td>
          <td>${member.company}</td>
          <td>${member.class_year}</td>
          <td>${member.leadership}</td>
          ${actionCell}
        </tr>
      `;
    })
    .join("");

  rosterBody.querySelectorAll("[data-edit-id]").forEach((button) => {
    button.addEventListener("click", () => startEditing(button.dataset.editId));
  });

  rosterBody.querySelectorAll("[data-delete-id]").forEach((button) => {
    button.addEventListener("click", () => handleDelete(button.dataset.deleteId));
  });
}

function resetForm() {
  state.editingId = null;
  formTitle.textContent = "Add roster member";
  formSubmit.textContent = "Save member";
  cancelEdit.hidden = true;
  adminForm.reset();
  adminForm.elements.certification.value = "EMT";
}

function startEditing(memberId) {
  if (state.context.role !== "staff") {
    return;
  }

  const member = state.members.find((entry) => entry.id === memberId);
  if (!member) {
    return;
  }

  state.editingId = memberId;
  formTitle.textContent = "Edit roster member";
  formSubmit.textContent = "Update member";
  cancelEdit.hidden = false;

  adminForm.elements.name.value = member.name;
  adminForm.elements.certification.value = member.certification;
  adminForm.elements.contact.value = member.contact;
  adminForm.elements.company.value = member.company;
  adminForm.elements.class_year.value = member.class_year;
  adminForm.elements.leadership.value = member.leadership;
  adminForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

function setEditorBusy(isBusy) {
  state.formBusy = isBusy;
  formSubmit.disabled = isBusy;
  formSubmit.textContent = isBusy
    ? state.editingId
      ? "Updating..."
      : "Saving..."
    : state.editingId
      ? "Update member"
      : "Save member";
}

function setLoginBusy(isBusy) {
  state.loginBusy = isBusy;
  loginSubmit.disabled = isBusy;
  loginSubmit.textContent = isBusy ? "Signing In..." : "Sign in as staff";
}

async function loadRoster(options = {}) {
  const preserveMessage = Boolean(options.preserveMessage);

  try {
    const rows = await fetchRosterMembers();
    state.members = rows.map(normalizeMember);
    renderCertificationOptions();
    renderRoster();

    if (!preserveMessage) {
      setMessage("");
    }
  } catch (error) {
    const guestFallback = "Unable to load the public roster. Re-run supabase/setup.sql so anonymous roster viewing is enabled.";
    const memberFallback = "Unable to load the roster. Double-check your Supabase tables and policies.";

    setMessage(error.message || (state.context.user ? memberFallback : guestFallback), "error");
    state.members = [];
    renderCertificationOptions();
    renderRoster();
  }
}

async function handleDelete(memberId) {
  if (state.context.role !== "staff") {
    return;
  }

  const member = state.members.find((entry) => entry.id === memberId);
  if (!member) {
    return;
  }

  const confirmed = window.confirm(`Delete ${member.name} from the roster?`);
  if (!confirmed) {
    return;
  }

  try {
    setMessage(`Deleting ${member.name}...`, "info");
    await deleteRosterMember(memberId);
    state.members = state.members.filter((entry) => entry.id !== memberId);
    renderCertificationOptions();
    renderRoster();
    resetForm();
    setMessage(`${member.name} was removed from the roster.`, "success");
  } catch (error) {
    setMessage(error.message || "Unable to delete that roster entry.", "error");
  }
}

async function handleSave(event) {
  event.preventDefault();

  if (state.context.role !== "staff" || state.formBusy) {
    return;
  }

  const member = {
    name: adminForm.elements.name.value.trim(),
    certification: adminForm.elements.certification.value,
    contact: adminForm.elements.contact.value.trim(),
    company: adminForm.elements.company.value.trim(),
    class_year: adminForm.elements.class_year.value.trim(),
    leadership: adminForm.elements.leadership.value.trim() || "Member",
  };

  if (!member.name || !member.contact || !member.company || !member.class_year || !member.certification) {
    setMessage("Complete every roster field before saving.", "warning");
    return;
  }

  try {
    setEditorBusy(true);
    setMessage(state.editingId ? "Updating roster member..." : "Creating roster member...", "info");

    if (state.editingId) {
      const updated = normalizeMember(await updateRosterMember(state.editingId, member));
      state.members = state.members
        .map((entry) => (entry.id === state.editingId ? updated : entry))
        .sort((left, right) => left.name.localeCompare(right.name));
      setMessage(`${updated.name} was updated.`, "success");
    } else {
      const created = normalizeMember(await createRosterMember(member));
      state.members = [...state.members, created].sort((left, right) => left.name.localeCompare(right.name));
      setMessage(`${created.name} was added to the roster.`, "success");
    }

    renderCertificationOptions();
    renderRoster();
    resetForm();
  } catch (error) {
    setMessage(error.message || "Unable to save that roster entry.", "error");
  } finally {
    setEditorBusy(false);
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
    setMessage(
      "Supabase is not configured yet. Update assets/js/supabase-config.js first.",
      "warning"
    );
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
    resetForm();
    setPageUi(context.role === "staff");
    await loadRoster({ preserveMessage: true });

    if (context.role === "staff") {
      setMessage("Staff login successful. Editing is enabled.", "success");
    } else {
      setMessage("This account is signed in, but it does not have staff permissions. The roster remains view-only.", "warning");
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

  state.context = {
    user: null,
    role: "guest",
  };
  loginForm.reset();
  resetForm();
  setPageUi(false);
  window.location.replace("roster.html");
}

async function initializePage() {
  renderCertificationOptions();
  renderRoster();
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
    await loadRoster();
  } catch (error) {
    setPageUi(false);
    setMessage(error.message || "Unable to initialize the roster.", "error");
  }
}

searchInput.addEventListener("input", renderRoster);
certificationFilter.addEventListener("change", renderRoster);
loginForm.addEventListener("submit", handleLogin);
adminForm.addEventListener("submit", handleSave);
cancelEdit.addEventListener("click", resetForm);
logoutButtons.forEach((button) => button.addEventListener("click", handleLogout));

onAuthStateChange(async (context) => {
  state.context = context;

  if (context.role !== "staff") {
    resetForm();
  }

  setPageUi(context.role === "staff");
  await loadRoster({ preserveMessage: true });
});

initializePage();
