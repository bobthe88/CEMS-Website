import {
  fetchServiceRequests,
  isSupabaseConfigured,
  updateServiceRequestStatus,
} from "./supabase-client.js";

const state = {
  initialized: false,
  loading: false,
  requests: [],
  busyRequestId: "",
};

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(value) {
  if (!value) {
    return "Date not set";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parsed);
}

function formatPeople(value) {
  const count = Number(value || 0);
  return `${Number.isFinite(count) && count > 0 ? count : 0} people`;
}

function normalizeSectionStatus(value) {
  const status = String(value || "").trim().toLowerCase();

  if (status === "approved" || status === "denied") {
    return status;
  }

  return "pending";
}

function getDom() {
  return {
    message: document.getElementById("service-requests-message"),
    pendingCount: document.getElementById("service-requests-pending-count"),
    approvedCount: document.getElementById("service-requests-approved-count"),
    deniedCount: document.getElementById("service-requests-denied-count"),
    totalCount: document.getElementById("service-requests-total-count"),
    pendingList: document.getElementById("service-requests-pending"),
    approvedList: document.getElementById("service-requests-approved"),
    deniedList: document.getElementById("service-requests-denied"),
    refreshButton: document.getElementById("service-requests-refresh"),
    pendingCopy: document.getElementById("service-requests-pending-copy"),
    approvedCopy: document.getElementById("service-requests-approved-copy"),
    deniedCopy: document.getElementById("service-requests-denied-copy"),
  };
}

function setBanner(message, tone = "info") {
  const dom = getDom();

  if (!dom.message) {
    return;
  }

  if (!message) {
    dom.message.hidden = true;
    dom.message.textContent = "";
    return;
  }

  dom.message.hidden = false;
  dom.message.className = `status-banner ${tone}`;
  dom.message.textContent = message;
}

function setLoading(isLoading) {
  state.loading = isLoading;
  const dom = getDom();

  if (dom.refreshButton) {
    dom.refreshButton.disabled = isLoading;
    dom.refreshButton.textContent = isLoading ? "Refreshing..." : "Refresh queue";
  }
}

function getVisibleRequests(status) {
  return state.requests
    .filter((request) => normalizeSectionStatus(request.status) === status)
    .sort((left, right) => {
      const leftTime = new Date(left.createdAt || 0).getTime();
      const rightTime = new Date(right.createdAt || 0).getTime();
      return rightTime - leftTime;
    });
}

function renderEmptyState(message) {
  return `<p class="service-request-empty">${escapeHtml(message)}</p>`;
}

function renderRequestCard(request) {
  const status = normalizeSectionStatus(request.status);
  const isPending = status === "pending";
  const busy = state.busyRequestId === request.id;
  const actions = isPending
    ? `
      <div class="request-card-actions">
        <button class="button button-primary button-small" type="button" data-request-action="approve" data-request-id="${escapeHtml(request.id)}" ${busy ? "disabled" : ""}>
          ${busy ? "Approving..." : "Approve"}
        </button>
        <button class="button button-secondary button-small" type="button" data-request-action="deny" data-request-id="${escapeHtml(request.id)}" ${busy ? "disabled" : ""}>
          ${busy ? "Denying..." : "Deny"}
        </button>
      </div>
    `
    : "";

  return `
    <article class="service-request-card">
      <div class="service-request-card-head">
        <span class="request-status-pill ${status}">${status}</span>
        <span class="muted-text">${escapeHtml(formatDate(request.createdAt))}</span>
      </div>
      <h3>${escapeHtml(request.eventTitle || "Untitled request")}</h3>
      <div class="service-request-meta">
        <span>${escapeHtml(formatDate(request.eventDate))}</span>
        <span>${escapeHtml(formatPeople(request.requestedPeople))}</span>
        ${request.requesterName ? `<span>${escapeHtml(request.requesterName)}</span>` : ""}
        ${request.requesterEmail ? `<span>${escapeHtml(request.requesterEmail)}</span>` : ""}
      </div>
      <p>${escapeHtml(request.description || "No description provided.")}</p>
      ${actions}
    </article>
  `;
}

