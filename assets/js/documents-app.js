import { fetchDocuments, getSessionContext, uploadDocument } from "./supabase-client.js";

const ALL_DOCUMENTS_FOLDER = "__all_documents__";
const DEFAULT_FOLDER = "General";
const STATUS_TONES = new Set(["info", "success", "warning", "error"]);
const DOCUMENT_EXTENSION_PATTERN = /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt)$/i;

const state = {
  documents: [],
  selectedFolder: ALL_DOCUMENTS_FOLDER,
  uploading: false,
  initialized: false,
  role: document.body.dataset.authRole || "member",
  lastSyncedFolder: "",
};

const dom = {
  statusMessage: null,
  folderList: null,
  folderTitle: null,
  folderDescription: null,
  grid: null,
  emptyState: null,
  uploadLocked: null,
  uploadForm: null,
  uploadFile: null,
  uploadTitle: null,
  uploadDescription: null,
  uploadFolder: null,
  uploadSubmit: null,
};

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeFolderName(folderName) {
  const value = normalizeText(folderName);
  return value || DEFAULT_FOLDER;
}

function normalizeDocument(documentRecord) {
  return {
    id: String(documentRecord?.id || ""),
    title: normalizeText(documentRecord?.title) || "Untitled document",
    description: normalizeText(documentRecord?.description),
    folderName: normalizeFolderName(documentRecord?.folderName),
    fileName: normalizeText(documentRecord?.fileName),
    fileSize: Number(documentRecord?.fileSize || 0),
    contentType: normalizeText(documentRecord?.contentType),
    downloadUrl: normalizeText(documentRecord?.downloadUrl),
    uploaderName: normalizeText(documentRecord?.uploaderName),
    createdAt: normalizeText(documentRecord?.createdAt),
  };
}

function parseDate(value) {
  const parsed = value ? new Date(value) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
}

