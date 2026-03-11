import {
  createRosterMember,
  deleteRosterMember,
  fetchRosterMembers,
  getSessionContext,
  isSupabaseConfigured,
  onAuthStateChange,
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
  busy: false,
};

const authMessage = document.getElementById("roster-auth-message");
const accessBadge = document.getElementById("roster-access-badge");
const accessSummary = document.getElementById("roster-access-summary");
const accessActions = document.getElementById("roster-access-actions");
const searchInput = document.getElementById("roster-search");
const certificationFilter = document.getElementById("cert-filter");
const rosterBody = document.getElementById("roster-body");
const rosterEmpty = document.getElementById("roster-empty");
const protectedShell = document.getElementById("roster-protected-shell");
const lockedShell = document.getElementById("roster-locked-shell");
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

  authMessage.hidden = !text;
  authMessage.textContent = text || "";
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
  document.getElementById("roster-access-level").textContent =
    state.context.role === "staff" ? "Staff" : state.context.role === "member" ? "Member" : "Locked";
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

function setBusy(isBusy) {
  state.busy = isBusy;
  formSubmit.disabled = isBusy;
  formSubmit.textContent = isBusy
    ? state.editingId
      ? "Updating..."
      : "Saving..."
    : state.editingId
      ? "Update member"
      : "Save member";
}

function renderAccessState() {
  const isAuthenticated = Boolean(state.context.user);
  const isStaff = state.context.role === "staff";

  protectedShell.hidden = !isAuthenticated;
  lockedShell.hidden = isAuthenticated;
  adminShell.hidden = !isStaff;
  if (staffActionsHeader) {
    staffActionsHeader.hidden = !isStaff;
  }

  accessBadge.textContent = isAuthenticated
    ? isStaff
      ? "Staff Access"
      : "Member Access"
    : "Login Required";
  accessBadge.className = `page-accent ${isStaff ? "staff-accent" : isAuthenticated ? "member-accent" : ""}`.trim();

  if (!isAuthenticated) {
    accessSummary.textContent =
      "The roster is now protected behind Supabase authentication. Members can view the directory after signing in. Staff can also edit it directly on the site.";
    accessActions.innerHTML = '<a class="button button-primary" href="portal.html">Open member and staff portal</a>';
    return;
  }

  accessSummary.textContent = isStaff
    ? `Signed in as ${state.context.user.email}. Staff accounts can create, update, and delete roster records.`
    : `Signed in as ${state.context.user.email}. Member accounts have read-only access to the protected roster.`;
  accessActions.innerHTML = `
    <a class="button button-secondary" href="portal.html">Back to portal</a>
    <button class="button button-primary" type="button" data-inline-logout>Sign out</button>
  `;

  const inlineLogout = accessActions.querySelector("[data-inline-logout]");
  if (inlineLogout) {
    inlineLogout.addEventListener("click", handleLogout);
  }
}

async function loadRoster() {
  if (!state.context.user) {
    state.members = [];
    renderRoster();
    return;
  }

  try {
    setMessage("Loading roster from Supabase...", "info");
    const rows = await fetchRosterMembers();
    state.members = rows.map(normalizeMember);
    renderCertificationOptions();
    renderRoster();
    setMessage(
      state.context.role === "staff"
        ? "Roster loaded. Staff controls are ready below."
        : "Roster loaded. You have read-only member access.",
      "success"
    );
  } catch (error) {
    setMessage(
      error.message || "Unable to load the roster. Double-check your Supabase tables and RLS policies.",
      "error"
    );
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

  if (state.context.role !== "staff" || state.busy) {
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
    setBusy(true);
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
    setBusy(false);
  }
}

async function handleLogout() {
  setMessage("Signing out...", "info");
  const { error } = await signOutCurrentUser();

  if (error) {
    setMessage(error.message || "Unable to sign out right now.", "error");
    return;
  }

  window.location.href = "portal.html";
}

async function initializePage() {
  if (!isSupabaseConfigured()) {
    renderAccessState();
    protectedShell.hidden = true;
    lockedShell.hidden = false;
    setMessage(
      "Supabase is not configured yet. Update assets/js/supabase-config.js with your project URL and publishable or anon key first.",
      "warning"
    );
    return;
  }

  try {
    const pendingPortalRedirect = window.sessionStorage.getItem("cems-auth-return") === "1";
    state.context = pendingPortalRedirect
      ? await waitForSessionContext({ timeoutMs: 3000, intervalMs: 175 })
      : await getSessionContext();
    window.sessionStorage.removeItem("cems-auth-return");
    renderAccessState();
    renderCertificationOptions();

    if (!state.context.user) {
      setMessage("Sign in through the portal to access the protected roster.", "info");
      renderRoster();
      return;
    }

    await loadRoster();
  } catch (error) {
    setMessage(error.message || "Unable to initialize the protected roster.", "error");
  }
}

searchInput.addEventListener("input", renderRoster);
certificationFilter.addEventListener("change", renderRoster);
adminForm.addEventListener("submit", handleSave);
cancelEdit.addEventListener("click", resetForm);
logoutButtons.forEach((button) => button.addEventListener("click", handleLogout));

onAuthStateChange(async (context) => {
  state.context = context;
  resetForm();
  renderAccessState();

  if (context.user) {
    await loadRoster();
  } else {
    state.members = [];
    renderCertificationOptions();
    renderRoster();
  }
});

resetForm();
renderCertificationOptions();
renderRoster();
initializePage();






