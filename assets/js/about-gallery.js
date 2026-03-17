import { fetchAboutFeaturedPhotos, isSupabaseConfigured } from "./supabase-client.js";

const MAX_FEATURED_PHOTOS = 3;
const HOME_PAGE_GALLERY_FOLDER = "Home Page";

const state = {
  initialized: false,
  cleanup: () => {},
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

function normalizePhoto(photo) {
  return {
    id: String(photo?.id || ""),
    title: normalizeText(photo?.title) || "Featured photo",
    description: normalizeText(photo?.description),
    imageUrl: normalizeText(photo?.imageUrl),
    folderName: normalizeText(photo?.folderName) || "Gallery",
    aboutFeatureSlot: Number(photo?.aboutFeatureSlot || 0),
  };
}

function getDom() {
  return {
    grid: document.getElementById("about-gallery-grid"),
    empty: document.getElementById("about-gallery-empty"),
  };
}

function setEmptyState(emptyElement, message) {
  if (!emptyElement) {
    return;
  }

  emptyElement.textContent = message;
  emptyElement.hidden = false;
  emptyElement.setAttribute("aria-hidden", "false");
}

function clearEmptyState(emptyElement) {
  if (!emptyElement) {
    return;
  }

  emptyElement.textContent = "";
  emptyElement.hidden = true;
  emptyElement.setAttribute("aria-hidden", "true");
}

function renderPhotoCard(photo, index) {
  const hasImage = Boolean(photo.imageUrl);
  const descriptionMarkup = photo.description
    ? `<p class="about-gallery-description">${escapeHtml(photo.description)}</p>`
    : "";
  const imageMarkup = hasImage
    ? `<img class="about-gallery-image" src="${escapeHtml(photo.imageUrl)}" alt="${escapeHtml(photo.title)}" loading="lazy" decoding="async">`
    : `<div class="about-gallery-placeholder" aria-hidden="true"><span>${escapeHtml(photo.folderName)}</span></div>`;

  return `
    <article class="about-gallery-card${hasImage ? " has-image" : " no-image"}" data-photo-id="${escapeHtml(photo.id)}">
      <div class="about-gallery-media">
        ${imageMarkup}
      </div>
      <div class="about-gallery-copy">
        <span class="about-gallery-index">0${index + 1}</span>
        <h3>${escapeHtml(photo.title)}</h3>
        ${descriptionMarkup}
      </div>
    </article>
  `;
}

function renderGrid(gridElement, photos) {
  if (!gridElement) {
    return;
  }

  gridElement.innerHTML = photos.map(renderPhotoCard).join("");
}

async function loadPhotos() {
  if (!isSupabaseConfigured()) {
    return [];
  }

  const photos = await fetchAboutFeaturedPhotos({ folderName: HOME_PAGE_GALLERY_FOLDER });
  return (Array.isArray(photos) ? photos : [])
    .map(normalizePhoto)
    .filter((photo) => photo.imageUrl)
    .sort((left, right) => {
      const leftSlot = Number(left.aboutFeatureSlot || 0);
      const rightSlot = Number(right.aboutFeatureSlot || 0);

      if (leftSlot !== rightSlot) {
        return leftSlot - rightSlot;
      }

      return String(left.title || "").localeCompare(String(right.title || ""));
    })
    .slice(0, MAX_FEATURED_PHOTOS);
}

async function initializeAboutGallery() {
  if (state.initialized) {
    return state.cleanup;
  }

  state.initialized = true;

  const { grid, empty } = getDom();

  if (!grid || !empty) {
    state.cleanup = () => {};
    return state.cleanup;
  }

  clearEmptyState(empty);

  try {
    const photos = await loadPhotos();

    if (!photos.length) {
      grid.innerHTML = "";
      setEmptyState(empty, "Featured photos are not available right now.");
      return state.cleanup;
    }

    renderGrid(grid, photos);
    clearEmptyState(empty);
  } catch (_error) {
    grid.innerHTML = "";
    setEmptyState(empty, "Featured photos are not available right now.");
  }

  state.cleanup = () => {};
  return state.cleanup;
}

export { initializeAboutGallery };

if (document.readyState === "loading") {
  document.addEventListener(
    "DOMContentLoaded",
    () => {
      void initializeAboutGallery();
    },
    { once: true }
  );
} else {
  void initializeAboutGallery();
}
