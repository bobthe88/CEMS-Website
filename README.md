# CEMS Website

Static GitHub Pages site for the CEMS club, now upgraded with a Supabase-backed protected roster.

## Current architecture

- Public pages still use static HTML, CSS, and JavaScript
- The protected roster uses Supabase authentication and database storage
- Member accounts can view the protected roster
- Staff accounts can add, edit, and delete roster records directly on the site

## Main files

- `index.html` public homepage
- `portal.html` member and staff login portal
- `roster.html` protected roster page
- `assets/css/styles.css` shared styling
- `assets/js/site.js` public page behavior and shared navigation
- `assets/js/supabase-config.js` your Supabase project configuration
- `assets/js/supabase-client.js` shared Supabase helpers
- `assets/js/portal.js` login workflow
- `assets/js/roster-app.js` protected roster workflow
- `supabase/setup.sql` tables, policies, trigger, and starter roster seed

## What changed

The roster is no longer sourced from `assets/js/data.js` on the roster page.

Instead:

- `assets/js/data.js` still supports the static public pages
- `roster.html` now loads the roster from Supabase
- staff users can edit roster records from the website itself

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

## Roster seed data

`supabase/setup.sql` seeds the Supabase roster with the same values currently in your roster table, so the protected roster starts with the records you already had.

## Important note about keys

The browser-facing Supabase key used here is the publishable or legacy anon key, which Supabase documents as safe for client-side use when row-level security is enabled.

## GitHub Pages deployment

1. Push the repository to GitHub.
2. Open the repository settings.
3. Open `Pages`.
4. Under `Build and deployment`, choose `Deploy from a branch`.
5. Select the `main` branch and the `/ (root)` folder.
6. Save.

## Next upgrades you could add later

- protect additional pages like documents or calendars behind member access
- add staff management for events and documents
- move more public stats from `data.js` into Supabase-backed views
- invite-based onboarding for new members
