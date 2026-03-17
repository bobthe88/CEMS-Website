import { deleteGalleryPhoto, fetchGalleryPhotos, updateGalleryPhotoAboutSlot, uploadGalleryPhoto } from "./supabase-client.js";

const ALL_PHOTOS_FOLDER = "__all_photos__";
const UNSORTED_FOLDER = "Unsorted";
const NEW_FOLDER_OPTION = "__new_folder__";
const STATUS_TONES = new Set(["info", "success", "warning", "error"]);

const state = {
  photos: [],
  selectedFolder: ALL_PHOTOS_FOLDER,
  role: document.body.dataset.authRole || "member",
  loading: false,
  uploading: false,
  error: "",
  initialized: false,
  lastSyncedFolder: ALL_PHOTOS_FOLDER,
  optimisticPreviewUrl: "",
  activeAboutSlotPhotoId: "",
  activeDeletePhotoId: "",
};

const dom = {
  statusMessage: null,
  folderList: null,
  folderTitle: null,
  folderDescription: null,
  grid: null,
  emptyState: null,
  uploadForm: null,
  uploadFile: null,
  uploadTitle: null,
  uploadDescription: null,
  uploadFolder: null,
  uploadFolderCustomField: null,
  uploadFolderCustom: null,
  uploadSubmit: null,
  uploadLocked: null,
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
  return value || UNSORTED_FOLDER;
}

function normalizePhoto(photo) {
  return {
    id: String(photo?.id || ""),
    title: normalizeText(photo?.title) || "Untitled photo",
    description: normalizeText(photo?.description),
    imageUrl: normalizeText(photo?.imageUrl),
    folderName: normalizeFolderName(photo?.folderName),
    aboutFeatureSlot: photo?.aboutFeatureSlot == null ? null : Number(photo.aboutFeatureSlot),
    createdAt: normalizeText(photo?.createdAt),
    uploaderName: normalizeText(photo?.uploaderName),
  };
}

function isPendingPhotoId(photoId) {
  return normalizeText(photoId).startsWith("pending-");
}

function parseDate(value) {
  const parsed = value ? new Date(value) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
}

