import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const rawConfig = window.CEMS_SUPABASE_CONFIG || {};
const config = {
  url: rawConfig.url || "",
  publishableKey: rawConfig.publishableKey || rawConfig.anonKey || "",
  rosterTable: rawConfig.rosterTable || "roster_members",
  eventTable: rawConfig.eventTable || "calendar_events",
  profileTable: rawConfig.profileTable || "user_profiles",
  portalRedirect: rawConfig.portalRedirect || "member-home.html",
};

function looksConfigured(value) {
  return Boolean(value) && !/YOUR_|REPLACE_|CHANGE_ME/i.test(value);
}

function normalizeCalendarEvent(row) {
  return {
    id: row.id,
    title: row.title || "",
    date: row.event_date || "",
    startTime: row.start_time || "",
    endTime: row.end_time || "",
    location: row.location || "",
    category: row.category || "",
    description: row.description || "",
    signupOpen: Boolean(row.signup_open),
    signupUrl: row.signup_url || "",
  };
}

function serializeCalendarEvent(event) {
  return {
    title: event.title,
    event_date: event.date,
    start_time: event.startTime || null,
    end_time: event.endTime || null,
    location: event.location,
    category: event.category,
    description: event.description,
    signup_open: Boolean(event.signupOpen),
    signup_url: event.signupOpen ? event.signupUrl || "" : "",
  };
}

export function isSupabaseConfigured() {
  return looksConfigured(config.url) && looksConfigured(config.publishableKey);
}

export function getSupabaseConfig() {
  return { ...config };
}

export function stashPendingSession(session) {
  if (!session || !window.sessionStorage) {
    return;
  }

  const tokenPair = {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  };

  window.sessionStorage.setItem(pendingSessionStorageKey, JSON.stringify(tokenPair));
}

export function clearPendingSession() {
  if (!window.sessionStorage) {
    return;
  }

  window.sessionStorage.removeItem(pendingSessionStorageKey);
}

let supabaseClient = null;
const pendingSessionStorageKey = "cems-pending-session";

export function getSupabaseClient() {
  if (!isSupabaseConfigured()) {
    return null;
  }

  if (!supabaseClient) {
    supabaseClient = createClient(config.url, config.publishableKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        storageKey: "cems-supabase-auth",
      },
    });
  }

  return supabaseClient;
}

export async function signInWithPassword(email, password) {
  const supabase = getSupabaseClient();

  if (!supabase) {
    throw new Error("Supabase is not configured yet.");
  }

  return supabase.auth.signInWithPassword({ email, password });
}

export async function signOutCurrentUser() {
  clearPendingSession();

  const supabase = getSupabaseClient();

  if (!supabase) {
    return { error: null };
  }

  return supabase.auth.signOut();
}

export async function getSessionContext() {
  const supabase = getSupabaseClient();

  if (!supabase) {
    return {
      user: null,
      session: null,
      profile: null,
      role: "guest",
    };
  }

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) {
    throw sessionError;
  }

  const user = session?.user || null;

  if (!user) {
    return {
      user: null,
      session: null,
      profile: null,
      role: "guest",
    };
  }

  const { data: profile, error: profileError } = await supabase
    .from(config.profileTable)
    .select("user_id, email, role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileError && profileError.code !== "PGRST116") {
    throw profileError;
  }

  return {
    user,
    session,
    profile: profile || null,
    role: profile?.role === "staff" ? "staff" : "member",
  };
}

export async function waitForSessionContext(options = {}) {
  const timeoutMs = options.timeoutMs || 2500;
  const intervalMs = options.intervalMs || 150;
  const start = Date.now();
  let context = await getSessionContext();

  while (!context.user && Date.now() - start < timeoutMs) {
    await new Promise((resolve) => window.setTimeout(resolve, intervalMs));
    context = await getSessionContext();
  }

  return context;
}

