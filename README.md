# CEMS Website

Static GitHub Pages site for the CEMS club, upgraded with a Supabase-backed roster and calendar for member access with staff-only editing tools.

## Current architecture

- The site still uses static HTML, CSS, and JavaScript behind a member login gate
- The roster and calendar use Supabase database storage
- Members can view protected pages after portal sign-in
- Staff accounts can add, edit, and delete roster members and calendar events directly on the site

## Main files

- `index.html` protected homepage
- `calendar.html` protected calendar page with staff editing tools
- `roster.html` protected roster page with staff editing tools
- `portal.html` login portal for the protected site
- `assets/css/styles.css` shared styling
- `assets/js/site.js` protected page behavior and shared navigation
- `assets/js/auth-guard.js` shared member-login gate for protected pages
- `assets/js/portal.js` login workflow
- `assets/js/roster-app.js` roster and staff editing workflow
- `assets/js/calendar-app.js` calendar and staff editing workflow
- `assets/js/events-bootstrap.js` live event bootstrap for the homepage and signup page
- `assets/js/supabase-client.js` shared Supabase helpers
- `assets/js/supabase-config.js` your Supabase project configuration
- `supabase/setup.sql` tables, policies, triggers, and starter roster/calendar seed data

## What changed

- `roster.html` loads roster members from Supabase for signed-in members
- `calendar.html` loads calendar events from Supabase and gives staff on-page calendar editing tools
- the homepage and signup page now pull their event cards from the same Supabase event table
- `assets/js/data.js` still provides fallback/sample content for the rest of the protected site

## Supabase setup steps

1. Create a Supabase project.
2. Open the SQL editor in Supabase.
3. Run `supabase/setup.sql`.
4. In Supabase Auth, create the member and staff user accounts you want to use.
5. Promote staff users by updating `public.user_profiles.role` from `member` to `staff`.
6. Open `assets/js/supabase-config.js` and replace the placeholder values with your project URL and publishable or anon key.
7. Push the updated site to GitHub Pages.

## Promoting a staff user

After the user exists in Supabase Auth, run a query like this in the SQL editor:

```sql
update public.user_profiles
set role = 'staff'
where email = 'staff.member@westpoint.edu';
```

## Seed data

`supabase/setup.sql` seeds both the roster and calendar tables so the member pages start with working sample data.

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
- add staff management for documents
- add recurring-event helpers for common training or staffing patterns
- invite-based onboarding for new members
