import { fetchAboutFeaturedPhotos, fetchGalleryPhotos, isSupabaseConfigured } from "./supabase-client.js";
import { initializeHomeHeroRotator } from "./home-hero-rotator.js";

const HOME_PAGE_GALLERY_FOLDER = "Home Page";

let cleanupRotator = () => {};

function setHeroLoadedState(isLoaded) {
  const hero = document.getElementById("home-gallery-hero");

  if (!hero) {
    return;
  }

  hero.classList.toggle("has-gallery-photo", isLoaded);
}

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

function toValidPhotos(photos) {
  return (Array.isArray(photos) ? photos : []).map(normalizePhoto).filter(Boolean);
}

async function fetchHomepagePhotos() {
  const featuredHomePagePhotos = toValidPhotos(
    await fetchAboutFeaturedPhotos({ folderName: HOME_PAGE_GALLERY_FOLDER })
  );

  if (featuredHomePagePhotos.length) {
    return featuredHomePagePhotos;
  }

  const featuredPhotos = toValidPhotos(await fetchAboutFeaturedPhotos());

  if (featuredPhotos.length) {
    return featuredPhotos;
  }

  const folderPhotos = toValidPhotos(await fetchGalleryPhotos({ folderName: HOME_PAGE_GALLERY_FOLDER }));

  if (folderPhotos.length) {
    return folderPhotos;
  }

  return toValidPhotos(await fetchGalleryPhotos());
}

async function initializePublicHome() {
  const hero = document.getElementById("home-gallery-hero");

  if (!hero || !isSupabaseConfigured()) {
    return;
  }

  try {
    const photos = await fetchHomepagePhotos();
    const hasVisiblePhoto = photos.length > 0;

    setHeroLoadedState(hasVisiblePhoto);
    cleanupRotator = initializeHomeHeroRotator(photos, {
      showTitle: false,
      showFolder: false,
      showCount: false,
    });
  } catch (error) {
    setHeroLoadedState(false);
    console.error("Unable to load homepage gallery photos.", error);
  }
}

function initializePage() {
  void initializePublicHome();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializePage, { once: true });
} else {
  initializePage();
}

window.addEventListener("beforeunload", () => {
  cleanupRotator();
}, { once: true });
