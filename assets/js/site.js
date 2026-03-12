function parseISODate(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatDate(dateString, options) {
  return new Intl.DateTimeFormat(
    "en-US",
    options || { month: "short", day: "numeric", year: "numeric" }
  ).format(parseISODate(dateString));
}

function formatTimeRange(startTime, endTime) {
  if (!startTime || !endTime) {
    return "Time TBD";
  }

  function toReadableTime(value) {
    const hours = Number(value.slice(0, 2));
    const minutes = value.slice(2);
    const date = new Date(2000, 0, 1, hours, Number(minutes));

    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  }

  return `${toReadableTime(startTime)} - ${toReadableTime(endTime)}`;
}

function slugify(value) {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return /^[0-9]/.test(slug) ? `tag-${slug}` : slug;
}

function createContactMarkup(value, className) {
  if (!value) {
    return "<span></span>";
  }

  const cssClass = className ? ` class="${className}"` : "";

  if (value.includes("@")) {
    return `<a${cssClass} href="mailto:${value}">${value}</a>`;
  }

  const digits = value.replace(/[^0-9]/g, "");

  if (digits.length >= 10) {
    return `<a${cssClass} href="tel:${digits}">${value}</a>`;
  }

  return `<span${cssClass}>${value}</span>`;
}

function initializeSite() {
  initializeNavigation();
  initializeFooter();

  const data = window.CEMS_DATA;

  if (!data) {
    return;
  }

  initializeHome(data);

  if (document.body.dataset.rosterMode !== "supabase") {
    initializeRoster(data);
  }

  if (document.body.dataset.calendarMode !== "supabase") {
    initializeCalendar(data);
  }
  initializeGallery(data);
  initializeLeadership(data);
  initializeDocuments(data);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeSite, { once: true });
} else {
  initializeSite();
}

const NAVIGATION_CONFIG = {
  public: {
    brandHref: "index.html",
    links: [
      { href: "index.html", page: "home", label: "Home" },
      { href: "about.html", page: "about", label: "About Us" },
      { href: "request-service.html", page: "request-services", label: "Request Services" },
      { href: "leadership.html", page: "leadership", label: "Leadership" },
      { href: "portal.html", page: "portal", label: "Portal" },
    ],
  },
  private: {
    brandHref: "member-home.html",
    links: [
      { href: "member-home.html", page: "member-home", label: "Member Home" },
      { href: "roster.html", page: "roster", label: "Roster" },
      { href: "calendar.html", page: "calendar", label: "Calendar" },
      { href: "gallery.html", page: "gallery", label: "Gallery" },
      { href: "documents.html", page: "documents", label: "Documents" },
    ],
  },
};

function initializeNavigation() {
  const body = document.body;
  const navShell = document.querySelector(".nav-shell");
  const toggle = document.querySelector(".nav-toggle");
  const brand = document.querySelector(".brand");
  const nav = document.querySelector(".site-nav");
  const activePage = body.dataset.page;
  const navScope = body.dataset.navScope === "private" ? "private" : "public";
  const config = NAVIGATION_CONFIG[navScope];

  if (brand && config?.brandHref) {
    brand.setAttribute("href", config.brandHref);
  }

  if (nav && config?.links?.length) {
    nav.innerHTML = config.links
      .map((link) => `<a href="${link.href}" data-page="${link.page}">${link.label}</a>`)
      .join("");
  }

  const navLinks = document.querySelectorAll(".site-nav a");
  navLinks.forEach((link) => {
    if (link.dataset.page === activePage) {
      link.classList.add("active");
    }
  });

  if (!toggle || !navShell) {
    return;
  }

  toggle.addEventListener("click", () => {
    navShell.classList.toggle("nav-open");
    const expanded = toggle.getAttribute("aria-expanded") === "true";
    toggle.setAttribute("aria-expanded", String(!expanded));
  });
}

function initializeFooter() {
  const yearTargets = document.querySelectorAll("[data-current-year]");

  yearTargets.forEach((target) => {
    target.textContent = String(new Date().getFullYear());
  });
}

function getEventCalendarLink(event) {
  if (!event?.id) {
    return "calendar.html";
  }

  return `calendar.html?event=${encodeURIComponent(event.id)}`;
}

function getEventSignupSummary(event) {
  const requirements = Array.isArray(event.signupRequirements) ? event.signupRequirements : [];
  const totalSlots = requirements.reduce(
    (total, requirement) => total + Number(requirement.slotsNeeded || 0),
    0
  );
  const filledSlots = requirements.reduce(
    (total, requirement) => total + (requirement.signups || []).length,
    0
  );

  if (!totalSlots) {
    return "No staffing slots assigned.";
  }

  if (!event.signupOpen) {
    return `${filledSlots} of ${totalSlots} slots filled. Signups closed.`;
  }

  const openSlots = Math.max(totalSlots - filledSlots, 0);

  if (!openSlots) {
    return `All ${totalSlots} staffing slots are filled.`;
  }

  return `${openSlots} of ${totalSlots} staffing slots remain open.`;
}

