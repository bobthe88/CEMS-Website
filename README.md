# CEMS Website

Static GitHub Pages site for the CEMS club, now upgraded with a member-gated experience and a Supabase-backed roster with staff-only editing.

## Current architecture

- The site still uses static HTML, CSS, and JavaScript behind a member login gate
- The roster uses Supabase database storage with authenticated member read access
- Staff accounts sign in on the roster page to manage records
- Staff accounts can add, edit, and delete roster records directly on the site

## Main files

- `index.html` protected homepage
- `portal.html` login portal for the protected site
- `roster.html` member-only roster page with staff editing tools
- `assets/css/styles.css` shared styling
- `assets/js/site.js` protected page behavior and shared navigation
- `assets/js/supabase-config.js` your Supabase project configuration
- `assets/js/supabase-client.js` shared Supabase helpers
- `assets/js/auth-guard.js` shared member-login gate for protected pages
- `assets/js/portal.js` login workflow
- `assets/js/roster-app.js` member-only roster and staff editing workflow
- `supabase/setup.sql` tables, policies, trigger, and starter roster seed

## What changed

The roster is no longer sourced from `assets/js/data.js` on the roster page.

Instead:

- `assets/js/data.js` still supports the protected static pages after login
- `roster.html` now loads the roster from Supabase for signed-in members and staff
- staff users can edit roster records from the website itself

## Supabase setup steps

1. Create a Supabase project.
2. Open the SQL editor in Supabase.
3. Run `supabase/setup.sql`.
4. In Supabase Auth, create the member and staff user accounts you want to use.
5. Re-run `supabase/setup.sql` if you previously enabled public roster viewing, so the authenticated-only policy replaces it.
6. Promote staff users by updating `public.user_profiles.role` from `member` to `staff`.
7. Open `assets/js/supabase-config.js` and replace the placeholder values with your project URL and publishable or anon key.
8. Push the updated site to GitHub Pages.

## Promoting a staff user

After the user exists in Supabase Auth, run a query like this in the SQL editor:

```sql
update public.user_profiles
set role = 'staff'
where email = 'staff.member@westpoint.edu';
```

## Roster seed data

`supabase/setup.sql` seeds the Supabase roster with the same values currently in your roster table, so signed-in members start with the records you already had.

## Important note about keys

The browser-facing Supabase key used here is the publishable or legacy anon key, which Supabase documents as safe for client-side use when row-level security is enabled.

Because this project is deployed as a static GitHub Pages site, the login gate protects normal page access and all Supabase-backed data, but static assets you publish directly in the repo remain publicly retrievable by URL.

## GitHub Pages deployment

1. Push the repository to GitHub.
2. Open the repository settings.
3. Open `Pages`.
4. Under `Build and deployment`, choose `Deploy from a branch`.
5. Select the `main` branch and the `/ (root)` folder.
6. Save.

## Next upgrades you could add later

- move more protected content out of static files and into Supabase-backed views
- add staff management for events and documents
- move more public stats from `data.js` into Supabase-backed views
- invite-based onboarding for new members

