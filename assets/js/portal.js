import {
  fetchCurrentRosterMember,
  getSupabaseConfig,
  isSupabaseConfigured,
  onAuthStateChange,
  signInWithMemberMagicLink,
  signInWithPassword,
  signOutCurrentUser,
  stashPendingSession,
  waitForSessionContext,
} from "./supabase-client.js";

const state = {
  busy: false,
  redirecting: false,
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

function shouldAutoContinue(context, memberRecord) {
  if (!context.user || !window.sessionStorage) {
    return false;
  }

  if (window.sessionStorage.getItem(authReturnStorageKey) !== "1") {
    return false;
  }

  return context.role === "staff" || Boolean(memberRecord);
}

function redirectToRequestedPath() {
  clearAuthRedirectState();
  window.location.replace(getRequestedPath());
}

function getAuthCallbackErrorMessage() {
  const params = new URLSearchParams(window.location.search);
  const errorCode = params.get("error_code") || "";
  const errorDescription = params.get("error_description") || "";

  if (!errorCode && !errorDescription) {
    return "";
  }

  if (/otp_expired/i.test(errorCode) || /expired|already been used|invalid/i.test(errorDescription)) {
    return "This sign-in link has expired or was already used. Request a fresh email and open the newest link.";
  }

  return errorDescription || "The sign-in link could not be completed. Request a fresh email and try again.";
}

function getFriendlyAuthErrorMessage(error, expectedRole) {
  const message = String(error?.message || "").trim();

  if (/security purposes|rate limit|too many requests|too many/i.test(message)) {
    return expectedRole === "member"
      ? "Too many member sign-in emails were requested too quickly. Wait a minute, then request a fresh link."
      : "Too many sign-in attempts were made too quickly. Wait a minute and try again.";
  }

  return message || "Unable to sign in right now.";
}

function buildMemberRedirectUrl() {
  const redirectUrl = new URL("portal.html", window.location.href);
  const returnTarget = getRequestedPath();

  if (returnTarget) {
    redirectUrl.searchParams.set("next", returnTarget);
  }

  return redirectUrl.toString();
}

function setBusy(isBusy) {
  state.busy = isBusy;

  signInForms.forEach((form) => {
    const submitButton = form.querySelector("button[type='submit']");
    if (submitButton) {
      submitButton.disabled = isBusy;
      submitButton.textContent = isBusy
        ? submitButton.dataset.busyLabel || "Working..."
        : submitButton.dataset.defaultLabel;
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

function renderSession(context, memberRecord = null) {
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
  const hasMemberAccess = context.role === "staff" || Boolean(memberRecord);
  const hasClaimableCertification = Boolean(memberRecord?.certification) && memberRecord.certification !== "None";
  const sessionSummary = context.role === "staff"
    ? "You are signed in with <strong>staff</strong> access. Staff can browse the member site and use editing tools on the roster and calendar pages."
    : memberRecord
      ? hasClaimableCertification
        ? `You are signed in as <strong>${memberRecord.name}</strong> with <strong>${memberRecord.certification}</strong> coverage. You can browse the member site and claim calendar slots that match your certification.`
        : `You are signed in as <strong>${memberRecord.name}</strong>. Your roster record shows <strong>None</strong> for certification, so you can browse the member site but cannot claim certification-based calendar slots.`
      : "This email is authenticated, but it is not linked to a roster record yet. Ask staff to add this address to the roster before using the private member site.";
  const continueAction = hasMemberAccess
    ? `<a class="button button-primary" href="${returnTarget}">${actionLabel}</a>`
    : "";

  sessionShell.hidden = false;
  sessionCopy.innerHTML = `
    <span class="page-accent">Signed In</span>
    <h3>${context.user.email}</h3>
    <p>${sessionSummary}</p>
  `;
  sessionActions.innerHTML = `
    ${continueAction}
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
    let memberRecord = null;

    if (context.user && context.role !== "staff") {
      memberRecord = await fetchCurrentRosterMember();
    }

    renderSession(context, memberRecord);

    if (shouldAutoContinue(context, memberRecord)) {
      if (!state.redirecting) {
        state.redirecting = true;
        setMessage("Your sign-in is active. Redirecting to the member site...", "success");
        window.setTimeout(() => {
          redirectToRequestedPath();
        }, 150);
      }

      return;
    }

    state.redirecting = false;

    if (!context.user) {
      const callbackError = getAuthCallbackErrorMessage();
      setMessage(
        callbackError || "Use your roster email to receive a member sign-in link, or use the staff login for editing access.",
        callbackError ? "warning" : "info"
      );
    } else if (context.role === "staff") {
      setMessage("You are already signed in with staff access. You can continue to the private member site now.", "success");
    } else if (memberRecord) {
      setMessage("Your member sign-in is active. You can continue to the private member site now.", "success");
    } else {
      setMessage("This email is signed in, but it is not linked to a roster member yet. Ask staff to add it to the roster before continuing.", "warning");
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

  if (!email) {
    setMessage("Enter your email address first.", "warning");
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
  setMessage(
    expectedRole === "member"
      ? "Sending your member sign-in link..."
      : `Signing in to the ${expectedRole} portal...`,
    "info"
  );

  try {
    const returnTarget = getRequestedPath();

    if (window.sessionStorage) {
      window.sessionStorage.setItem(postLoginPathStorageKey, returnTarget);
    }

    if (expectedRole === "member") {
      if (window.sessionStorage) {
        window.sessionStorage.setItem(authReturnStorageKey, "1");
      }

      const { error } = await signInWithMemberMagicLink(email, buildMemberRedirectUrl());

      if (error) {
        throw error;
      }

      setMessage(
        `Check ${email} for your sign-in link. Open the newest link on this device to continue into the private member site.`,
        "success"
      );
      form.reset();
      return;
    }

    const password = form.querySelector("input[name='password']").value;

    if (!password) {
      setMessage("Enter both your email and password.", "warning");
      return;
    }

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

    setMessage("Authentication successful. Redirecting to the private member site...", "success");
    window.sessionStorage.setItem(authReturnStorageKey, "1");
    window.sessionStorage.setItem(postLoginPathStorageKey, returnTarget);

    window.setTimeout(() => {
      window.location.href = returnTarget;
    }, 250);
  } catch (error) {
    if (expectedRole === "member") {
      clearAuthRedirectState();
    }

    setMessage(getFriendlyAuthErrorMessage(error, expectedRole), "error");
  } finally {
    setBusy(false);
  }
}

signInForms.forEach((form) => {
  const submitButton = form.querySelector("button[type='submit']");
  if (submitButton) {
    submitButton.dataset.defaultLabel = submitButton.textContent;
    submitButton.dataset.busyLabel =
      form.dataset.loginForm === "member" ? "Sending Link..." : "Signing In...";
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