function createEventCard(event) {
  const categoryClass = slugify(event.category);
  const calendarLink = getEventCalendarLink(event);
  const actionCopy = event.signupOpen ? "Sign up on calendar" : "View on calendar";

  return `
    <article class="info-card event-card">
      <div class="card-topline">
        <span class="category-badge ${categoryClass}">${event.category}</span>
        <span class="muted-text">${formatDate(event.date, {
          month: "short",
          day: "numeric",
        })}</span>
      </div>
      <h3>${event.title}</h3>
      <p>${event.description}</p>
      <div class="detail-list">
        <span>${formatTimeRange(event.startTime, event.endTime)}</span>
        <span>${event.location}</span>
      </div>
      <p class="muted-text">${getEventSignupSummary(event)}</p>
      <a class="text-link" href="${calendarLink}">${actionCopy}</a>
    </article>
  `;
}

function initializeHome(data) {
  const stats = {
    members: data.roster.length,
    leaders: data.leadershipRows.flat().length,
    events: data.events.length,
    documents: data.documents.length,
  };

  const statTargets = {
    members: document.getElementById("stat-members"),
    leaders: document.getElementById("stat-leaders"),
    events: document.getElementById("stat-events"),
    documents: document.getElementById("stat-documents"),
  };

  Object.entries(statTargets).forEach(([key, target]) => {
    if (target) {
      target.textContent = String(stats[key]);
    }
  });

  const homeEvents = document.getElementById("home-events");

  if (homeEvents) {
    const upcoming = [...data.events]
      .sort((left, right) => parseISODate(left.date) - parseISODate(right.date))
      .slice(0, 3);

    homeEvents.innerHTML = upcoming.map(createEventCard).join("");
  }
}

function initializeRoster(data) {
  const rosterBody = document.getElementById("roster-body");

  if (!rosterBody) {
    return;
  }

  const searchInput = document.getElementById("roster-search");
  const certificationFilter = document.getElementById("cert-filter");

  const uniqueCertifications = [...new Set(data.roster.map((member) => member.certification))];
  certificationFilter.innerHTML += uniqueCertifications
    .map((certification) => `<option value="${certification}">${certification}</option>`)
    .join("");

  function renderRoster() {
    const searchValue = searchInput.value.trim().toLowerCase();
    const certificationValue = certificationFilter.value;

    const filtered = data.roster.filter((member) => {
      const matchesSearch = [member.name, member.contact, member.company, member.leadership]
        .join(" ")
        .toLowerCase()
        .includes(searchValue);
      const matchesCertification =
        certificationValue === "All" || member.certification === certificationValue;

      return matchesSearch && matchesCertification;
    });

    rosterBody.innerHTML = filtered
      .map(
        (member) => `
          <tr>
            <td>${member.name}</td>
            <td><span class="category-badge ${slugify(member.certification)}">${member.certification}</span></td>
            <td>${createContactMarkup(member.contact, "table-link")}</td>
            <td>${member.company}</td>
            <td>${member.classYear}</td>
            <td>${member.leadership}</td>
          </tr>
        `
      )
      .join("");

    document.getElementById("roster-total").textContent = String(data.roster.length);
    document.getElementById("roster-visible").textContent = String(filtered.length);
    document.getElementById("roster-certifications").textContent = String(uniqueCertifications.length);
  }

  searchInput.addEventListener("input", renderRoster);
  certificationFilter.addEventListener("change", renderRoster);
  renderRoster();
}

