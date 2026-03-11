-- CEMS Supabase setup
-- Run this file in the Supabase SQL editor after creating your project.

create extension if not exists pgcrypto;

create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  role text not null default 'member' check (role in ('member', 'staff')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.roster_members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  certification text not null check (certification in ('AEMT', 'EMT', 'EMR', '68W')),
  contact text not null,
  company text not null,
  class_year text not null,
  leadership text not null default 'Member',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  event_date date not null,
  start_time text check (start_time is null or start_time ~ '^([01][0-9]|2[0-3])[0-5][0-9]$'),
  end_time text check (end_time is null or end_time ~ '^([01][0-9]|2[0-3])[0-5][0-9]$'),
  location text not null,
  category text not null check (category in ('Staffing', 'Training', 'Weekend')),
  description text not null,
  signup_open boolean not null default false,
  signup_url text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (user_id, email, role)
  values (new.id, new.email, 'member')
  on conflict (user_id) do update
  set email = excluded.email;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

insert into public.user_profiles (user_id, email, role)
select id, email, 'member'
from auth.users
on conflict (user_id) do update
set email = excluded.email;

drop trigger if exists set_user_profiles_updated_at on public.user_profiles;
create trigger set_user_profiles_updated_at
  before update on public.user_profiles
  for each row execute procedure public.set_updated_at();

drop trigger if exists set_roster_members_updated_at on public.roster_members;
create trigger set_roster_members_updated_at
  before update on public.roster_members
  for each row execute procedure public.set_updated_at();

drop trigger if exists set_calendar_events_updated_at on public.calendar_events;
create trigger set_calendar_events_updated_at
  before update on public.calendar_events
  for each row execute procedure public.set_updated_at();

alter table public.user_profiles enable row level security;
alter table public.roster_members enable row level security;
alter table public.calendar_events enable row level security;

-- Remove old policies if you rerun the file.
drop policy if exists "Users can view their own profile" on public.user_profiles;
drop policy if exists "Authenticated users can view roster" on public.roster_members;
drop policy if exists "Anyone can view roster" on public.roster_members;
drop policy if exists "Staff can insert roster rows" on public.roster_members;
drop policy if exists "Staff can update roster rows" on public.roster_members;
drop policy if exists "Staff can delete roster rows" on public.roster_members;
drop policy if exists "Authenticated users can view events" on public.calendar_events;
drop policy if exists "Staff can insert calendar events" on public.calendar_events;
drop policy if exists "Staff can update calendar events" on public.calendar_events;
drop policy if exists "Staff can delete calendar events" on public.calendar_events;

create policy "Users can view their own profile"
  on public.user_profiles
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Authenticated users can view roster"
  on public.roster_members
  for select
  to authenticated
  using (true);

create policy "Staff can insert roster rows"
  on public.roster_members
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.user_profiles profiles
      where profiles.user_id = (select auth.uid())
        and profiles.role = 'staff'
    )
  );

create policy "Staff can update roster rows"
  on public.roster_members
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.user_profiles profiles
      where profiles.user_id = (select auth.uid())
        and profiles.role = 'staff'
    )
  )
  with check (
    exists (
      select 1
      from public.user_profiles profiles
      where profiles.user_id = (select auth.uid())
        and profiles.role = 'staff'
    )
  );

create policy "Staff can delete roster rows"
  on public.roster_members
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.user_profiles profiles
      where profiles.user_id = (select auth.uid())
        and profiles.role = 'staff'
    )
  );

create policy "Authenticated users can view events"
  on public.calendar_events
  for select
  to authenticated
  using (true);

create policy "Staff can insert calendar events"
  on public.calendar_events
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.user_profiles profiles
      where profiles.user_id = (select auth.uid())
        and profiles.role = 'staff'
    )
  );

create policy "Staff can update calendar events"
  on public.calendar_events
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.user_profiles profiles
      where profiles.user_id = (select auth.uid())
        and profiles.role = 'staff'
    )
  )
  with check (
    exists (
      select 1
      from public.user_profiles profiles
      where profiles.user_id = (select auth.uid())
        and profiles.role = 'staff'
    )
  );

create policy "Staff can delete calendar events"
  on public.calendar_events
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.user_profiles profiles
      where profiles.user_id = (select auth.uid())
        and profiles.role = 'staff'
    )
  );

insert into public.roster_members (name, certification, contact, company, class_year, leadership)
select *
from (
  values
    ('Cadet Bennett Marshall', 'EMT', 'benentt.marshall@westpoint.edu', 'C-4', '2027', 'Cadet in Charge'),
    ('Cadet Brooke Ellis', 'EMT', 'brooke.ellis@institution.edu', 'B Company', '2028', 'Vice President'),
    ('Cadet Cameron Hayes', '68W', 'cameron.hayes@institution.edu', 'C Company', '2027', 'Operations Officer'),
    ('Cadet Dana Mitchell', 'EMR', 'dana.mitchell@institution.edu', 'D Company', '2029', 'Membership Coordinator'),
    ('Cadet Evan Brooks', 'EMT', 'evan.brooks@institution.edu', 'E Company', '2028', 'Training Officer'),
    ('Cadet Fiona Grant', 'AEMT', 'fiona.grant@institution.edu', 'F Company', '2027', 'Equipment Officer'),
    ('Cadet Gavin Moore', '68W', 'gavin.moore@institution.edu', 'G Company', '2029', 'Member'),
    ('Cadet Harper Reed', 'EMT', 'harper.reed@institution.edu', 'H Company', '2028', 'Public Affairs Officer')
) as seed(name, certification, contact, company, class_year, leadership)
where not exists (
  select 1 from public.roster_members
);

insert into public.calendar_events (
  title,
  event_date,
  start_time,
  end_time,
  location,
  category,
  description,
  signup_open,
  signup_url
)
select
  seed.title,
  current_date + seed.day_offset,
  seed.start_time,
  seed.end_time,
  seed.location,
  seed.category,
  seed.description,
  seed.signup_open,
  seed.signup_url
from (
  values
    ('Home Event Medical Coverage', 4, '1300', '1700', 'Primary Stadium / Venue', 'Staffing', 'Coverage detail for a major campus event requiring a visible and disciplined CEMS presence.', true, 'https://www.signupgenius.com/'),
    ('Trauma Skills Refresher', 7, '1830', '2030', 'Training Room 101', 'Training', 'Hands-on airway, hemorrhage control, patient packaging, and handoff practice.', true, 'https://www.signupgenius.com/'),
    ('Weekend Duty Rotation', 11, '0800', '1200', 'Campus Quad', 'Weekend', 'Weekend support window for campus activity coverage and standby response.', true, 'https://www.signupgenius.com/'),
    ('Mass Casualty Tabletop', 16, '1900', '2100', 'Leadership Lab', 'Training', 'Scenario-based command and triage planning focused on communication and delegation.', false, ''),
    ('Spring Open House Coverage', 20, '0900', '1500', 'Main Parade Field', 'Staffing', 'High-visibility public-facing standby shift for visitors and campus activities.', true, 'https://www.signupgenius.com/'),
    ('Senior-to-Junior Turnover Brief', 27, '1800', '1930', 'Club Headquarters', 'Weekend', 'Leadership continuity meeting covering operations, equipment, and expectations for the next cycle.', false, '')
) as seed(title, day_offset, start_time, end_time, location, category, description, signup_open, signup_url)
where not exists (
  select 1 from public.calendar_events
);

-- Promote a specific signed-up user to staff after they exist in auth.users:
-- update public.user_profiles
-- set role = 'staff'
-- where email = 'staff.member@westpoint.edu';
