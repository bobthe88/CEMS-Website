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

export function initializeHomeHeroRotator(photos) {
  const heroSection = document.getElementById("home-gallery-hero");
  const imageElement = document.getElementById("home-gallery-hero-image");
  const titleElement = document.getElementById("home-gallery-hero-title");
  const descriptionElement = document.getElementById("home-gallery-hero-description");
  const folderElement = document.getElementById("home-gallery-hero-folder");
  const countElement = document.getElementById("home-gallery-hero-count");

  const validPhotos = Array.isArray(photos)
    ? photos.map(normalizePhoto).filter(Boolean)
    : [];

  if (
    !heroSection ||
    !imageElement ||
    !titleElement ||
    !descriptionElement ||
    !folderElement ||
    !countElement ||
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
    setTextContent(titleElement, photo.title);
    setTextContent(descriptionElement, photo.description);
    setTextContent(folderElement, photo.folderName);
    setTextContent(countElement, `${index + 1} of ${validPhotos.length}`);
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
