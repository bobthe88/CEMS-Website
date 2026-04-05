import { isSupabaseConfigured, submitServiceRequest } from "./supabase-client.js";

const DEFAULT_DAYS_AHEAD = 7;

const form = document.getElementById("request-draft-form");
const dateField = document.getElementById("request-date");
const copyButton = document.getElementById("copy-request-draft");
const submitButton = document.getElementById("submit-request-draft");
const feedback = document.getElementById("request-draft-feedback");
const titleField = document.getElementById("request-event-title");
const peopleField = document.getElementById("request-people-count");
const descriptionField = document.getElementById("request-description");

function formatDateForInput(date) {
  return date.toISOString().slice(0, 10);
}

function setFeedback(message, tone = "info") {
  if (!feedback) {
    return;
  }

  feedback.className = `status-banner ${tone} request-draft-feedback`;
  feedback.textContent = message;
}

function buildDraftText() {
  return [
    `Event title: ${String(titleField?.value || "").trim() || "N/A"}`,
    `Requested number of people: ${String(peopleField?.value || "").trim() || "N/A"}`,
    `Date: ${String(dateField?.value || "").trim() || "N/A"}`,
    `Description: ${String(descriptionField?.value || "").trim() || "N/A"}`,
  ].join("\n");
}

function setBusy(isBusy) {
  if (submitButton) {
    submitButton.disabled = isBusy;
    submitButton.textContent = isBusy ? "Submitting..." : "Submit request";
  }

  if (copyButton) {
    copyButton.disabled = isBusy;
  }
}

function initializeDefaultDate() {
  if (!dateField || dateField.value) {
    return;
  }

  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + DEFAULT_DAYS_AHEAD);
  dateField.value = formatDateForInput(nextWeek);
}

async function copyDraftToClipboard() {
  const draftText = buildDraftText();

  try {
    await navigator.clipboard.writeText(draftText);
    setFeedback("Request draft copied to clipboard.", "success");
  } catch (_error) {
    const fallbackField = document.createElement("textarea");
    fallbackField.value = draftText;
    fallbackField.setAttribute("readonly", "");
    fallbackField.style.position = "fixed";
    fallbackField.style.opacity = "0";
    document.body.appendChild(fallbackField);
    fallbackField.select();

    const copied = document.execCommand("copy");
    document.body.removeChild(fallbackField);

    setFeedback(
      copied
        ? "Request draft copied to clipboard."
        : "Clipboard access was blocked. Select the fields manually and copy the draft.",
      copied ? "success" : "warning"
    );
  }
}

async function handleSubmit(event) {
  event.preventDefault();

  if (!form || !form.reportValidity()) {
    return;
  }

  if (!isSupabaseConfigured()) {
    setFeedback("Supabase is not configured yet. Add the project URL and publishable key before submitting.", "error");
    return;
  }

  const payload = {
    eventTitle: String(titleField?.value || "").trim(),
    requestedPeople: Number(peopleField?.value || 0),
    eventDate: String(dateField?.value || "").trim(),
    description: String(descriptionField?.value || "").trim(),
    requestSource: "public-request-service-page",
  };

  setBusy(true);
  setFeedback("Submitting request to the staff queue...", "info");

  try {
    const result = await submitServiceRequest(payload);
    const requestId = result?.request?.id ? ` Reference: ${result.request.id}.` : "";
    const notificationStatus = String(result?.notificationStatus || "").toLowerCase();
    const warning = String(result?.warning || "").trim();

    if (notificationStatus === "sent") {
      setFeedback(`Request submitted and leadership was notified.${requestId}`, "success");
    } else if (notificationStatus === "partial" || notificationStatus === "not_configured") {
      setFeedback(
        warning || `Request submitted, but leadership notifications are not fully configured yet.${requestId}`,
        "warning"
      );
    } else if (notificationStatus === "failed") {
      setFeedback(
        warning || `Request submitted, but leadership notifications failed to send.${requestId}`,
        "warning"
      );
    } else {
      setFeedback(`Request submitted successfully.${requestId}`, "success");
    }
  } catch (error) {
    setFeedback(error?.message || "Unable to submit the service request right now.", "error");
  } finally {
    setBusy(false);
  }
}

function initializePage() {
  if (!form || !dateField || !copyButton || !submitButton || !feedback) {
    return;
  }

  initializeDefaultDate();
  setFeedback(feedback.textContent || "Fill out the form and submit the request to queue it for staff review.", "info");

  copyButton.addEventListener("click", () => {
    void copyDraftToClipboard();
  });

  form.addEventListener("submit", (event) => {
    void handleSubmit(event);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializePage, { once: true });
} else {
  initializePage();
}