export async function restorePendingSession() {
  if (!window.sessionStorage) {
    return null;
  }

  const rawValue = window.sessionStorage.getItem(pendingSessionStorageKey);

  if (!rawValue) {
    return null;
  }

  const supabase = getSupabaseClient();

  if (!supabase) {
    return null;
  }

  try {
    const tokenPair = JSON.parse(rawValue);

    if (!tokenPair?.access_token || !tokenPair?.refresh_token) {
      clearPendingSession();
      return null;
    }

    const { data, error } = await supabase.auth.setSession({
      access_token: tokenPair.access_token,
      refresh_token: tokenPair.refresh_token,
    });

    clearPendingSession();

    if (error) {
      throw error;
    }

    return data?.session || null;
  } catch (_error) {
    clearPendingSession();
    return null;
  }
}

export function onAuthStateChange(handler) {
  const supabase = getSupabaseClient();

  if (!supabase) {
    return { data: { subscription: { unsubscribe() {} } } };
  }

  return supabase.auth.onAuthStateChange((event, session) => {
    window.setTimeout(async () => {
      const context = await getSessionContext();
      handler({ ...context, event, session: session || context.session });
    }, 0);
  });
}

export async function fetchRosterMembers() {
  const supabase = getSupabaseClient();

  if (!supabase) {
    throw new Error("Supabase is not configured yet.");
  }

  const { data, error } = await supabase
    .from(config.rosterTable)
    .select("*")
    .order("name", { ascending: true });

  if (error) {
    throw error;
  }

  return data || [];
}

export async function createRosterMember(member) {
  const supabase = getSupabaseClient();

  if (!supabase) {
    throw new Error("Supabase is not configured yet.");
  }

  const { data, error } = await supabase
    .from(config.rosterTable)
    .insert(member)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function updateRosterMember(id, member) {
  const supabase = getSupabaseClient();

  if (!supabase) {
    throw new Error("Supabase is not configured yet.");
  }

  const { data, error } = await supabase
    .from(config.rosterTable)
    .update(member)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function deleteRosterMember(id) {
  const supabase = getSupabaseClient();

  if (!supabase) {
    throw new Error("Supabase is not configured yet.");
  }

  const { error } = await supabase.from(config.rosterTable).delete().eq("id", id);

  if (error) {
    throw error;
  }
}

export async function fetchCalendarEvents() {
  const supabase = getSupabaseClient();

  if (!supabase) {
    throw new Error("Supabase is not configured yet.");
  }

  const { data, error } = await supabase
    .from(config.eventTable)
    .select("id, title, event_date, start_time, end_time, location, category, description, signup_open, signup_url")
    .order("event_date", { ascending: true })
    .order("start_time", { ascending: true });

  if (error) {
    throw error;
  }

  return (data || []).map(normalizeCalendarEvent);
}

export async function createCalendarEvent(event) {
  const supabase = getSupabaseClient();

  if (!supabase) {
    throw new Error("Supabase is not configured yet.");
  }

  const { data, error } = await supabase
    .from(config.eventTable)
    .insert(serializeCalendarEvent(event))
    .select("id, title, event_date, start_time, end_time, location, category, description, signup_open, signup_url")
    .single();

  if (error) {
    throw error;
  }

  return normalizeCalendarEvent(data);
}

export async function updateCalendarEvent(id, event) {
  const supabase = getSupabaseClient();

  if (!supabase) {
    throw new Error("Supabase is not configured yet.");
  }

  const { data, error } = await supabase
    .from(config.eventTable)
    .update(serializeCalendarEvent(event))
    .eq("id", id)
    .select("id, title, event_date, start_time, end_time, location, category, description, signup_open, signup_url")
    .single();

  if (error) {
    throw error;
  }

  return normalizeCalendarEvent(data);
}

export async function deleteCalendarEvent(id) {
  const supabase = getSupabaseClient();

  if (!supabase) {
    throw new Error("Supabase is not configured yet.");
  }

  const { error } = await supabase.from(config.eventTable).delete().eq("id", id);

  if (error) {
    throw error;
  }
}
