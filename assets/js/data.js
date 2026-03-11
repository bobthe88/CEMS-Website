(() => {
  const today = new Date();

  // Keeps the sample calendar populated with upcoming events until you replace it with real dates.
  function isoDateFromToday(dayOffset) {
    const date = new Date(today);
    date.setDate(today.getDate() + dayOffset);

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  // Replace the public-site sample records below with your actual club data. The roster page now pulls roster data from Supabase, while the rest of the site still uses the sample content below.
  window.CEMS_DATA = {
    club: {
      shortName: "CEMS",
      fullName: "Cadet Emergency Medical Services",
      tagline: "Professional emergency medical readiness for campus, training, and community support.",
      primaryEmail: "cems@institution.edu",
      primaryPhone: "(555) 010-2026",
      headquarters: "Replace with your campus location",
      signupUrl: "https://www.signupgenius.com/",
    },
    roster: [
      {
        name: "Cadet Bennett Marshall",
        certification: "EMT",
        contact: "benentt.marshall@westpoint.edu",
        company: "C-4",
        classYear: "2027",
        leadership: "Cadet in Charge",
      },
      {
        name: "Cadet Brooke Ellis",
        certification: "EMT",
        contact: "brooke.ellis@institution.edu",
        company: "B Company",
        classYear: "2028",
        leadership: "Vice President",
      },
      {
        name: "Cadet Cameron Hayes",
        certification: "68W",
        contact: "cameron.hayes@institution.edu",
        company: "C Company",
        classYear: "2027",
        leadership: "Operations Officer",
      },
      {
        name: "Cadet Dana Mitchell",
        certification: "EMR",
        contact: "dana.mitchell@institution.edu",
        company: "D Company",
        classYear: "2029",
        leadership: "Membership Coordinator",
      },
      {
        name: "Cadet Evan Brooks",
        certification: "EMT",
        contact: "evan.brooks@institution.edu",
        company: "E Company",
        classYear: "2028",
        leadership: "Training Officer",
      },
      {
        name: "Cadet Fiona Grant",
        certification: "AEMT",
        contact: "fiona.grant@institution.edu",
        company: "F Company",
        classYear: "2027",
        leadership: "Equipment Officer",
      },
      {
        name: "Cadet Gavin Moore",
        certification: "68W",
        contact: "gavin.moore@institution.edu",
        company: "G Company",
        classYear: "2029",
        leadership: "Member",
      },
      {
        name: "Cadet Harper Reed",
        certification: "EMT",
        contact: "harper.reed@institution.edu",
        company: "H Company",
        classYear: "2028",
        leadership: "Public Affairs Officer",
      }
    ],
    events: [
      {
        title: "Home Event Medical Coverage",
        date: isoDateFromToday(4),
        startTime: "1300",
        endTime: "1700",
        location: "Primary Stadium / Venue",
        category: "Staffing",
        description: "Coverage detail for a major campus event requiring a visible and disciplined CEMS presence.",
        signupOpen: true,
        signupUrl: "https://www.signupgenius.com/",
      },
      {
        title: "Trauma Skills Refresher",
        date: isoDateFromToday(7),
        startTime: "1830",
        endTime: "2030",
        location: "Training Room 101",
        category: "Training",
        description: "Hands-on airway, hemorrhage control, patient packaging, and handoff practice.",
        signupOpen: true,
        signupUrl: "https://www.signupgenius.com/",
      },
      {
        title: "Weekend Duty Rotation",
        date: isoDateFromToday(11),
        startTime: "0800",
        endTime: "1200",
        location: "Campus Quad",
        category: "Weekend",
        description: "Weekend support window for campus activity coverage and standby response.",
        signupOpen: true,
        signupUrl: "https://www.signupgenius.com/",
      },
      {
        title: "Mass Casualty Tabletop",
        date: isoDateFromToday(16),
        startTime: "1900",
        endTime: "2100",
        location: "Leadership Lab",
        category: "Training",
        description: "Scenario-based command and triage planning focused on communication and delegation.",
        signupOpen: false,
        signupUrl: "",
      },
      {
        title: "Spring Open House Coverage",
        date: isoDateFromToday(20),
        startTime: "0900",
        endTime: "1500",
        location: "Main Parade Field",
        category: "Staffing",
        description: "High-visibility public-facing standby shift for visitors and campus activities.",
        signupOpen: true,
        signupUrl: "https://www.signupgenius.com/",
      },
      {
        title: "Senior-to-Junior Turnover Brief",
        date: isoDateFromToday(27),
        startTime: "1800",
        endTime: "1930",
        location: "Club Headquarters",
        category: "Weekend",
        description: "Leadership continuity meeting covering operations, equipment, and expectations for the next cycle.",
        signupOpen: false,
        signupUrl: "",
      }
    ],
    leadershipRows: [
      [
        {
          role: "President",
          name: "Cadet Alex Carter",
          email: "alex.carter@institution.edu",
          phone: "(555) 010-2026",
        }
      ],
      [
        {
          role: "Vice President",
          name: "Cadet Brooke Ellis",
          email: "brooke.ellis@institution.edu",
          phone: "(555) 010-2027",
        },
        {
          role: "Operations Officer",
          name: "Cadet Cameron Hayes",
          email: "cameron.hayes@institution.edu",
          phone: "(555) 010-2028",
        },
        {
          role: "Training Officer",
          name: "Cadet Evan Brooks",
          email: "evan.brooks@institution.edu",
          phone: "(555) 010-2029",
        }
      ],
      [
        {
          role: "Membership & Records",
          name: "Cadet Dana Mitchell",
          email: "dana.mitchell@institution.edu",
          phone: "(555) 010-2030",
        },
        {
          role: "Equipment Officer",
          name: "Cadet Fiona Grant",
          email: "fiona.grant@institution.edu",
          phone: "(555) 010-2031",
        },
        {
          role: "Public Affairs Officer",
          name: "Cadet Harper Reed",
          email: "harper.reed@institution.edu",
          phone: "(555) 010-2032",
        }
      ]
    ],
    documents: [
      {
        title: "CEMS Standard Operating Procedure",
        category: "Operations",
        description: "Primary reference for mission execution, expectations, duty standards, and response procedures.",
        status: "Upload pending",
        href: "",
      },
      {
        title: "New Member Onboarding Guide",
        category: "Training",
        description: "Orientation packet for new members covering standards, equipment, and recurring tasks.",
        status: "Upload pending",
        href: "",
      },
      {
        title: "Airway and Trauma Skills Manual",
        category: "Training",
        description: "Core training reference for recurring medical skill refreshers and evaluation prep.",
        status: "Upload pending",
        href: "",
      },
      {
        title: "Event Coverage Checklist",
        category: "Administrative",
        description: "Standard checklist for staffing details, gear prep, reporting, and post-event accountability.",
        status: "Upload pending",
        href: "",
      },
      {
        title: "Equipment Inventory Sheet",
        category: "Administrative",
        description: "Track bag issue, return status, readiness levels, and replacement needs.",
        status: "Upload pending",
        href: "",
      }
    ],
    gallery: [
      {
        title: "Event Coverage",
        description: "Add a sharp on-duty image that shows professionalism and readiness.",
        image: "",
      },
      {
        title: "Training Night",
        description: "Swap in a photo from a hands-on skills lab or classroom session.",
        image: "",
      },
      {
        title: "Team Portrait",
        description: "Feature the club in uniform or at a major annual event.",
        image: "",
      },
      {
        title: "Weekend Operations",
        description: "Use a candid scene from weekend support or standby coverage.",
        image: "",
      },
      {
        title: "Leadership Team",
        description: "Highlight the current leadership group with an official photo.",
        image: "",
      },
      {
        title: "Community Presence",
        description: "Show outreach, recruiting, or collaborative support with other organizations.",
        image: "",
      }
    ],
  };
})();