function formatDate(value) {
  const date = parseDate(value);

  if (!date) {
    return "Recently added";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatFileSize(value) {
  const size = Number(value || 0);

  if (!size) {
    return "Size unavailable";
  }

  if (size < 1024 * 1024) {
    return `${Math.max(size / 1024, 1).toFixed(1)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function pluralize(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function getSortedDocuments(documents) {
  return [...documents].sort((left, right) => {
    const leftDate = parseDate(left.createdAt)?.getTime() || 0;
    const rightDate = parseDate(right.createdAt)?.getTime() || 0;

    if (leftDate !== rightDate) {
      return rightDate - leftDate;
    }

    return String(left.title || "").localeCompare(String(right.title || ""));
  });
}

function getFolderCounts() {
  const counts = new Map();

  for (const documentRecord of state.documents) {
    const folderName = normalizeFolderName(documentRecord.folderName);
    counts.set(folderName, (counts.get(folderName) || 0) + 1);
  }

  return [...counts.entries()]
    .map(([folderName, count]) => ({ folderName, count }))
    .sort((left, right) => {
      const countDelta = right.count - left.count;

      if (countDelta !== 0) {
        return countDelta;
      }

      return left.folderName.localeCompare(right.folderName);
    });
}

function getVisibleDocuments() {
  if (state.selectedFolder === ALL_DOCUMENTS_FOLDER) {
    return getSortedDocuments(state.documents);
  }

  return getSortedDocuments(
    state.documents.filter(
      (documentRecord) => normalizeFolderName(documentRecord.folderName) === state.selectedFolder
    )
  );
}

function getSelectedFolderLabel() {
  return state.selectedFolder === ALL_DOCUMENTS_FOLDER ? "All Documents" : state.selectedFolder;
}

function getSelectedFolderSummary() {
  const totalDocuments = state.documents.length;
  const folderCounts = getFolderCounts();

  if (state.selectedFolder === ALL_DOCUMENTS_FOLDER) {
    return totalDocuments
      ? `${pluralize(totalDocuments, "document", "documents")} across ${pluralize(folderCounts.length, "folder", "folders")}.`
      : "No documents have been uploaded yet.";
  }

  const visibleDocuments = getVisibleDocuments();

  if (!visibleDocuments.length) {
    return `No documents are currently stored in ${state.selectedFolder}.`;
  }

  return `${pluralize(visibleDocuments.length, "document", "documents")} in ${state.selectedFolder}.`;
}

function setStatus(message, tone = "info") {
  if (!dom.statusMessage) {
    return;
  }

  if (!message) {
    dom.statusMessage.hidden = true;
    dom.statusMessage.textContent = "";
    dom.statusMessage.className = "status-banner";
    return;
  }

  const resolvedTone = STATUS_TONES.has(tone) ? tone : "info";
  dom.statusMessage.hidden = false;
  dom.statusMessage.textContent = message;
  dom.statusMessage.className = `status-banner ${resolvedTone}`;
}

function setBusyState(isBusy) {
  if (dom.uploadSubmit) {
    dom.uploadSubmit.disabled = isBusy;
    dom.uploadSubmit.textContent = isBusy ? "Uploading..." : "Upload document";
  }

  [dom.uploadFile, dom.uploadTitle, dom.uploadDescription, dom.uploadFolder]
    .filter(Boolean)
    .forEach((field) => {
      field.disabled = isBusy;
    });
}

function syncUploadFolderField(folderName = state.selectedFolder) {
  if (!dom.uploadFolder) {
    return;
  }

  const resolvedFolder = folderName === ALL_DOCUMENTS_FOLDER ? "" : normalizeFolderName(folderName);

  if (!dom.uploadFolder.value.trim() || dom.uploadFolder.value === state.lastSyncedFolder) {
    dom.uploadFolder.value = resolvedFolder;
  }

  state.lastSyncedFolder = resolvedFolder;
}

function setUploadAccess(role) {
  const isStaff = role === "staff";

  if (dom.uploadForm) {
    dom.uploadForm.hidden = !isStaff;
  }

  if (dom.uploadLocked) {
    dom.uploadLocked.hidden = isStaff;
  }
}

function renderFolderOptions() {
  if (!dom.folderList) {
    return;
  }

  const folders = getFolderCounts();

  dom.folderList.innerHTML = [
    `<option value="${ALL_DOCUMENTS_FOLDER}">All Documents (${state.documents.length})</option>`,
    ...folders.map(
      (folder) =>
        `<option value="${escapeHtml(folder.folderName)}">${escapeHtml(folder.folderName)} (${folder.count})</option>`
    ),
  ].join("");

  dom.folderList.value = state.selectedFolder;
}

function renderFolderHeader() {
  if (dom.folderTitle) {
    dom.folderTitle.textContent = getSelectedFolderLabel();
  }

  if (dom.folderDescription) {
    dom.folderDescription.textContent = getSelectedFolderSummary();
  }
}

function renderEmptyState(visibleCount) {
  if (!dom.emptyState) {
    return;
  }

  if (visibleCount > 0) {
    dom.emptyState.hidden = true;
    dom.emptyState.textContent = "";
    return;
  }

  dom.emptyState.hidden = false;
  dom.emptyState.textContent =
    state.selectedFolder === ALL_DOCUMENTS_FOLDER
      ? "No documents have been uploaded yet. Staff can add the first file below."
      : `No documents are stored in ${state.selectedFolder} yet.`;
}

function renderDocumentCard(documentRecord) {
  const actionMarkup = documentRecord.downloadUrl
    ? `<a class="button button-secondary" href="${escapeHtml(documentRecord.downloadUrl)}" target="_blank" rel="noreferrer">Open document</a>`
    : `<span class="button button-secondary disabled">Document unavailable</span>`;

  return `
    <article class="info-card document-record-card">
      <div class="card-topline">
        <span class="gallery-folder-chip">${escapeHtml(documentRecord.folderName)}</span>
        <span class="muted-text">${escapeHtml(formatDate(documentRecord.createdAt))}</span>
      </div>
      <h3>${escapeHtml(documentRecord.title)}</h3>
      <p>${escapeHtml(documentRecord.description || "No description provided.")}</p>
      <div class="detail-list">
        <span>${escapeHtml(documentRecord.fileName || "File name unavailable")}</span>
        <span>${escapeHtml(formatFileSize(documentRecord.fileSize))}</span>
        ${
          documentRecord.uploaderName
            ? `<span>${escapeHtml(`Uploaded by ${documentRecord.uploaderName}`)}</span>`
            : ""
        }
      </div>
      ${actionMarkup}
    </article>
  `;
}

function renderGrid() {
  if (!dom.grid) {
    return;
  }

  const visibleDocuments = getVisibleDocuments();
  dom.grid.innerHTML = visibleDocuments.map(renderDocumentCard).join("");
  renderEmptyState(visibleDocuments.length);
}

function render() {
  renderFolderOptions();
  renderFolderHeader();
  renderGrid();
  syncUploadFolderField(state.selectedFolder);
}

function selectFolder(folderName) {
  state.selectedFolder =
    folderName === ALL_DOCUMENTS_FOLDER ? ALL_DOCUMENTS_FOLDER : normalizeFolderName(folderName);
  render();
}

function upsertDocument(documentRecord) {
  const normalized = normalizeDocument(documentRecord);
  const existingIndex = state.documents.findIndex((entry) => entry.id === normalized.id);

  if (existingIndex >= 0) {
    state.documents[existingIndex] = normalized;
  } else {
    state.documents.unshift(normalized);
  }

  state.documents = getSortedDocuments(state.documents);
}

function deriveTitleFromFile(file) {
  const baseName = String(file?.name || "")
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .trim();

  return baseName
    ? baseName.replace(/\b\w/g, (character) => character.toUpperCase())
    : "";
}

function isSupportedDocumentFile(file) {
  if (!file) {
    return false;
  }

  if (String(file.type || "").startsWith("application/") || String(file.type || "").startsWith("text/")) {
    return DOCUMENT_EXTENSION_PATTERN.test(String(file.name || ""));
  }

  return DOCUMENT_EXTENSION_PATTERN.test(String(file.name || ""));
}

function resetUploadForm() {
  if (!dom.uploadForm) {
    return;
  }

  dom.uploadForm.reset();
  syncUploadFolderField(state.selectedFolder);
}

async function loadDocuments() {
  setStatus("Loading documents...", "info");

  try {
    const documents = await fetchDocuments();
    state.documents = getSortedDocuments((documents || []).map(normalizeDocument));

    if (state.selectedFolder !== ALL_DOCUMENTS_FOLDER) {
      const folderExists = state.documents.some(
        (documentRecord) => normalizeFolderName(documentRecord.folderName) === state.selectedFolder
      );

      if (!folderExists) {
        state.selectedFolder = ALL_DOCUMENTS_FOLDER;
      }
    }

    render();

    if (!state.documents.length) {
      setStatus("Documents library is empty. Staff can upload the first file below.", "warning");
    } else {
      setStatus(`Loaded ${pluralize(state.documents.length, "document", "documents")}.`, "success");
    }
  } catch (error) {
    state.documents = [];
    render();
    setStatus(error?.message || "Unable to load documents right now.", "error");
  }
}

function getUploadFolderValue() {
  const rawValue = normalizeText(dom.uploadFolder?.value);

  if (rawValue) {
    return normalizeFolderName(rawValue);
  }

  if (state.selectedFolder !== ALL_DOCUMENTS_FOLDER) {
    return state.selectedFolder;
  }

  return DEFAULT_FOLDER;
}

async function handleUploadSubmit(event) {
  event.preventDefault();

  if (state.uploading) {
    return;
  }

  if (state.role !== "staff") {
    setStatus("Only staff accounts can upload documents.", "error");
    return;
  }

  const file = dom.uploadFile?.files?.[0] || null;
  const titleValue = normalizeText(dom.uploadTitle?.value);
  const descriptionValue = normalizeText(dom.uploadDescription?.value);
  const folderValue = getUploadFolderValue();

  if (!file) {
    setStatus("Choose a document file before uploading.", "error");
    return;
  }

  if (!isSupportedDocumentFile(file)) {
    setStatus("Upload a supported document file such as PDF, Word, Excel, PowerPoint, or text.", "error");
    return;
  }

  const title = titleValue || deriveTitleFromFile(file);

  if (!title) {
    setStatus("Add a title for the document before uploading.", "error");
    return;
  }

  state.uploading = true;
  setBusyState(true);
  setStatus("Uploading document to the library...", "info");

  try {
    const uploadedDocument = await uploadDocument({
      file,
      title,
      description: descriptionValue,
      folderName: folderValue,
    });

    upsertDocument(uploadedDocument);
    state.selectedFolder = normalizeFolderName(uploadedDocument?.folderName || folderValue);
    resetUploadForm();
    render();
    setStatus(`Uploaded ${title} to ${state.selectedFolder}.`, "success");
  } catch (error) {
    setStatus(error?.message || "Unable to upload the selected document.", "error");
  } finally {
    state.uploading = false;
    setBusyState(false);
  }
}

function bindEvents() {
  if (dom.folderList) {
    dom.folderList.addEventListener("change", () => {
      selectFolder(dom.folderList.value || ALL_DOCUMENTS_FOLDER);
    });
  }

  if (dom.uploadForm) {
    dom.uploadForm.addEventListener("submit", handleUploadSubmit);
  }
}

function cacheDom() {
  dom.statusMessage = document.getElementById("documents-status-message");
  dom.folderList = document.getElementById("documents-folder-list");
  dom.folderTitle = document.getElementById("documents-folder-title");
  dom.folderDescription = document.getElementById("documents-folder-description");
  dom.grid = document.getElementById("documents-grid");
  dom.emptyState = document.getElementById("documents-empty-state");
  dom.uploadLocked = document.getElementById("documents-upload-locked");
  dom.uploadForm = document.getElementById("documents-upload-form");
  dom.uploadFile = document.getElementById("documents-upload-file");
  dom.uploadTitle = document.getElementById("documents-upload-title");
  dom.uploadDescription = document.getElementById("documents-upload-description");
  dom.uploadFolder = document.getElementById("documents-upload-folder");
  dom.uploadSubmit = document.getElementById("documents-upload-submit");
}

export async function initializeDocumentsApp() {
  if (state.initialized) {
    return () => {};
  }

  state.initialized = true;
  cacheDom();

  if (!dom.grid) {
    return () => {};
  }

  bindEvents();
  setBusyState(false);
  render();

  try {
    const context = await getSessionContext();
    state.role = context.role || state.role;
  } catch (_error) {
    state.role = document.body.dataset.authRole || state.role;
  }

  setUploadAccess(state.role);
  syncUploadFolderField("");
  await loadDocuments();

  return () => {};
}

if (document.readyState === "loading") {
  document.addEventListener(
    "DOMContentLoaded",
    () => {
      void initializeDocumentsApp();
    },
    { once: true }
  );
} else {
  void initializeDocumentsApp();
}