function formatDateTime(value) {
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

function pluralize(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function getSortedPhotos(photos) {
  return [...photos].sort((left, right) => {
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

  for (const photo of state.photos) {
    const folderName = normalizeFolderName(photo.folderName);
    counts.set(folderName, (counts.get(folderName) || 0) + 1);
  }

  return [...counts.entries()]
    .map(([folderName, count]) => ({ folderName, count }))
    .sort((left, right) => {
      if (left.folderName === UNSORTED_FOLDER) {
        return 1;
      }

      if (right.folderName === UNSORTED_FOLDER) {
        return -1;
      }

      const countDelta = right.count - left.count;
      if (countDelta !== 0) {
        return countDelta;
      }

      return left.folderName.localeCompare(right.folderName);
    });
}

function getVisiblePhotos() {
  if (state.selectedFolder === ALL_PHOTOS_FOLDER) {
    return getSortedPhotos(state.photos);
  }

  return getSortedPhotos(
    state.photos.filter((photo) => normalizeFolderName(photo.folderName) === state.selectedFolder)
  );
}

function getSelectedFolderLabel() {
  if (state.selectedFolder === ALL_PHOTOS_FOLDER) {
    return "All Photos";
  }

  return state.selectedFolder;
}

function getSelectedFolderSummary() {
  const totalPhotos = state.photos.length;
  const folderCounts = getFolderCounts();

  if (state.selectedFolder === ALL_PHOTOS_FOLDER) {
    return totalPhotos
      ? `${pluralize(totalPhotos, "photo", "photos")} across ${pluralize(folderCounts.length, "folder", "folders")}.`
      : "No gallery photos have been uploaded yet.";
  }

  const visiblePhotos = getVisiblePhotos();

  if (!visiblePhotos.length) {
    return `No photos are currently stored in ${state.selectedFolder}.`;
  }

  return `${pluralize(visiblePhotos.length, "photo", "photos")} in ${state.selectedFolder}.`;
}

function setStatus(message, tone = "info") {
  if (!dom.statusMessage) {
    return;
  }

  if (!message) {
    dom.statusMessage.hidden = true;
    dom.statusMessage.textContent = "";
    dom.statusMessage.className = "status-banner";
    dom.statusMessage.removeAttribute("role");
    dom.statusMessage.removeAttribute("aria-live");
    return;
  }

  const resolvedTone = STATUS_TONES.has(tone) ? tone : "info";
  dom.statusMessage.hidden = false;
  dom.statusMessage.textContent = message;
  dom.statusMessage.className = `status-banner ${resolvedTone}`;
  dom.statusMessage.setAttribute("role", resolvedTone === "error" ? "alert" : "status");
  dom.statusMessage.setAttribute("aria-live", resolvedTone === "error" ? "assertive" : "polite");
}

function setBusyState(isBusy) {
  if (dom.uploadSubmit) {
    dom.uploadSubmit.disabled = isBusy;
    dom.uploadSubmit.textContent = isBusy ? "Uploading..." : "Upload photo";
  }

  const controls = [
    dom.uploadFile,
    dom.uploadTitle,
    dom.uploadDescription,
    dom.uploadFolder,
    dom.uploadFolderCustom,
  ].filter(Boolean);

  controls.forEach((control) => {
    control.disabled = isBusy;
  });
}

function setUploadAccess(role = state.role) {
  const isStaff = role === "staff";

  if (dom.uploadForm) {
    dom.uploadForm.hidden = !isStaff;
  }

  if (dom.uploadLocked) {
    dom.uploadLocked.hidden = isStaff;
  }
}

function setUploadFolderMode() {
  if (!dom.uploadFolderCustomField || !dom.uploadFolder) {
    return;
  }

  const isCustomFolder = dom.uploadFolder.value === NEW_FOLDER_OPTION;
  dom.uploadFolderCustomField.hidden = !isCustomFolder;

  if (dom.uploadFolderCustom) {
    dom.uploadFolderCustom.required = isCustomFolder;

    if (!isCustomFolder && dom.uploadFolderCustom.value) {
      dom.uploadFolderCustom.value = "";
    }
  }
}

function syncUploadFolderField(folderName = state.selectedFolder) {
  if (!dom.uploadFolder) {
    return;
  }

  const resolvedFolder =
    folderName === ALL_PHOTOS_FOLDER ? "" : normalizeFolderName(folderName);
  const currentValue = String(dom.uploadFolder.value || "").trim();

  if (dom.uploadFolder.tagName === "SELECT") {
    const shouldSync = !currentValue || currentValue === state.lastSyncedFolder;

    if (shouldSync) {
      const optionExists = [...dom.uploadFolder.options].some((option) => option.value === resolvedFolder);

      if (resolvedFolder && optionExists) {
        dom.uploadFolder.value = resolvedFolder;
      } else if (resolvedFolder) {
        dom.uploadFolder.value = NEW_FOLDER_OPTION;
        if (dom.uploadFolderCustom) {
          dom.uploadFolderCustom.value = resolvedFolder;
        }
      } else {
        dom.uploadFolder.value = "";
      }
    }
  } else if (typeof dom.uploadFolder.value === "string") {
    if (!dom.uploadFolder.value.trim() || dom.uploadFolder.value === state.lastSyncedFolder) {
      dom.uploadFolder.value = resolvedFolder;
    }
  }

  setUploadFolderMode();
  state.lastSyncedFolder = resolvedFolder;
}

function renderFolderList() {
  if (!dom.folderList) {
    return;
  }

  const folders = getFolderCounts();

  if (dom.folderList.tagName === "SELECT") {
    dom.folderList.innerHTML = [
      `<option value="${ALL_PHOTOS_FOLDER}">All Photos (${state.photos.length})</option>`,
      ...folders.map(
        (folder) =>
          `<option value="${escapeHtml(folder.folderName)}">${escapeHtml(folder.folderName)} (${folder.count})</option>`
      ),
    ].join("");
    dom.folderList.value = state.selectedFolder;
    return;
  }

  dom.folderList.innerHTML = `
    <button
      type="button"
      class="gallery-folder-button ${state.selectedFolder === ALL_PHOTOS_FOLDER ? "active" : ""}"
      data-gallery-folder="${ALL_PHOTOS_FOLDER}"
      aria-pressed="${state.selectedFolder === ALL_PHOTOS_FOLDER}"
    >
      All Photos
      <span class="gallery-folder-count">${state.photos.length}</span>
    </button>
    ${folders
      .map(
        (folder) => `
          <button
            type="button"
            class="gallery-folder-button ${state.selectedFolder === folder.folderName ? "active" : ""}"
            data-gallery-folder="${escapeHtml(folder.folderName)}"
            aria-pressed="${state.selectedFolder === folder.folderName}"
          >
            ${escapeHtml(folder.folderName)}
            <span class="gallery-folder-count">${folder.count}</span>
          </button>
        `
      )
      .join("")}
  `;

  dom.folderList.querySelectorAll("[data-gallery-folder]").forEach((button) => {
    button.addEventListener("click", () => selectFolder(button.dataset.galleryFolder || ALL_PHOTOS_FOLDER));
  });
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

  const message =
    state.selectedFolder === ALL_PHOTOS_FOLDER
      ? state.role === "staff"
        ? "No photos have been uploaded yet. Staff can use the upload form below to add the first image to the gallery."
        : "No photos have been uploaded yet."
      : state.role === "staff"
        ? `No photos are stored in ${state.selectedFolder} yet. Staff can upload one below to start that folder.`
        : `No photos are stored in ${state.selectedFolder} yet.`;

  dom.emptyState.hidden = false;
  dom.emptyState.textContent = message;
}

function renderPhotoCard(photo) {
  const hasImage = Boolean(photo.imageUrl);
  const createdLabel = formatDateTime(photo.createdAt);
  const folderLabel = photo.folderName || UNSORTED_FOLDER;
  const altText = `${photo.title} in ${folderLabel}`;
  const aboutSlotValue = photo.aboutFeatureSlot == null ? "" : String(photo.aboutFeatureSlot);
  const aboutSlotDisabled = state.activeAboutSlotPhotoId === photo.id ? "disabled" : "";
  const aboutSlotStatus = photo.aboutFeatureSlot == null
    ? "Not featured on About page."
    : `About page slot ${photo.aboutFeatureSlot}.`;
  const showDeleteButton = state.role === "staff" && !isPendingPhotoId(photo.id);
  const deleteBusy = state.activeDeletePhotoId === photo.id;
  const deleteDisabled = state.activeDeletePhotoId ? "disabled" : "";

  return `
    <article class="gallery-photo-card${hasImage ? " has-image" : " no-image"}" data-photo-id="${escapeHtml(photo.id)}">
      <div class="gallery-photo-media">
        ${
          hasImage
            ? `<img class="gallery-photo-image" src="${escapeHtml(photo.imageUrl)}" alt="${escapeHtml(altText)}" loading="lazy" decoding="async">`
            : `<div class="gallery-photo-placeholder" aria-hidden="true">
                <span>${escapeHtml(folderLabel)}</span>
              </div>`
        }
      </div>
      <div class="gallery-photo-copy">
        <div class="gallery-photo-meta">
          <span class="gallery-folder-chip">${escapeHtml(folderLabel)}</span>
          <span class="gallery-photo-date">${escapeHtml(createdLabel)}</span>
        </div>
        <h3>${escapeHtml(photo.title)}</h3>
        ${
          photo.description
            ? `<p>${escapeHtml(photo.description)}</p>`
            : `<p class="gallery-photo-muted">No description provided.</p>`
        }
        ${
          photo.uploaderName
            ? `<p class="gallery-photo-muted">Uploaded by ${escapeHtml(photo.uploaderName)}</p>`
            : ""
        }
        <div class="gallery-photo-control">
          <label class="gallery-photo-control-label" for="about-slot-${escapeHtml(photo.id)}">About page slot</label>
          <select
            class="gallery-photo-control-select"
            id="about-slot-${escapeHtml(photo.id)}"
            data-about-slot-photo-id="${escapeHtml(photo.id)}"
            ${aboutSlotDisabled}
          >
            <option value="" ${aboutSlotValue === "" ? "selected" : ""}>Not featured</option>
            <option value="1" ${aboutSlotValue === "1" ? "selected" : ""}>Slot 1</option>
            <option value="2" ${aboutSlotValue === "2" ? "selected" : ""}>Slot 2</option>
            <option value="3" ${aboutSlotValue === "3" ? "selected" : ""}>Slot 3</option>
          </select>
          <p class="gallery-photo-muted">${escapeHtml(
            state.activeAboutSlotPhotoId === photo.id ? "Saving about-page selection..." : aboutSlotStatus
          )}</p>
        </div>
        ${
          showDeleteButton
            ? `<div class="button-row">
                <button
                  class="button button-secondary button-small danger-button"
                  type="button"
                  data-delete-photo-id="${escapeHtml(photo.id)}"
                  ${deleteDisabled}
                >
                  ${deleteBusy ? "Deleting..." : "Delete photo"}
                </button>
              </div>`
            : ""
        }
      </div>
    </article>
  `;
}

function attachImageErrorFallbacks() {
  if (!dom.grid) {
    return;
  }

  dom.grid.querySelectorAll("img.gallery-photo-image").forEach((image) => {
    image.addEventListener(
      "error",
      () => {
        const card = image.closest(".gallery-photo-card");
        if (card) {
          card.classList.add("image-error");
        }

        const media = image.parentElement;
        if (media) {
          media.innerHTML = `
            <div class="gallery-photo-placeholder error" aria-hidden="true">
              <span>Image unavailable</span>
            </div>
          `;
        }
      },
      { once: true }
    );
  });
}

function renderGrid() {
  if (!dom.grid) {
    return;
  }

  const visiblePhotos = getVisiblePhotos();

  dom.grid.innerHTML = visiblePhotos.map(renderPhotoCard).join("");
  renderEmptyState(visiblePhotos.length);
  attachImageErrorFallbacks();
  bindAboutSlotActions();
  bindDeleteActions();
}

function renderUploadFolderOptions() {
  if (!dom.uploadFolder || dom.uploadFolder.tagName !== "SELECT") {
    return;
  }

  const folders = getFolderCounts();
  const currentValue = String(dom.uploadFolder.value || "").trim();

  dom.uploadFolder.innerHTML = [
    `<option value="">Use the current folder</option>`,
    ...folders.map(
      (folder) =>
        `<option value="${escapeHtml(folder.folderName)}">${escapeHtml(folder.folderName)}</option>`
    ),
    `<option value="${NEW_FOLDER_OPTION}">Create a new folder...</option>`,
  ].join("");

  if ([...dom.uploadFolder.options].some((option) => option.value === currentValue)) {
    dom.uploadFolder.value = currentValue;
  } else if (currentValue === NEW_FOLDER_OPTION) {
    dom.uploadFolder.value = NEW_FOLDER_OPTION;
  }

  setUploadFolderMode();
}

function render() {
  state.role = document.body.dataset.authRole || state.role;
  setUploadAccess(state.role);
  renderFolderList();
  renderFolderHeader();
  renderUploadFolderOptions();
  renderGrid();

  syncUploadFolderField(state.selectedFolder);
}

function selectFolder(folderName) {
  const resolvedFolder = folderName === ALL_PHOTOS_FOLDER ? ALL_PHOTOS_FOLDER : normalizeFolderName(folderName);

  state.selectedFolder = resolvedFolder;
  if (state.error) {
    clearError();
    setStatus("", "info");
  }
  syncUploadFolderField(resolvedFolder);
  render();
}

function normalizeUploadedPhoto(photo, fallbackFolderName) {
  const normalized = normalizePhoto(photo);
  normalized.folderName = normalizeFolderName(normalized.folderName || fallbackFolderName);
  return normalized;
}

function upsertPhoto(photo) {
  const normalized = normalizePhoto(photo);
  const existingIndex = state.photos.findIndex((entry) => entry.id === normalized.id);

  if (existingIndex >= 0) {
    state.photos[existingIndex] = normalized;
  } else {
    state.photos.unshift(normalized);
  }

  state.photos = getSortedPhotos(state.photos);
}

function removePhotoById(photoId) {
  state.photos = state.photos.filter((photo) => photo.id !== photoId);
}

function ensureSelectedFolderExists() {
  if (state.selectedFolder === ALL_PHOTOS_FOLDER) {
    return;
  }

  const folderExists = state.photos.some(
    (photo) => normalizeFolderName(photo.folderName) === state.selectedFolder
  );

  if (!folderExists) {
    state.selectedFolder = ALL_PHOTOS_FOLDER;
  }
}

function clearError() {
  state.error = "";
}

function setError(message) {
  state.error = message;
  setStatus(message, "error");
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

function isImageFile(file) {
  if (!file) {
    return false;
  }

  if (String(file.type || "").startsWith("image/")) {
    return true;
  }

  return /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i.test(file.name || "");
}

function resetUploadForm() {
  if (!dom.uploadForm) {
    return;
  }

  dom.uploadForm.reset();
  syncUploadFolderField(state.selectedFolder === ALL_PHOTOS_FOLDER ? "" : state.selectedFolder);
}

async function loadPhotos() {
  state.loading = true;
  setStatus("Loading gallery photos...", "info");

  try {
    const photos = await fetchGalleryPhotos();
    state.photos = getSortedPhotos((photos || []).map(normalizePhoto));

    if (state.selectedFolder !== ALL_PHOTOS_FOLDER) {
      const folderExists = state.photos.some(
        (photo) => normalizeFolderName(photo.folderName) === state.selectedFolder
      );

      if (!folderExists) {
        state.selectedFolder = ALL_PHOTOS_FOLDER;
      }
    }

    clearError();
    render();

    if (!state.photos.length) {
      setStatus(
        state.role === "staff"
          ? "Gallery is empty. Staff can upload the first photo below."
          : "Gallery is empty right now.",
        "warning"
      );
    } else {
      setStatus(`Loaded ${pluralize(state.photos.length, "photo", "photos")}.`, "success");
    }
  } catch (error) {
    state.photos = [];
    render();
    setError(error?.message || "Unable to load gallery photos right now.");
  } finally {
    state.loading = false;
  }
}

async function handleAboutSlotChange(event) {
  const target = event.target instanceof HTMLSelectElement ? event.target : null;

  if (!target) {
    return;
  }

  const photoId = target.dataset.aboutSlotPhotoId || "";

  if (!photoId || state.activeAboutSlotPhotoId) {
    return;
  }

  const selectedValue = target.value === "" ? null : Number(target.value);
  const photo = state.photos.find((entry) => entry.id === photoId);
  const photoTitle = photo?.title || "photo";

  state.activeAboutSlotPhotoId = photoId;
  render();

  try {
    await updateGalleryPhotoAboutSlot(photoId, selectedValue);
    await loadPhotos();
    setStatus(
      selectedValue == null
        ? `${photoTitle} was removed from the About page.`
        : `${photoTitle} is now assigned to About page slot ${selectedValue}.`,
      "success"
    );
  } catch (error) {
    setError(error?.message || "Unable to update the About page selection.");
  } finally {
    state.activeAboutSlotPhotoId = "";
    render();
  }
}

function bindAboutSlotActions() {
  if (!dom.grid) {
    return;
  }

  dom.grid.querySelectorAll("[data-about-slot-photo-id]").forEach((select) => {
    select.addEventListener("change", handleAboutSlotChange);
  });
}

async function handleDeletePhoto(photoId) {
  const resolvedPhotoId = normalizeText(photoId);

  if (!resolvedPhotoId || state.activeDeletePhotoId || state.role !== "staff") {
    return;
  }

  const photo = state.photos.find((entry) => entry.id === resolvedPhotoId);

  if (!photo || isPendingPhotoId(resolvedPhotoId)) {
    return;
  }

  const photoTitle = photo.title || "photo";
  const confirmed = window.confirm(`Delete ${photoTitle} from the gallery?`);

  if (!confirmed) {
    return;
  }

  state.activeDeletePhotoId = resolvedPhotoId;
  render();

  try {
    setStatus(`Deleting ${photoTitle}...`, "info");
    await deleteGalleryPhoto(resolvedPhotoId);
    removePhotoById(resolvedPhotoId);
    ensureSelectedFolderExists();
    clearError();
    render();
    setStatus(`${photoTitle} was removed from the gallery.`, "success");
  } catch (error) {
    setError(error?.message || "Unable to delete that photo.");
  } finally {
    state.activeDeletePhotoId = "";
    render();
  }
}

function bindDeleteActions() {
  if (!dom.grid) {
    return;
  }

  dom.grid.querySelectorAll("[data-delete-photo-id]").forEach((button) => {
    button.addEventListener("click", () => {
      void handleDeletePhoto(button.dataset.deletePhotoId || "");
    });
  });
}

function getUploadFolderValue() {
  const rawValue = normalizeText(dom.uploadFolder?.value);

  if (rawValue === NEW_FOLDER_OPTION) {
    const customValue = normalizeText(dom.uploadFolderCustom?.value);
    return customValue ? normalizeFolderName(customValue) : "";
  }

  if (rawValue) {
    return normalizeFolderName(rawValue);
  }

  if (state.selectedFolder !== ALL_PHOTOS_FOLDER) {
    return state.selectedFolder;
  }

  return UNSORTED_FOLDER;
}

async function handleUploadSubmit(event) {
  event.preventDefault();

  if (state.uploading) {
    return;
  }

  if (state.role !== "staff") {
    setError("Only staff accounts can upload photos.");
    return;
  }

  const file = dom.uploadFile?.files?.[0] || null;
  const titleValue = normalizeText(dom.uploadTitle?.value);
  const descriptionValue = normalizeText(dom.uploadDescription?.value);
  const folderValue = getUploadFolderValue();

  if (!file) {
    setError("Choose a photo file before uploading.");
    return;
  }

  if (!isImageFile(file)) {
    setError("Only image files can be uploaded to the gallery.");
    return;
  }

  const title = titleValue || deriveTitleFromFile(file);

  if (!title) {
    setError("Add a title for the photo before uploading.");
    return;
  }

  if (dom.uploadFolder?.value === NEW_FOLDER_OPTION && !normalizeText(dom.uploadFolderCustom?.value)) {
    setError("Enter a new folder name before uploading.");
    return;
  }

  const previewUrl = URL.createObjectURL(file);
  state.optimisticPreviewUrl = previewUrl;

  const optimisticId = `pending-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const optimisticPhoto = {
    id: optimisticId,
    title,
    description: descriptionValue,
    imageUrl: previewUrl,
    folderName: folderValue,
    createdAt: new Date().toISOString(),
    uploaderName: "Uploading...",
  };

  state.uploading = true;
  clearError();
  setBusyState(true);
  setStatus("Uploading photo to the gallery...", "info");

  upsertPhoto(optimisticPhoto);
  state.selectedFolder = folderValue;
  render();

  try {
    const uploadedPhoto = await uploadGalleryPhoto({
      file,
      title,
      description: descriptionValue,
      folderName: folderValue,
    });

    removePhotoById(optimisticId);
    upsertPhoto(normalizeUploadedPhoto(uploadedPhoto, folderValue));
    state.selectedFolder = normalizeFolderName(uploadedPhoto?.folderName || folderValue);
    clearError();
    setStatus(`Uploaded ${title} to ${state.selectedFolder}.`, "success");
    resetUploadForm();
    render();
  } catch (error) {
    removePhotoById(optimisticId);
    setError(error?.message || "Unable to upload the selected photo.");
    render();
  } finally {
    if (state.optimisticPreviewUrl) {
      URL.revokeObjectURL(state.optimisticPreviewUrl);
      state.optimisticPreviewUrl = "";
    }

    state.uploading = false;
    setBusyState(false);
    render();
  }
}

function bindEvents() {
  if (dom.folderList && dom.folderList.tagName === "SELECT") {
    dom.folderList.addEventListener("change", () => {
      selectFolder(dom.folderList.value || ALL_PHOTOS_FOLDER);
    });
  }

  if (dom.uploadFolder) {
    dom.uploadFolder.addEventListener("change", () => {
      setUploadFolderMode();

      if (dom.uploadFolder.value !== NEW_FOLDER_OPTION && dom.uploadFolderCustom) {
        dom.uploadFolderCustom.value = "";
      }
    });
  }

  if (dom.uploadForm) {
    dom.uploadForm.addEventListener("submit", handleUploadSubmit);
  }
}

function cacheDom() {
  dom.statusMessage = document.getElementById("gallery-status-message");
  dom.folderList = document.getElementById("gallery-folder-list");
  dom.folderTitle = document.getElementById("gallery-folder-title");
  dom.folderDescription = document.getElementById("gallery-folder-description");
  dom.grid = document.getElementById("gallery-grid");
  dom.emptyState = document.getElementById("gallery-empty-state");
  dom.uploadForm = document.getElementById("gallery-upload-form");
  dom.uploadFile = document.getElementById("gallery-upload-file");
  dom.uploadTitle = document.getElementById("gallery-upload-title");
  dom.uploadDescription = document.getElementById("gallery-upload-description");
  dom.uploadFolder = document.getElementById("gallery-upload-folder");
  dom.uploadFolderCustomField = document.getElementById("gallery-upload-folder-custom-field");
  dom.uploadFolderCustom = document.getElementById("gallery-upload-folder-custom");
  dom.uploadSubmit = document.getElementById("gallery-upload-submit");
  dom.uploadLocked = document.getElementById("gallery-upload-locked");
}

export async function initializeGalleryApp() {
  if (state.initialized) {
    return () => {};
  }

  state.initialized = true;
  cacheDom();
  bindEvents();
  setUploadAccess();
  setBusyState(false);
  syncUploadFolderField("");
  render();
  await loadPhotos();

  return () => {
    if (state.optimisticPreviewUrl) {
      URL.revokeObjectURL(state.optimisticPreviewUrl);
      state.optimisticPreviewUrl = "";
    }
  };
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    void initializeGalleryApp();
  }, { once: true });
} else {
  void initializeGalleryApp();
}