function initializeCalendar(data) {
  const calendarGrid = document.getElementById("calendar-grid");

  if (!calendarGrid) {
    return;
  }

  const title = document.getElementById("calendar-title");
  const monthEvents = document.getElementById("month-events");
  const prevButton = document.getElementById("prev-month");
  const nextButton = document.getElementById("next-month");

  const sortedEvents = [...data.events].sort(
    (left, right) => parseISODate(left.date) - parseISODate(right.date)
  );

  const firstUpcoming = sortedEvents.find((event) => parseISODate(event.date) >= new Date());
  const initialDate = firstUpcoming ? parseISODate(firstUpcoming.date) : new Date();
  let displayedMonth = new Date(initialDate.getFullYear(), initialDate.getMonth(), 1);

  function renderCalendar() {
    const year = displayedMonth.getFullYear();
    const month = displayedMonth.getMonth();

    title.textContent = displayedMonth.toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    });

    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);
    const startingWeekday = firstDayOfMonth.getDay();
    const totalDays = lastDayOfMonth.getDate();

    const eventMap = data.events.reduce((map, event) => {
      if (!map[event.date]) {
        map[event.date] = [];
      }

      map[event.date].push(event);
      return map;
    }, {});

    const calendarCells = [];

    for (let index = 0; index < startingWeekday; index += 1) {
      calendarCells.push('<div class="calendar-cell empty" aria-hidden="true"></div>');
    }

    for (let day = 1; day <= totalDays; day += 1) {
      const isoDate = [
        year,
        String(month + 1).padStart(2, "0"),
        String(day).padStart(2, "0"),
      ].join("-");
      const events = eventMap[isoDate] || [];
      const eventBadges = events
        .slice(0, 2)
        .map(
          (event) =>
            `<span class="calendar-pill ${slugify(event.category)}">${event.category}</span>`
        )
        .join("");
      const overflow = events.length > 2 ? `<span class="calendar-more">+${events.length - 2}</span>` : "";

      calendarCells.push(`
        <article class="calendar-cell">
          <span class="calendar-day">${day}</span>
          <div class="calendar-cell-events">
            ${eventBadges}
            ${overflow}
          </div>
        </article>
      `);
    }

    calendarGrid.innerHTML = calendarCells.join("");

    const monthlyEvents = sortedEvents.filter((event) => {
      const eventDate = parseISODate(event.date);
      return eventDate.getFullYear() === year && eventDate.getMonth() === month;
    });

    monthEvents.innerHTML = monthlyEvents.length
      ? monthlyEvents
          .map(
            (event) => `
              <article class="timeline-card">
                <div class="timeline-date">
                  <strong>${formatDate(event.date, { month: "short", day: "numeric" })}</strong>
                  <span>${formatTimeRange(event.startTime, event.endTime)}</span>
                </div>
                <div class="timeline-copy">
                  <span class="category-badge ${slugify(event.category)}">${event.category}</span>
                  <h3>${event.title}</h3>
                  <p>${event.description}</p>
                  <p class="muted-text">${event.location}</p>
                </div>
              </article>
            `
          )
          .join("")
      : '<p class="empty-state">No events are loaded for this month yet.</p>';
  }

  prevButton.addEventListener("click", () => {
    displayedMonth = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth() - 1, 1);
    renderCalendar();
  });

  nextButton.addEventListener("click", () => {
    displayedMonth = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth() + 1, 1);
    renderCalendar();
  });

  renderCalendar();
}

function initializeGallery(data) {
  const galleryGrid = document.getElementById("gallery-grid");

  if (!galleryGrid) {
    return;
  }

  galleryGrid.innerHTML = data.gallery
    .map((item, index) => {
      const backgroundStyle = item.image
        ? `style="background-image: linear-gradient(180deg, rgba(12, 16, 20, 0.08), rgba(12, 16, 20, 0.82)), url('${item.image}');"`
        : "";
      const tileClass = item.image ? "gallery-tile has-image" : "gallery-tile";

      return `
        <article class="${tileClass}" ${backgroundStyle}>
          <span class="gallery-index">0${index + 1}</span>
          <div class="gallery-copy">
            <h3>${item.title}</h3>
            <p>${item.description}</p>
          </div>
        </article>
      `;
    })
    .join("");
}

function initializeLeadership(data) {
  const chart = document.getElementById("leadership-chart");

  if (!chart) {
    return;
  }

  chart.innerHTML = data.leadershipRows
    .map((row, index) => {
      const rowHtml = `
        <div class="org-row ${row.length === 1 ? "single" : ""}">
          ${row
            .map(
              (member) => `
                <article class="org-node">
                  <span class="org-role">${member.role}</span>
                  <h3>${member.name}</h3>
                  <a href="mailto:${member.email}">${member.email}</a>
                  <a href="tel:${member.phone.replace(/[^0-9]/g, "")}">${member.phone}</a>
                </article>
              `
            )
            .join("")}
        </div>
      `;

      return index < data.leadershipRows.length - 1
        ? `${rowHtml}<div class="org-connector" aria-hidden="true"></div>`
        : rowHtml;
    })
    .join("");
}

function initializeDocuments(data) {
  const documentsGrid = document.getElementById("documents-grid");

  if (!documentsGrid) {
    return;
  }

  const groupedDocuments = data.documents.reduce((groups, document) => {
    if (!groups[document.category]) {
      groups[document.category] = [];
    }

    groups[document.category].push(document);
    return groups;
  }, {});

  documentsGrid.innerHTML = Object.entries(groupedDocuments)
    .map(
      ([category, documents]) => `
        <section class="document-group">
          <div class="section-heading compact">
            <div>
              <p class="eyebrow">Document Group</p>
              <h2>${category}</h2>
            </div>
          </div>
          <div class="card-grid">
            ${documents
              .map((document) => {
                const action = document.href
                  ? `<a class="button button-secondary" href="${document.href}" target="_blank" rel="noreferrer">Open document</a>`
                  : `<span class="button button-secondary disabled">Upload PDF to enable</span>`;

                return `
                  <article class="info-card document-card">
                    <div class="card-topline">
                      <span class="category-badge ${slugify(category)}">${category}</span>
                      <span class="muted-text">${document.status}</span>
                    </div>
                    <h3>${document.title}</h3>
                    <p>${document.description}</p>
                    ${action}
                  </article>
                `;
              })
              .join("")}
          </div>
        </section>
      `
    )
    .join("");
}
