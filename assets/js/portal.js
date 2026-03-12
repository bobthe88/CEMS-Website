import {
  getSupabaseConfig,
  isSupabaseConfigured,
  onAuthStateChange,
  signInWithPassword,
  signOutCurrentUser,
  stashPendingSession,
  waitForSessionContext,
} from "./supabase-client.js";

const state = {
  busy: false,
};

const authReturnStorageKey = "cems-auth-return";
const postLoginPathStorageKey = "cems-post-login-path";
const defaultProtectedPath = "member-home.html";

const messageShell = document.getElementById("auth-message");
const sessionShell = document.getElementById("auth-session");
const sessionCopy = document.getElementById("auth-session-copy");
const sessionActions = document.getElementById("auth-session-actions");
const logoutButtons = document.querySelectorAll("[data-logout]");
const signInForms = document.querySelectorAll("[data-login-form]");
const configTargets = document.querySelectorAll("[data-supabase-config-target]");

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

function getRequestedPath() {
  const fromQuery = sanitizePath(new URLSearchParams(window.location.search).get("next"));

  if (fromQuery && window.sessionStorage) {
    window.sessionStorage.setItem(postLoginPathStorageKey, fromQuery);
  }

  if (fromQuery) {
    return fromQuery;
  }

  if (window.sessionStorage) {
    const storedPath = sanitizePath(window.sessionStorage.getItem(postLoginPathStorageKey));

    if (storedPath) {
      return storedPath;
    }
  }

  return sanitizePath(getSupabaseConfig().portalRedirect) || defaultProtectedPath;
}

function clearAuthRedirectState() {
  if (!window.sessionStorage) {
    return;
  }

  window.sessionStorage.removeItem(authReturnStorageKey);
}

function setBusy(isBusy) {
  state.busy = isBusy;

  signInForms.forEach((form) => {
    const submitButton = form.querySelector("button[type='submit']");
    if (submitButton) {
      submitButton.disabled = isBusy;
      submitButton.textContent = isBusy ? "Signing In..." : submitButton.dataset.defaultLabel;
    }
  });
}

function setMessage(text, tone = "info") {
  if (!messageShell) {
    return;
  }

  if (!text) {
    messageShell.hidden = true;
    messageShell.textContent = "";
    messageShell.className = "status-banner";
    return;
  }

  messageShell.hidden = false;
  messageShell.textContent = text;
  messageShell.className = `status-banner ${tone}`;
}

function renderConfigHints() {
  const config = getSupabaseConfig();
  configTargets.forEach((target) => {
    target.textContent = `assets/js/supabase-config.js -> ${config.url || "set your project URL"}`;
  });
}

function renderSession(context) {
  if (!sessionShell || !sessionCopy || !sessionActions) {
    return;
  }

  if (!context.user) {
    sessionShell.hidden = true;
    sessionCopy.innerHTML = "";
    sessionActions.innerHTML = "";
    return;
  }

  const returnTarget = getRequestedPath();
  const actionLabel = returnTarget === defaultProtectedPath ? "Open member site" : "Continue";

  sessionShell.hidden = false;
  sessionCopy.innerHTML = `
    <span class="page-accent">Signed In</span>
    <h3>${context.user.email}</h3>
    <p>You are signed in with <strong>${context.role}</strong> access. Members can browse the private member site. Staff can also create, edit, and delete roster and calendar records.</p>
  `;
  sessionActions.innerHTML = `
    <a class="button button-primary" href="${returnTarget}">${actionLabel}</a>
    <button class="button button-secondary" type="button" data-logout-inline>Sign out</button>
  `;

  const inlineLogout = sessionActions.querySelector("[data-logout-inline]");
  if (inlineLogout) {
    inlineLogout.addEventListener("click", handleLogout);
  }
}

async function handleLogout() {
  setMessage("Signing out...", "info");
  const { error } = await signOutCurrentUser();

  if (error) {
    setMessage(error.message || "Unable to sign out right now.", "error");
    return;
  }

  clearAuthRedirectState();
  setMessage("You have been signed out.", "success");
  await refreshSession();
}

async function refreshSession() {
  if (!isSupabaseConfigured()) {
    setMessage(
      "Supabase is not configured yet. Add your project URL and publishable or anon key in assets/js/supabase-config.js before using the member or staff login.",
      "warning"
    );
    renderSession({ user: null, role: "guest" });
    return;
  }

  try {
    const context = await waitForSessionContext();
    renderSession(context);

    if (!context.user) {
      setMessage("Use the member login to open the private member site or the staff login for editing access.", "info");
    } else {
      setMessage("You are already signed in. You can continue to the private member site now.", "success");
    }
  } catch (error) {
    setMessage(error.message || "Unable to read the current session.", "error");
  }
}

async function handleLoginSubmit(event) {
  event.preventDefault();

  if (state.busy) {
    return;
  }

  const form = event.currentTarget;
  const expectedRole = form.dataset.loginForm;
  const email = form.querySelector("input[name='email']").value.trim();
  const password = form.querySelector("input[name='password']").value;

  if (!email || !password) {
    setMessage("Enter both your email and password.", "warning");
    return;
  }

  if (!isSupabaseConfigured()) {
    setMessage(
      "Supabase is not configured yet. Update assets/js/supabase-config.js first.",
      "warning"
    );
    return;
  }

  setBusy(true);
  setMessage(`Signing in to the ${expectedRole} portal...`, "info");

  try {
    const { data, error } = await signInWithPassword(email, password);

    if (error) {
      throw error;
    }

    if (!data?.session && !data?.user) {
      throw new Error("Supabase did not return a usable session. Check whether email confirmation is required for this account in the Supabase Auth settings.");
    }

    if (data?.session) {
      stashPendingSession(data.session);
    }

    const returnTarget = getRequestedPath();

    setMessage("Authentication successful. Redirecting to the private member site...", "success");
    window.sessionStorage.setItem(authReturnStorageKey, "1");
    window.sessionStorage.setItem(postLoginPathStorageKey, returnTarget);

    window.setTimeout(() => {
      window.location.href = returnTarget;
    }, 250);
  } catch (error) {
    setMessage(error.message || "Unable to sign in right now.", "error");
  } finally {
    setBusy(false);
  }
}

signInForms.forEach((form) => {
  const submitButton = form.querySelector("button[type='submit']");
  if (submitButton) {
    submitButton.dataset.defaultLabel = submitButton.textContent;
  }

  form.addEventListener("submit", handleLoginSubmit);
});

logoutButtons.forEach((button) => {
  button.addEventListener("click", handleLogout);
});

onAuthStateChange(() => {
  refreshSession();
});

renderConfigHints();
getRequestedPath();
refreshSession();

