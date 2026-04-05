import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type RequestPayload = {
  eventTitle?: string;
  requestedPeople?: number;
  eventDate?: string;
  description?: string;
  requestSource?: string;
  requesterName?: string;
  requesterEmail?: string;
};

type ServiceRequestRow = {
  id: string;
  event_title: string;
  requested_people: number;
  description: string;
  event_date: string;
  status: string;
  requester_name: string;
  requester_email: string;
  request_source: string;
  notification_status: string;
  notification_error: string;
  reviewer_notes: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

type LeadershipRecipient = {
  role: string;
  email: string;
  name: string;
  source: string;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const ROLE_MATCHERS = [
  {
    key: "cic",
    labels: ["cic", "cadet in charge"],
    envKey: "SERVICE_REQUEST_CIC_EMAIL",
  },
  {
    key: "acic",
    labels: ["acic", "assistant cadet in charge"],
    envKey: "SERVICE_REQUEST_ACIC_EMAIL",
  },
  {
    key: "executive officer",
    labels: ["executive officer", "exec officer"],
    envKey: "SERVICE_REQUEST_EXECUTIVE_OFFICER_EMAIL",
  },
  {
    key: "director of operations",
    labels: ["director of operations", "director of ops", "operations officer"],
    envKey: "SERVICE_REQUEST_DIRECTOR_OF_OPERATIONS_EMAIL",
  },
];

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders,
  });
}

function normalizeText(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeLeadership(value: unknown) {
  return normalizeText(value).toLowerCase();
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isValidDate(value: unknown) {
  return /^\d{4}-\d{2}-\d{2}$/.test(normalizeText(value));
}

function parseRequestedPeople(value: unknown) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error("Requested number of people must be at least 1.");
  }

  return parsed;
}

function parsePayload(value: unknown): RequestPayload {
  if (!value || typeof value !== "object") {
    throw new Error("Request payload must be a JSON object.");
  }

  const payload = value as RequestPayload;
  const eventTitle = normalizeText(payload.eventTitle);
  const description = normalizeText(payload.description);
  const eventDate = normalizeText(payload.eventDate);

  if (!eventTitle) {
    throw new Error("Event title is required.");
  }

  if (eventTitle.length > 120) {
    throw new Error("Event title must be 120 characters or fewer.");
  }

  if (!description) {
    throw new Error("Description is required.");
  }

  if (description.length > 500) {
    throw new Error("Description must be 500 characters or fewer.");
  }

  if (!isValidDate(eventDate)) {
    throw new Error("Event date is required and must be formatted as YYYY-MM-DD.");
  }

  return {
    eventTitle,
    requestedPeople: parseRequestedPeople(payload.requestedPeople),
    eventDate,
    description,
    requestSource: normalizeText(payload.requestSource) || "public-site",
    requesterName: normalizeText(payload.requesterName),
    requesterEmail: normalizeText(payload.requesterEmail),
  };
}

function getSupabaseClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error("Supabase service credentials are not configured.");
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function buildEmailHtml(request: ServiceRequestRow) {
  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #101417;">
      <h2 style="margin: 0 0 12px;">New CEMS service request</h2>
      <p style="margin: 0 0 12px;">A new request was submitted from the public website and added to the staff queue.</p>
      <table cellpadding="0" cellspacing="0" style="border-collapse: collapse; width: 100%; max-width: 640px;">
        <tbody>
          <tr><td style="padding: 6px 0; font-weight: 700;">Event title</td><td style="padding: 6px 0;">${escapeHtml(request.event_title)}</td></tr>
          <tr><td style="padding: 6px 0; font-weight: 700;">Requested people</td><td style="padding: 6px 0;">${escapeHtml(request.requested_people)}</td></tr>
          <tr><td style="padding: 6px 0; font-weight: 700;">Date</td><td style="padding: 6px 0;">${escapeHtml(request.event_date)}</td></tr>
          <tr><td style="padding: 6px 0; font-weight: 700;">Description</td><td style="padding: 6px 0;">${escapeHtml(request.description)}</td></tr>
          <tr><td style="padding: 6px 0; font-weight: 700;">Reference</td><td style="padding: 6px 0;">${escapeHtml(request.id)}</td></tr>
          <tr><td style="padding: 6px 0; font-weight: 700;">Queue status</td><td style="padding: 6px 0;">${escapeHtml(request.status)}</td></tr>
        </tbody>
      </table>
    </div>
  `;
}

function buildEmailText(request: ServiceRequestRow) {
  return [
    "New CEMS service request",
    "",
    `Event title: ${request.event_title}`,
    `Requested people: ${request.requested_people}`,
    `Date: ${request.event_date}`,
    `Description: ${request.description}`,
    `Reference: ${request.id}`,
    `Queue status: ${request.status}`,
  ].join("\n");
}

async function fetchLeadershipRecipients(supabase: ReturnType<typeof getSupabaseClient>) {
  const { data, error } = await supabase
    .from("roster_members")
    .select("name, contact, leadership");

  if (error) {
    throw error;
  }

  const rows = Array.isArray(data) ? data : [];
  const missingRoles: string[] = [];
  const recipients: LeadershipRecipient[] = [];

  for (const role of ROLE_MATCHERS) {
    const matchedRow = rows.find((row) => {
      const leadership = normalizeLeadership(row?.leadership);
      return role.labels.some((label) => leadership === label || leadership.includes(label));
    });

    const fallbackEmail = normalizeText(Deno.env.get(role.envKey));
    const email = normalizeText(matchedRow?.contact || fallbackEmail);

    if (!email) {
      missingRoles.push(role.key);
      continue;
    }

    recipients.push({
      role: role.key,
      email,
      name: normalizeText(matchedRow?.name || role.key),
      source: matchedRow ? "roster" : fallbackEmail ? "secret" : "",
    });
  }

  const uniqueRecipients: LeadershipRecipient[] = [];
  const seenEmails = new Set<string>();

  for (const recipient of recipients) {
    const normalizedEmail = recipient.email.toLowerCase();

    if (seenEmails.has(normalizedEmail)) {
      continue;
    }

    seenEmails.add(normalizedEmail);
    uniqueRecipients.push(recipient);
  }

  return {
    recipients: uniqueRecipients,
    missingRoles,
  };
}

async function sendLeadershipEmail(recipient: LeadershipRecipient, request: ServiceRequestRow) {
  const resendApiKey = Deno.env.get("RESEND_API_KEY") || "";
  const fromEmail = Deno.env.get("SERVICE_REQUEST_FROM_EMAIL") || "";
  const fromName = normalizeText(Deno.env.get("SERVICE_REQUEST_FROM_NAME")) || "CEMS Service Requests";
  const replyTo = normalizeText(Deno.env.get("SERVICE_REQUEST_REPLY_TO_EMAIL")) || fromEmail;

  if (!resendApiKey || !fromEmail) {
    throw new Error("Email delivery is not configured.");
  }

  const subject = `[CEMS] New service request: ${request.event_title}`;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `${fromName} <${fromEmail}>`,
      to: [recipient.email],
      reply_to: replyTo || undefined,
      subject,
      text: buildEmailText(request),
      html: buildEmailHtml(request),
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(errorBody || `Resend returned ${response.status}.`);
  }
}

async function updateRequestNotificationState(
  supabase: ReturnType<typeof getSupabaseClient>,
  requestId: string,
  notificationStatus: string,
  notificationError = ""
) {
  const { error } = await supabase
    .from("service_requests")
    .update({
      notification_status: notificationStatus,
      notification_error: notificationError,
    })
    .eq("id", requestId);

  if (error) {
    throw error;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  let payload: RequestPayload;

  try {
    payload = parsePayload(await req.json());
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Invalid request payload." }, 400);
  }

  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("service_requests")
      .insert({
        event_title: payload.eventTitle,
        requested_people: payload.requestedPeople,
        description: payload.description,
        event_date: payload.eventDate,
        requester_name: payload.requesterName || "",
        requester_email: payload.requesterEmail || "",
        request_source: payload.requestSource || "public-site",
        status: "pending",
        notification_status: "pending",
        notification_error: "",
      })
      .select("*")
      .single();

    if (error || !data) {
      throw error || new Error("Unable to create the service request.");
    }

    const request = data as ServiceRequestRow;
    const { recipients, missingRoles } = await fetchLeadershipRecipients(supabase);
    const resendApiKey = Deno.env.get("RESEND_API_KEY") || "";
    const fromEmail = Deno.env.get("SERVICE_REQUEST_FROM_EMAIL") || "";

    if (!recipients.length || !resendApiKey || !fromEmail) {
      const missingRolesMessage = missingRoles.length
        ? ` Missing leadership roles: ${missingRoles.join(", ")}.`
        : "";
      const reason = !recipients.length
        ? "No leadership recipients were configured."
        : "Email delivery secrets are not configured.";
      const warning = `${reason}${missingRolesMessage}`.trim();

      await updateRequestNotificationState(supabase, request.id, "not_configured", warning);

      return jsonResponse({
        request,
        notificationStatus: "not_configured",
        warning,
        recipients,
        missingRoles,
      });
    }

    const sendResults = await Promise.allSettled(
      recipients.map((recipient) => sendLeadershipEmail(recipient, request))
    );

    const failedRecipients = sendResults
      .map((result, index) => ({ result, recipient: recipients[index] }))
      .filter(({ result }) => result.status === "rejected")
      .map(({ recipient, result }) => ({
        role: recipient.role,
        email: recipient.email,
        error: (result as PromiseRejectedResult).reason instanceof Error
          ? (result as PromiseRejectedResult).reason.message
          : String((result as PromiseRejectedResult).reason || "Unknown email error"),
      }));

    const hasMissingRoles = missingRoles.length > 0;
    const notificationStatus = failedRecipients.length || hasMissingRoles
      ? failedRecipients.length === recipients.length && !hasMissingRoles
        ? "failed"
        : "partial"
      : "sent";

    const notificationIssues = [
      ...failedRecipients.map((entry) => `${entry.role}: ${entry.error}`),
      ...(hasMissingRoles ? [`missing_roles: ${missingRoles.join(", ")}`] : []),
    ];
    const notificationError = notificationIssues.join(" | ");

    await updateRequestNotificationState(supabase, request.id, notificationStatus, notificationError);

    return jsonResponse({
      request: {
        ...request,
        notification_status: notificationStatus,
        notification_error: notificationError,
      },
      notificationStatus,
      warning: notificationError || "",
      recipients,
      missingRoles,
      failedRecipients,
    });
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Unable to process the request right now." },
      500
    );
  }
});
