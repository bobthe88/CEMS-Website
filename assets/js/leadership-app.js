import { fetchLeadershipDirectory } from "./supabase-client.js";

const TIER_ORDER = {
  oic: 0,
  cic: 1,
  acic: 2,
  director: 3,
  leader: 4,
};

const state = {
  initialized: false,
};

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeLeadership(value) {
  return normalizeText(value).toLowerCase();
}

function normalizeDirectoryRow(row) {
  return {
    name: normalizeText(row?.name) || "Unnamed leader",
    email: normalizeText(row?.email),
    phone: normalizeText(row?.phone),
    leadership: normalizeText(row?.leadership),
  };
}

function isMember(row) {
  return normalizeLeadership(row.leadership) === "member";
}

function getTier(row) {
  const leadership = normalizeLeadership(row.leadership);

  if (!leadership) {
    return TIER_ORDER.leader;
  }

  if (leadership === "oic" || leadership === "officer in charge") {
    return TIER_ORDER.oic;
  }

  if (leadership === "cic" || leadership === "cadet in charge") {
    return TIER_ORDER.cic;
  }

  if (leadership === "acic" || leadership === "assistant cadet in charge") {
    return TIER_ORDER.acic;
  }

  if (leadership.includes("director")) {
    return TIER_ORDER.director;
  }

  return TIER_ORDER.leader;
}

function getRoleLabel(row, fallbackLabel) {
  const leadership = normalizeLeadership(row.leadership);

  if (fallbackLabel) {
    return fallbackLabel;
  }

  if (leadership === "oic" || leadership === "officer in charge") {
    return "OIC";
  }

  if (leadership === "cic" || leadership === "cadet in charge") {
    return "CIC";
  }

  if (leadership === "acic" || leadership === "assistant cadet in charge") {
    return "ACIC";
  }

  return row.leadership || "Leader";
}

function groupByTier(rows) {
  return rows.reduce(
    (groups, row) => {
      if (isMember(row)) {
        return groups;
      }

      const normalizedRow = normalizeDirectoryRow(row);
      const tier = getTier(normalizedRow);

      if (tier === TIER_ORDER.oic) {
        groups.oic.push(normalizedRow);
        return groups;
      }

      if (tier === TIER_ORDER.cic) {
        groups.cic.push(normalizedRow);
        return groups;
      }

      if (tier === TIER_ORDER.acic) {
        groups.acic.push(normalizedRow);
        return groups;
      }

      if (tier === TIER_ORDER.director) {
        groups.directors.push(normalizedRow);
        return groups;
      }

      groups.leaders.push(normalizedRow);
      return groups;
    },
    {
      oic: [],
      cic: [],
      acic: [],
      directors: [],
      leaders: [],
    }
  );
}

function sortByName(left, right) {
  return left.name.localeCompare(right.name);
}

function chunk(values, size) {
  const chunks = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}

function renderContactLinks(row) {
  const emailMarkup = row.email
    ? `<a href="mailto:${encodeURIComponent(row.email)}">${escapeHtml(row.email)}</a>`
    : "";
  const phoneDigits = row.phone.replace(/[^0-9]/g, "");
  const phoneMarkup = phoneDigits
    ? `<a href="tel:${escapeHtml(phoneDigits)}">${escapeHtml(row.phone)}</a>`
    : "";

  if (emailMarkup && phoneMarkup) {
    return `${emailMarkup}<br>${phoneMarkup}`;
  }

  return emailMarkup || phoneMarkup || "";
}

function renderNode(row, options = {}) {
  if (options.placeholder) {
    return `
      <article class="org-node placeholder">
        <span class="org-role">${escapeHtml(options.roleLabel || "OIC")}</span>
        <h3>${escapeHtml(options.title || "Not assigned")}</h3>
        <p class="muted-text">${escapeHtml(options.description || "This position is not assigned in the roster yet.")}</p>
      </article>
    `;
  }

  const roleLabel = getRoleLabel(row, options.roleLabel);
  const contactLinks = renderContactLinks(row);

  return `
    <article class="org-node">
      <span class="org-role">${escapeHtml(roleLabel)}</span>
      <h3>${escapeHtml(row.name)}</h3>
      ${contactLinks}
    </article>
  `;
}

