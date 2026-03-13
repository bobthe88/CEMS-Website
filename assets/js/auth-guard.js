import {
  fetchCurrentRosterMember,
  isSupabaseConfigured,
  onAuthStateChange,
  restorePendingSession,
  signOutCurrentUser,
  waitForSessionContext,
} from "./supabase-client.js";

const publicHomePath = "index.html";
const portalPath = "portal.html";
const postLoginPathStorageKey = "cems-post-login-path";
const authReturnStorageKey = "cems-auth-return";
let logoutInProgress = false;

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

function clearStoredNavigationState() {
  if (!window.sessionStorage) {
    return;
  }

  window.sessionStorage.removeItem(authReturnStorageKey);
  window.sessionStorage.removeItem(postLoginPathStorageKey);
}

function redirectToPublicSite() {
  clearStoredNavigationState();
  window.location.replace(publicHomePath);
}

function redirectToPortal() {
  if (logoutInProgress) {
    redirectToPublicSite();
    return;
  }

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

async function handleHeaderLogout(event) {
  const target = event.target instanceof Element ? event.target : null;
  const trigger = target?.closest("[data-header-logout]");

  if (!trigger || logoutInProgress) {
    return;
  }

  event.preventDefault();
  logoutInProgress = true;
  trigger.disabled = true;
  trigger.textContent = "Signing out...";

  try {
    const { error } = await signOutCurrentUser();

    if (error) {
      throw error;
    }

    redirectToPublicSite();
  } catch (error) {
    logoutInProgress = false;
    trigger.disabled = false;
    trigger.textContent = "Log out";
    window.alert(error.message || "Unable to sign out right now.");
  }
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

  if (page === "calendar") {
    await loadScript("assets/js/site.js");
    await loadScript("assets/js/calendar-app.js", { module: true });
    return;
  }

  await loadScript("assets/js/data.js");

  if (page === "member-home" || page === "signup") {
    await loadScript("assets/js/events-bootstrap.js", { module: true });
  }

  await loadScript("assets/js/site.js");
}

async function initializeGuard() {
  document.addEventListener("click", handleHeaderLogout);

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

    if (context.role !== "staff") {
      const memberRecord = await fetchCurrentRosterMember();

      if (!memberRecord) {
        redirectToPortal();
        return;
      }
    }

    markReady(context);
    await loadProtectedPageScripts();

    onAuthStateChange(async (updatedContext) => {
      if (!updatedContext.user) {
        if (logoutInProgress) {
          redirectToPublicSite();
          return;
        }

        redirectToPortal();
        return;
      }

      if (updatedContext.role !== "staff") {
        const memberRecord = await fetchCurrentRosterMember();

        if (!memberRecord) {
          redirectToPortal();
          return;
        }
      }

      markReady(updatedContext);
    });
  } catch (_error) {
    redirectToPortal();
  }
}

initializeGuard();
