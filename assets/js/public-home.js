import { fetchGalleryPhotos, isSupabaseConfigured } from "./supabase-client.js";
import { initializeHomeHeroRotator } from "./home-hero-rotator.js";

let cleanupRotator = () => {};

function setHeroLoadedState(isLoaded) {
  const hero = document.getElementById("home-gallery-hero");

  if (!hero) {
    return;
  }

  hero.classList.toggle("has-gallery-photo", isLoaded);
}

async function initializePublicHome() {
  const hero = document.getElementById("home-gallery-hero");

  if (!hero || !isSupabaseConfigured()) {
    return;
  }

  try {
    const photos = await fetchGalleryPhotos();
    const hasVisiblePhoto = photos.some((photo) => String(photo?.imageUrl || "").trim());

    setHeroLoadedState(hasVisiblePhoto);
    cleanupRotator = initializeHomeHeroRotator(photos);
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