function renderRow(nodes, options = {}) {
  const rowClass = options.single
    ? "org-row single"
    : options.dual
      ? "org-row dual"
      : "org-row";
  return `
    <div class="${rowClass}">
      ${nodes.join("")}
    </div>
  `;
}

function buildChartMarkup(groups) {
  const rows = [];

  const oic = groups.oic[0] || null;
  const cic = groups.cic[0] || null;
  rows.push({
    nodes: [
      oic
        ? renderNode(oic, { roleLabel: "OIC" })
        : renderNode(null, {
            placeholder: true,
            roleLabel: "OIC",
            title: "OIC not assigned",
            description: "This position is above the CIC and is not assigned in the roster yet.",
          }),
      cic
        ? renderNode(cic, { roleLabel: "CIC" })
        : renderNode(null, {
            placeholder: true,
            roleLabel: "CIC",
            title: "CIC not assigned",
            description: "This position is the head of the cadet chain and is not assigned in the roster yet.",
          }),
    ],
    dual: true,
  });

  const acic = groups.acic[0] || null;
  rows.push({
    nodes: [
      acic
        ? renderNode(acic, { roleLabel: "ACIC" })
        : renderNode(null, {
            placeholder: true,
            roleLabel: "ACIC",
            title: "ACIC not assigned",
            description: "This position sits directly beneath the CIC and is not assigned in the roster yet.",
          }),
    ],
    single: true,
  });

  const directors = [...groups.directors].sort(sortByName);
  const remainingLeaders = [
    ...groups.leaders,
    ...groups.oic.slice(1),
    ...groups.cic.slice(cic ? 1 : 0),
    ...groups.acic.slice(acic ? 1 : 0),
  ].sort((left, right) => {
    const tierDelta = getTier(left) - getTier(right);
    if (tierDelta !== 0) {
      return tierDelta;
    }

    return left.name.localeCompare(right.name);
  });

  if (directors.length) {
    chunk(directors, 3).forEach((group) => {
      rows.push({
        nodes: group.map((row) => {
          return renderNode(row, { roleLabel: row.leadership || "Director" });
        }),
        single: group.length === 1,
      });
    });
  }

  if (remainingLeaders.length) {
    chunk(remainingLeaders, 3).forEach((group) => {
      rows.push({
        nodes: group.map((row) => {
          return renderNode(row, { roleLabel: row.leadership || "Leader" });
        }),
        single: group.length === 1,
      });
    });
  }

  return rows
    .map((row, index) => {
      const rowMarkup = renderRow(row.nodes, { single: row.single, dual: row.dual });
      return index < rows.length - 1 ? `${rowMarkup}<div class="org-connector" aria-hidden="true"></div>` : rowMarkup;
    })
    .join("");
}

async function renderLeadershipChart() {
  const chart = document.getElementById("leadership-chart");

  if (!chart || typeof fetchLeadershipDirectory !== "function") {
    return;
  }

  let directory;

  try {
    directory = await fetchLeadershipDirectory();
  } catch (_error) {
    return;
  }

  const rows = Array.isArray(directory) ? directory : [];
  const groups = groupByTier(rows);

  chart.innerHTML = buildChartMarkup(groups);
}

export async function initializeLeadershipApp() {
  if (state.initialized) {
    return () => {};
  }

  state.initialized = true;
  await renderLeadershipChart();
  return () => {};
}

if (document.readyState === "loading") {
  document.addEventListener(
    "DOMContentLoaded",
    () => {
      void initializeLeadershipApp();
    },
    { once: true }
  );
} else {
  void initializeLeadershipApp();
}
