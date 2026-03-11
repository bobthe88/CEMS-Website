import {
  getSessionContext,
  getSupabaseConfig,
  isSupabaseConfigured,
  onAuthStateChange,
  signInWithPassword,
  signOutCurrentUser,
} from "./supabase-client.js";

const state = {
  busy: false,
};

const messageShell = document.getElementById("auth-message");
const sessionShell = document.getElementById("auth-session");
const sessionCopy = document.getElementById("auth-session-copy");
const sessionActions = document.getElementById("auth-session-actions");
const logoutButtons = document.querySelectorAll("[data-logout]");
const signInForms = document.querySelectorAll("[data-login-form]");
const configTargets = document.querySelectorAll("[data-supabase-config-target]");

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

  sessionShell.hidden = false;
  sessionCopy.innerHTML = `
    <span class="page-accent">Signed In</span>
    <h3>${context.user.email}</h3>
    <p>You are signed in with <strong>${context.role}</strong> access. Members can view the protected roster. Staff can also create, edit, and delete roster records.</p>
  `;
  sessionActions.innerHTML = `
    <a class="button button-primary" href="roster.html">Open roster</a>
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
    const context = await getSessionContext();
    renderSession(context);

    if (!context.user) {
      setMessage("Use the member login for read-only access or the staff login for roster management.", "info");
    } else {
      setMessage("You are already signed in. You can continue to the roster now.", "success");
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
    const { error } = await signInWithPassword(email, password);

    if (error) {
      throw error;
    }

    const context = await getSessionContext();

    if (expectedRole === "staff" && context.role !== "staff") {
      await signOutCurrentUser();
      throw new Error("This account is not marked as staff in Supabase. Promote the user in public.user_profiles before using the staff portal.");
    }

    setMessage("Authentication successful. Redirecting to the roster...", "success");
    renderSession(context);

    window.setTimeout(() => {
      window.location.href = getSupabaseConfig().portalRedirect || "roster.html";
    }, 600);
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
refreshSession();