function renderLane(listElement, requests, emptyMessage) {
  if (!listElement) {
    return;
  }

  listElement.innerHTML = requests.length
    ? requests.map(renderRequestCard).join("")
    : renderEmptyState(emptyMessage);
}

function renderCounts() {
  const dom = getDom();
  const pending = getVisibleRequests("pending").length;
  const approved = getVisibleRequests("approved").length;
  const denied = getVisibleRequests("denied").length;
  const total = state.requests.length;

  if (dom.pendingCount) {
    dom.pendingCount.textContent = String(pending);
  }

  if (dom.approvedCount) {
    dom.approvedCount.textContent = String(approved);
  }

  if (dom.deniedCount) {
    dom.deniedCount.textContent = String(denied);
  }

  if (dom.totalCount) {
    dom.totalCount.textContent = String(total);
  }

  if (dom.pendingCopy) {
    dom.pendingCopy.textContent = pending
      ? `${pending} request${pending === 1 ? "" : "s"} still need a decision.`
      : "No pending requests right now.";
  }

  if (dom.approvedCopy) {
    dom.approvedCopy.textContent = approved
      ? `${approved} approved request${approved === 1 ? "" : "s"} on file.`
      : "Approved requests will appear here.";
  }

  if (dom.deniedCopy) {
    dom.deniedCopy.textContent = denied
      ? `${denied} denied request${denied === 1 ? "" : "s"} recorded.`
      : "Denied requests will appear here.";
  }
}

function renderBoard() {
  const dom = getDom();
  const pending = getVisibleRequests("pending");
  const approved = getVisibleRequests("approved");
  const denied = getVisibleRequests("denied");

  renderCounts();
  renderLane(dom.pendingList, pending, "Pending requests will appear here once they are submitted.");
  renderLane(dom.approvedList, approved, "Approved requests will appear here after staff review.");
  renderLane(dom.deniedList, denied, "Denied requests will appear here after staff review.");
}

async function loadRequests() {
  if (!isSupabaseConfigured()) {
    state.requests = [];
    renderBoard();
    setBanner("Supabase is not configured yet. Service requests cannot load until the backend is connected.", "warning");
    return;
  }

  setLoading(true);

  try {
    const requests = await fetchServiceRequests();
    state.requests = Array.isArray(requests) ? requests : [];
    renderBoard();

    setBanner(
      state.requests.length
        ? `Loaded ${state.requests.length} service request${state.requests.length === 1 ? "" : "s"}.`
        : "No service requests have been submitted yet.",
      "success"
    );
  } catch (error) {
    state.requests = [];
    renderBoard();
    setBanner(error?.message || "Unable to load service requests right now.", "error");
  } finally {
    setLoading(false);
  }
}

async function handleRequestAction(requestId, nextStatus) {
  const resolvedId = String(requestId || "").trim();

  if (!resolvedId || state.busyRequestId) {
    return;
  }

  state.busyRequestId = resolvedId;
  renderBoard();
  setBanner(`Updating request ${nextStatus} status...`, "info");

  try {
    await updateServiceRequestStatus(resolvedId, { status: nextStatus });
    await loadRequests();
    setBanner(`Request moved to ${nextStatus}.`, "success");
  } catch (error) {
    setBanner(error?.message || "Unable to update that request right now.", "error");
  } finally {
    state.busyRequestId = "";
    renderBoard();
  }
}

function bindEvents() {
  const dom = getDom();

  if (dom.refreshButton) {
    dom.refreshButton.addEventListener("click", () => {
      void loadRequests();
    });
  }

  document.addEventListener("click", (event) => {
    const trigger = event.target instanceof Element ? event.target.closest("[data-request-action]") : null;

    if (!trigger) {
      return;
    }

    const requestId = trigger.getAttribute("data-request-id") || "";
    const action = trigger.getAttribute("data-request-action") || "";

    if (action === "approve") {
      void handleRequestAction(requestId, "approved");
    } else if (action === "deny") {
      void handleRequestAction(requestId, "denied");
    }
  });
}

async function initializeServiceRequestsPage() {
  if (state.initialized) {
    return;
  }

  state.initialized = true;
  bindEvents();
  renderBoard();
  await loadRequests();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    void initializeServiceRequestsPage();
  }, { once: true });
} else {
  void initializeServiceRequestsPage();
}
