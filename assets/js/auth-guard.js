import {
  isSupabaseConfigured,
  onAuthStateChange,
  restorePendingSession,
  waitForSessionContext,
} from "./supabase-client.js";

const portalPath = "portal.html";
const postLoginPathStorageKey = "cems-post-login-path";
const authReturnStorageKey = "cems-auth-return";

function getCurrentPath() {
  const path = window.location.pathname.split("/").pop() || "index.html";
  return `${path}${window.location.search}${window.location.hash}`;
}

function sanitizePath(value) {
  if (!value || typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();

  if (!trimmed || !/^[A-Za-z0-9._/?#=&%-]+$/.test(trimmed) || trimmed.startsWith("/")) {
    return "";
  }

  return trimmed;
}

function rememberRequestedPath() {
  if (!window.sessionStorage) {
    return;
  }

  const currentPath = sanitizePath(getCurrentPath());

  if (!currentPath || currentPath === portalPath) {
    return;
  }

  window.sessionStorage.setItem(postLoginPathStorageKey, currentPath);
}

function clearAuthReturnFlag() {
  if (!window.sessionStorage) {
    return;
  }

  window.sessionStorage.removeItem(authReturnStorageKey);
}

function redirectToPortal() {
  rememberRequestedPath();

  const nextPath = encodeURIComponent(getCurrentPath());
  window.location.replace(`${portalPath}?next=${nextPath}`);
}

function markReady(context) {
  document.body.dataset.authState = "ready";
  document.body.dataset.authRole = context.role || "member";
  document.body.setAttribute("aria-busy", "false");
  clearAuthReturnFlag();
}

function loadScript(src, options = {}) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;

    if (options.module) {
      script.type = "module";
    }

    script.addEventListener("load", resolve, { once: true });
    script.addEventListener(
      "error",
      () => reject(new Error(`Unable to load ${src}.`)),
      { once: true }
    );

    document.body.appendChild(script);
  });
}

async function loadProtectedPageScripts() {
  const page = document.body.dataset.page;

  if (page === "roster") {
    await loadScript("assets/js/site.js");
    await loadScript("assets/js/roster-app.js", { module: true });
    return;
  }

  await loadScript("assets/js/data.js");
  await loadScript("assets/js/site.js");
}

async function initializeGuard() {
  if (!isSupabaseConfigured()) {
    redirectToPortal();
    return;
  }

  try {
    await restorePendingSession();

    const timeoutMs = window.sessionStorage?.getItem(authReturnStorageKey) === "1" ? 2500 : 700;
    const context = await waitForSessionContext({
      timeoutMs,
      intervalMs: 120,
    });

    if (!context.user) {
      redirectToPortal();
      return;
    }

    markReady(context);
    await loadProtectedPageScripts();

    onAuthStateChange((updatedContext) => {
      if (!updatedContext.user) {
        redirectToPortal();
        return;
      }

      markReady(updatedContext);
    });
  } catch (_error) {
    redirectToPortal();
  }
}

initializeGuard();

