import { fetchCalendarEvents, isSupabaseConfigured } from "./supabase-client.js";

if (window.CEMS_DATA && isSupabaseConfigured()) {
  try {
    window.CEMS_DATA.events = await fetchCalendarEvents();
  } catch (error) {
    console.warn("Unable to load Supabase calendar events; using static fallback data instead.", error);
  }
}
