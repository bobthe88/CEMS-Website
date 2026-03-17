import { fetchGalleryPhotos, isSupabaseConfigured } from "./supabase-client.js";
import { initializeHomeHeroRotator } from "./home-hero-rotator.js";

let cleanupRotator = () => {};

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

function setHeroState(hasPhoto) {
  const hero = document.getElementById("member-gallery-hero");

  if (!hero) {
    return;
  }

  hero.classList.toggle("has-gallery-photo", hasPhoto);
}

async function loadMemberGalleryHero() {
  const hero = document.getElementById("member-gallery-hero");

  if (!hero || !isSupabaseConfigured()) {
    return;
  }

  try {
    const photos = await fetchGalleryPhotos();
    const validPhotos = Array.isArray(photos)
      ? photos.map(normalizePhoto).filter(Boolean)
      : [];

    setHeroState(validPhotos.length > 0);
    cleanupRotator = initializeHomeHeroRotator(validPhotos, {
      heroId: "member-gallery-hero",
      imageId: "member-gallery-hero-image",
      titleId: "member-gallery-hero-title",
      descriptionId: "member-gallery-hero-description",
      folderId: "member-gallery-hero-folder",
      countId: "member-gallery-hero-count",
    });
  } catch (_error) {
    setHeroState(false);
  }
}

export async function initializeMemberHomeGallery() {
  await loadMemberGalleryHero();
  return () => {
    cleanupRotator();
    cleanupRotator = () => {};
  };
}

function boot() {
  void initializeMemberHomeGallery();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}

window.addEventListener(
  "beforeunload",
  () => {
    cleanupRotator();
    cleanupRotator = () => {};
  },
  { once: true }
);
