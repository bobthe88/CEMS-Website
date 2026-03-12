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

const CERTIFICATION_ORDER = ["AEMT", "EMT", "EMR", "68W"];
const pendingSessionStorageKey = "cems-pending-session";
const calendarEventSelect = `
  id,
  title,
  event_date,
  start_time,
  end_time,
  location,
  category,
  description,
  signup_open,
  signup_url,
  signup_requirements:event_signup_requirements(
    id,
    certification,
    slots_needed,
    signups:event_signups(
      id,
      member_id,
      member:roster_members(
        id,
        name,
        certification
      )
    )
  )
`;

let supabaseClient = null;

function looksConfigured(value) {
  return Boolean(value) && !/YOUR_|REPLACE_|CHANGE_ME/i.test(value);
}

function compareByCertification(left, right) {
  const leftIndex = CERTIFICATION_ORDER.indexOf(left);
  const rightIndex = CERTIFICATION_ORDER.indexOf(right);

  if (leftIndex === -1 && rightIndex === -1) {
    return String(left || "").localeCompare(String(right || ""));
  }

  if (leftIndex === -1) {
    return 1;
  }

  if (rightIndex === -1) {
    return -1;
  }

  return leftIndex - rightIndex;
}

function normalizeEventSignup(row) {
  return {
    id: row.id,
    memberId: row.member_id || row.member?.id || "",
    memberName: row.member?.name || "",
    certification: row.member?.certification || "",
  };
}

function normalizeSignupRequirement(row) {
  const signups = (row.signups || [])
    .map(normalizeEventSignup)
    .sort((left, right) => String(left.memberName || "").localeCompare(String(right.memberName || "")));

  return {
    id: row.id,
    certification: row.certification || "",
    slotsNeeded: Number(row.slots_needed || 0),
    signups,
  };
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
    signupRequirements: (row.signup_requirements || [])
      .map(normalizeSignupRequirement)
      .sort((left, right) => compareByCertification(left.certification, right.certification)),
  };
}

function normalizeCurrentMember(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    name: row.name || "",
    certification: row.certification || "",
    contact: row.contact || "",
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
    signup_url: "",
  };
}

async function fetchCalendarEventById(id) {
  const supabase = getSupabaseClient();

  if (!supabase) {
    throw new Error("Supabase is not configured yet.");
  }

  const { data, error } = await supabase
    .from(config.eventTable)
    .select(calendarEventSelect)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? normalizeCalendarEvent(data) : null;
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

export async function signInWithMemberMagicLink(email, emailRedirectTo) {
  const supabase = getSupabaseClient();

  if (!supabase) {
    throw new Error("Supabase is not configured yet.");
  }

  const options = {
    shouldCreateUser: true,
  };

  if (emailRedirectTo) {
    options.emailRedirectTo = emailRedirectTo;
  }

  return supabase.auth.signInWithOtp({
    email,
    options,
  });
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

export async function fetchCurrentRosterMember() {
  const supabase = getSupabaseClient();

  if (!supabase) {
    throw new Error("Supabase is not configured yet.");
  }

  const context = await getSessionContext();
  const email = context.profile?.email || context.user?.email || "";

  if (!email) {
    return null;
  }

  const { data, error } = await supabase
    .from(config.rosterTable)
    .select("id, name, certification, contact")
    .ilike("contact", email)
    .limit(1);

  if (error) {
    throw error;
  }

  return normalizeCurrentMember(data?.[0] || null);
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
    .select(calendarEventSelect)
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
    .select("id")
    .single();

  if (error) {
    throw error;
  }

  const createdEvent = await fetchCalendarEventById(data.id);

  if (!createdEvent) {
    throw new Error("The event was created, but it could not be reloaded.");
  }

  return createdEvent;
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
    .select("id")
    .single();

  if (error) {
    throw error;
  }

  const updatedEvent = await fetchCalendarEventById(data.id);

  if (!updatedEvent) {
    throw new Error("The event was updated, but it could not be reloaded.");
  }

  return updatedEvent;
}

export async function syncEventSignupRequirements(eventId, requirements) {
  const supabase = getSupabaseClient();

  if (!supabase) {
    throw new Error("Supabase is not configured yet.");
  }

  const sanitizedRequirements = (requirements || [])
    .map((requirement) => ({
      certification: requirement.certification,
      slots_needed: Number(requirement.slotsNeeded || requirement.slots_needed || 0),
    }))
    .filter((requirement) => requirement.certification && requirement.slots_needed > 0);

  const { error } = await supabase.rpc("set_event_signup_requirements", {
    p_event_id: eventId,
    p_requirements: sanitizedRequirements,
  });

  if (error) {
    throw error;
  }

  const updatedEvent = await fetchCalendarEventById(eventId);

  if (!updatedEvent) {
    throw new Error("The event slots were updated, but the event could not be reloaded.");
  }

  return updatedEvent;
}

export async function signUpForEvent(eventId) {
  const supabase = getSupabaseClient();

  if (!supabase) {
    throw new Error("Supabase is not configured yet.");
  }

  const { error } = await supabase.rpc("sign_up_for_event", {
    p_event_id: eventId,
  });

  if (error) {
    throw error;
  }
}

export async function withdrawFromEvent(eventId) {
  const supabase = getSupabaseClient();

  if (!supabase) {
    throw new Error("Supabase is not configured yet.");
  }

  const { error } = await supabase.rpc("withdraw_from_event", {
    p_event_id: eventId,
  });

  if (error) {
    throw error;
  }
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
