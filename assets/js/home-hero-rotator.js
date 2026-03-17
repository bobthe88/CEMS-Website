const ROTATION_INTERVAL_MS = 30000;

function normalizePhoto(photo) {
  if (!photo || typeof photo !== "object") {
    return null;
  }

  const imageUrl = String(photo.imageUrl || "").trim();

  if (!imageUrl) {
    return null;
  }

  return {
    id: String(photo.id || imageUrl),
    title: String(photo.title || "Gallery photo").trim() || "Gallery photo",
    description: String(photo.description || "").trim(),
    imageUrl,
    folderName: String(photo.folderName || "Gallery").trim() || "Gallery",
  };
}

function pickRandomIndex(length, previousIndex = -1) {
  if (length <= 0) {
    return -1;
  }

  if (length === 1) {
    return 0;
  }

  let nextIndex = previousIndex;

  while (nextIndex === previousIndex) {
    nextIndex = Math.floor(Math.random() * length);
  }

  return nextIndex;
}

function setTextContent(element, value) {
  if (element) {
    element.textContent = value;
  }
}

function setHeroImage(imageElement, photo) {
  if (!imageElement || !photo) {
    return;
  }

  imageElement.src = photo.imageUrl;
  imageElement.alt = photo.title || photo.folderName || "Gallery photo";
}

export function initializeHomeHeroRotator(photos, options = {}) {
  const {
    showTitle = true,
    showFolder = true,
    showCount = true,
    heroId = "home-gallery-hero",
    imageId = "home-gallery-hero-image",
    titleId = "home-gallery-hero-title",
    descriptionId = "home-gallery-hero-description",
    folderId = "home-gallery-hero-folder",
    countId = "home-gallery-hero-count",
  } = options;

  const heroSection = document.getElementById(heroId);
  const imageElement = document.getElementById(imageId);
  const titleElement = document.getElementById(titleId);
  const descriptionElement = document.getElementById(descriptionId);
  const folderElement = document.getElementById(folderId);
  const countElement = document.getElementById(countId);

  const validPhotos = Array.isArray(photos)
    ? photos.map(normalizePhoto).filter(Boolean)
    : [];

  if (
    !heroSection ||
    !imageElement ||
    !descriptionElement ||
    (showTitle && !titleElement) ||
    (showFolder && !folderElement) ||
    (showCount && !countElement) ||
    !validPhotos.length
  ) {
    return () => {};
  }

  let currentIndex = pickRandomIndex(validPhotos.length);
  let intervalId = null;

  function renderPhoto(index) {
    const photo = validPhotos[index];

    if (!photo) {
      return;
    }

    heroSection.dataset.photoId = photo.id;
    setHeroImage(imageElement, photo);
    setTextContent(descriptionElement, photo.description);

    if (showTitle) {
      setTextContent(titleElement, photo.title);
    }

    if (showFolder) {
      setTextContent(folderElement, photo.folderName);
    }

    if (showCount) {
      setTextContent(countElement, `${index + 1} of ${validPhotos.length}`);
    }
  }

  function advancePhoto() {
    currentIndex = pickRandomIndex(validPhotos.length, currentIndex);
    renderPhoto(currentIndex);
  }

  renderPhoto(currentIndex);

  if (validPhotos.length > 1) {
    intervalId = window.setInterval(advancePhoto, ROTATION_INTERVAL_MS);
  }

  return () => {
    if (intervalId !== null) {
      window.clearInterval(intervalId);
      intervalId = null;
    }
  };
}
