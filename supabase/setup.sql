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
  phone_number text not null default '',
  company text not null,
  class_year text not null,
  leadership text not null default 'Member',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.roster_members
  add column if not exists phone_number text not null default '';

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

create table if not exists public.event_signup_requirements (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.calendar_events(id) on delete cascade,
  certification text not null check (certification in ('AEMT', 'EMT', 'EMR', '68W')),
  slots_needed integer not null check (slots_needed > 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (event_id, certification)
);

create table if not exists public.event_signups (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.calendar_events(id) on delete cascade,
  requirement_id uuid not null references public.event_signup_requirements(id) on delete cascade,
  member_id uuid not null references public.roster_members(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  unique (event_id, member_id)
);

create table if not exists public.gallery_photos (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  folder_name text not null default 'Unsorted',
  about_feature_slot integer,
  storage_path text not null unique,
  uploader_user_id uuid not null references auth.users(id) on delete cascade,
  uploader_name text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.documents_library (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  folder_name text not null default 'General',
  file_name text not null,
  file_size bigint not null default 0,
  content_type text not null default '',
  storage_path text not null unique,
  uploader_user_id uuid not null references auth.users(id) on delete cascade,
  uploader_name text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.service_requests (
  id uuid primary key default gen_random_uuid(),
  event_title text not null,
  requested_people integer not null check (requested_people > 0),
  description text not null,
  event_date date not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  requester_name text not null default '',
  requester_email text not null default '',
  request_source text not null default 'public-site',
  notification_status text not null default 'pending' check (notification_status in ('pending', 'sent', 'partial', 'failed', 'not_configured')),
  notification_error text not null default '',
  reviewer_notes text not null default '',
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.gallery_photos
  add column if not exists description text not null default '';

alter table public.gallery_photos
  add column if not exists folder_name text not null default 'Unsorted';

alter table public.gallery_photos
  add column if not exists about_feature_slot integer;

alter table public.gallery_photos
  add column if not exists storage_path text;

alter table public.gallery_photos
  add column if not exists uploader_user_id uuid references auth.users(id) on delete cascade;

alter table public.gallery_photos
  add column if not exists uploader_name text not null default '';

alter table public.gallery_photos
  add column if not exists created_at timestamptz not null default timezone('utc', now());

alter table public.gallery_photos
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

alter table public.documents_library
  add column if not exists description text not null default '';

alter table public.documents_library
  add column if not exists folder_name text not null default 'General';

alter table public.documents_library
  add column if not exists file_name text;

alter table public.documents_library
  add column if not exists file_size bigint not null default 0;

alter table public.documents_library
  add column if not exists content_type text not null default '';

alter table public.documents_library
  add column if not exists storage_path text;

alter table public.documents_library
  add column if not exists uploader_user_id uuid references auth.users(id) on delete cascade;

alter table public.documents_library
  add column if not exists uploader_name text not null default '';

alter table public.documents_library
  add column if not exists created_at timestamptz not null default timezone('utc', now());

alter table public.documents_library
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

alter table public.service_requests
  add column if not exists event_title text not null default '';

alter table public.service_requests
  add column if not exists requested_people integer not null default 1;

alter table public.service_requests
  add column if not exists description text not null default '';

alter table public.service_requests
  add column if not exists event_date date;

alter table public.service_requests
  add column if not exists status text not null default 'pending';

alter table public.service_requests
  add column if not exists requester_name text not null default '';

alter table public.service_requests
  add column if not exists requester_email text not null default '';

alter table public.service_requests
  add column if not exists request_source text not null default 'public-site';

alter table public.service_requests
  add column if not exists notification_status text not null default 'pending';

alter table public.service_requests
  add column if not exists notification_error text not null default '';

alter table public.service_requests
  add column if not exists reviewer_notes text not null default '';

alter table public.service_requests
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null;

alter table public.service_requests
  add column if not exists reviewed_at timestamptz;

alter table public.service_requests
  add column if not exists created_at timestamptz not null default timezone('utc', now());

alter table public.service_requests
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

create index if not exists event_signup_requirements_event_id_idx
  on public.event_signup_requirements (event_id);

create index if not exists event_signups_event_id_idx
  on public.event_signups (event_id);

create index if not exists event_signups_requirement_id_idx
  on public.event_signups (requirement_id);

create index if not exists event_signups_member_id_idx
  on public.event_signups (member_id);

create index if not exists gallery_photos_created_at_idx
  on public.gallery_photos (created_at desc);

create index if not exists gallery_photos_folder_name_idx
  on public.gallery_photos (folder_name);

create unique index if not exists gallery_photos_storage_path_key
  on public.gallery_photos (storage_path);

create unique index if not exists gallery_photos_about_feature_slot_key
  on public.gallery_photos (about_feature_slot)
  where about_feature_slot is not null;

create index if not exists documents_library_created_at_idx
  on public.documents_library (created_at desc);

create index if not exists documents_library_folder_name_idx
  on public.documents_library (folder_name);

create unique index if not exists documents_library_storage_path_key
  on public.documents_library (storage_path);

create index if not exists service_requests_created_at_idx
  on public.service_requests (created_at desc);

create index if not exists service_requests_status_idx
  on public.service_requests (status);

create index if not exists service_requests_event_date_idx
  on public.service_requests (event_date desc);

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

create or replace function public.certification_tier(p_certification text)
returns integer
language sql
immutable
as $$
  select case upper(trim(coalesce(p_certification, '')))
    when 'AEMT' then 1
    when 'EMT' then 2
    when '68W' then 2
    when 'EMR' then 3
    else 99
  end;
$$;

create or replace function public.can_cover_certification(
  p_member_certification text,
  p_required_certification text
)
returns boolean
language sql
immutable
as $$
  select case upper(trim(coalesce(p_member_certification, '')))
    when 'AEMT' then upper(trim(coalesce(p_required_certification, ''))) in ('AEMT', 'EMT', '68W', 'EMR')
    when 'EMT' then upper(trim(coalesce(p_required_certification, ''))) in ('EMT', 'EMR')
    when '68W' then upper(trim(coalesce(p_required_certification, ''))) in ('68W', 'EMR')
    when 'EMR' then upper(trim(coalesce(p_required_certification, ''))) = 'EMR'
    else false
  end;
$$;

create or replace function public.certification_signup_priority(
  p_member_certification text,
  p_required_certification text
)
returns integer
language sql
immutable
as $$
  select case upper(trim(coalesce(p_member_certification, '')))
    when 'AEMT' then case upper(trim(coalesce(p_required_certification, '')))
      when 'AEMT' then 0
      when 'EMT' then 1
      when '68W' then 2
      when 'EMR' then 3
      else 99
    end
    when 'EMT' then case upper(trim(coalesce(p_required_certification, '')))
      when 'EMT' then 0
      when 'EMR' then 1
      else 99
    end
    when '68W' then case upper(trim(coalesce(p_required_certification, '')))
      when '68W' then 0
      when 'EMR' then 1
      else 99
    end
    when 'EMR' then case upper(trim(coalesce(p_required_certification, '')))
      when 'EMR' then 0
      else 99
    end
    else 99
  end;
$$;

create or replace function public.fetch_public_leadership_directory()
returns table (
  name text,
  email text,
  phone text,
  leadership text
)
language sql
security definer
set search_path = public
as $$
  select
    members.name,
    members.contact as email,
    members.phone_number as phone,
    members.leadership
  from public.roster_members members
  where coalesce(trim(members.leadership), '') <> ''
    and members.leadership <> 'Member'
  order by
    case
      when lower(members.leadership) in ('oic', 'officer in charge') then 0
      when lower(members.leadership) in ('cic', 'cadet in charge') then 1
      when lower(members.leadership) in ('acic', 'assistant cadet in charge', 'executive officer', 'exec officer') then 2
      else 3
    end,
    members.name asc;
$$;

create or replace function public.set_about_featured_photo(
  p_photo_id uuid,
  p_slot integer default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.roster_members members
    where lower(members.contact) = lower(coalesce(auth.jwt() ->> 'email', ''))
  ) and not exists (
    select 1
    from public.user_profiles profiles
    where profiles.user_id = (select auth.uid())
      and profiles.role = 'staff'
  ) then
    raise exception 'You must be a rostered member or staff to choose About page photos.'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.gallery_photos photos
    where photos.id = p_photo_id
  ) then
    raise exception 'Photo not found.';
  end if;

  if p_slot is not null and (p_slot < 1 or p_slot > 3) then
    raise exception 'About page slots must be between 1 and 3.';
  end if;

  if p_slot is not null then
    update public.gallery_photos photos
    set about_feature_slot = null,
        updated_at = timezone('utc', now())
    where photos.about_feature_slot = p_slot
      and photos.id <> p_photo_id;
  end if;

  update public.gallery_photos photos
  set about_feature_slot = p_slot,
      updated_at = timezone('utc', now())
  where photos.id = p_photo_id;
end;
$$;

create or replace function public.set_event_signup_requirements(
  p_event_id uuid,
  p_requirements jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  requirement_item jsonb;
  certification_value text;
  slots_value integer;
  existing_requirement record;
  existing_signup_count integer;
  next_slots integer;
  seen_certifications text[] := array[]::text[];
begin
  if not exists (
    select 1
    from public.user_profiles profiles
    where profiles.user_id = (select auth.uid())
      and profiles.role = 'staff'
  ) then
    raise exception 'Only staff can change signup requirements.'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.calendar_events events
    where events.id = p_event_id
  ) then
    raise exception 'Event not found.';
  end if;

  if p_requirements is null then
    p_requirements := '[]'::jsonb;
  end if;

  if jsonb_typeof(p_requirements) <> 'array' then
    raise exception 'Signup requirements must be provided as an array.';
  end if;

  for requirement_item in
    select value
    from jsonb_array_elements(p_requirements)
  loop
    certification_value := upper(trim(coalesce(requirement_item ->> 'certification', '')));
    slots_value := coalesce((requirement_item ->> 'slots_needed')::integer, 0);

    if certification_value not in ('AEMT', 'EMT', 'EMR', '68W') then
      raise exception 'Unsupported certification: %.', certification_value;
    end if;

    if slots_value <= 0 then
      raise exception 'Slot counts must be greater than zero for %.', certification_value;
    end if;

    if certification_value = any(seen_certifications) then
      raise exception 'Each certification can only be listed once per event.';
    end if;

    seen_certifications := array_append(seen_certifications, certification_value);
  end loop;

  for existing_requirement in
    select req.id, req.certification
    from public.event_signup_requirements req
    where req.event_id = p_event_id
  loop
    select count(*)
    into existing_signup_count
    from public.event_signups signups
    where signups.requirement_id = existing_requirement.id;

    if existing_requirement.certification = any(seen_certifications) then
      select coalesce((value ->> 'slots_needed')::integer, 0)
      into next_slots
      from jsonb_array_elements(p_requirements) as value
      where upper(trim(coalesce(value ->> 'certification', ''))) = existing_requirement.certification
      limit 1;

      if existing_signup_count > next_slots then
        raise exception '% already has % confirmed signup(s). Increase that slot count or remove signups first.',
          existing_requirement.certification,
          existing_signup_count;
      end if;
    elsif existing_signup_count > 0 then
      raise exception 'Cannot remove the % requirement while % member(s) are still signed up.',
        existing_requirement.certification,
        existing_signup_count;
    end if;
  end loop;

  for requirement_item in
    select value
    from jsonb_array_elements(p_requirements)
  loop
    certification_value := upper(trim(coalesce(requirement_item ->> 'certification', '')));
    slots_value := (requirement_item ->> 'slots_needed')::integer;

    insert into public.event_signup_requirements (event_id, certification, slots_needed)
    values (p_event_id, certification_value, slots_value)
    on conflict (event_id, certification) do update
      set slots_needed = excluded.slots_needed,
          updated_at = timezone('utc', now());
  end loop;

  delete from public.event_signup_requirements req
  where req.event_id = p_event_id
    and not (req.certification = any(seen_certifications))
    and not exists (
      select 1
      from public.event_signups signups
      where signups.requirement_id = req.id
    );
end;
$$;

create or replace function public.sign_up_for_event(p_event_id uuid)
returns public.event_signups
language plpgsql
security definer
set search_path = public
as $$
declare
  auth_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  member_record public.roster_members%rowtype;
  event_record public.calendar_events%rowtype;
  requirement_record public.event_signup_requirements%rowtype;
  created_signup public.event_signups%rowtype;
begin
  if auth_email = '' then
    raise exception 'You must be signed in to claim a slot.'
      using errcode = '42501';
  end if;

  select *
  into member_record
  from public.roster_members members
  where lower(members.contact) = auth_email
  order by members.created_at asc
  limit 1;

  if not found then
    raise exception 'Your account is not linked to a roster record yet. Ask staff to add your email to the roster before signing up.';
  end if;

  select *
  into event_record
  from public.calendar_events events
  where events.id = p_event_id;

  if not found then
    raise exception 'Event not found.';
  end if;

  if not event_record.signup_open then
    raise exception 'Signups are closed for this event.';
  end if;

  if exists (
    select 1
    from public.event_signups signups
    where signups.event_id = p_event_id
      and signups.member_id = member_record.id
  ) then
    raise exception 'You are already signed up for this event.';
  end if;

  if not exists (
    select 1
    from public.event_signup_requirements requirements
    where requirements.event_id = p_event_id
      and public.can_cover_certification(member_record.certification, requirements.certification)
  ) then
    raise exception 'This event is not requesting any slots that match your certification level (%).',
      member_record.certification;
  end if;

  select requirements.*
  into requirement_record
  from public.event_signup_requirements requirements
  where requirements.event_id = p_event_id
    and public.can_cover_certification(member_record.certification, requirements.certification)
    and (
      select count(*)
      from public.event_signups signups
      where signups.requirement_id = requirements.id
    ) < requirements.slots_needed
  order by
    public.certification_signup_priority(member_record.certification, requirements.certification),
    requirements.created_at asc
  limit 1
  for update;

  if not found then
    raise exception 'All eligible slots for % coverage are already full.', member_record.certification;
  end if;

  insert into public.event_signups (event_id, requirement_id, member_id)
  values (p_event_id, requirement_record.id, member_record.id)
  returning *
  into created_signup;

  return created_signup;
end;
$$;

create or replace function public.withdraw_from_event(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  auth_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  member_record public.roster_members%rowtype;
begin
  if auth_email = '' then
    raise exception 'You must be signed in to withdraw from an event.'
      using errcode = '42501';
  end if;

  select *
  into member_record
  from public.roster_members members
  where lower(members.contact) = auth_email
  order by members.created_at asc
  limit 1;

  if not found then
    raise exception 'Your account is not linked to a roster record yet.';
  end if;

  if not exists (
    select 1
    from public.event_signups signups
    where signups.event_id = p_event_id
      and signups.member_id = member_record.id
  ) then
    raise exception 'You are not signed up for this event.';
  end if;

  delete from public.event_signups signups
  where signups.event_id = p_event_id
    and signups.member_id = member_record.id;
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

drop trigger if exists set_event_signup_requirements_updated_at on public.event_signup_requirements;
create trigger set_event_signup_requirements_updated_at
  before update on public.event_signup_requirements
  for each row execute procedure public.set_updated_at();

drop trigger if exists set_gallery_photos_updated_at on public.gallery_photos;
create trigger set_gallery_photos_updated_at
  before update on public.gallery_photos
  for each row execute procedure public.set_updated_at();

drop trigger if exists set_documents_library_updated_at on public.documents_library;
create trigger set_documents_library_updated_at
  before update on public.documents_library
  for each row execute procedure public.set_updated_at();

drop trigger if exists set_service_requests_updated_at on public.service_requests;
create trigger set_service_requests_updated_at
  before update on public.service_requests
  for each row execute procedure public.set_updated_at();

alter table public.user_profiles enable row level security;
alter table public.roster_members enable row level security;
alter table public.calendar_events enable row level security;
alter table public.event_signup_requirements enable row level security;
alter table public.event_signups enable row level security;
alter table public.gallery_photos enable row level security;
alter table public.documents_library enable row level security;
alter table public.service_requests enable row level security;

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
drop policy if exists "Authenticated users can view signup requirements" on public.event_signup_requirements;
drop policy if exists "Staff can insert signup requirements" on public.event_signup_requirements;
drop policy if exists "Staff can update signup requirements" on public.event_signup_requirements;
drop policy if exists "Staff can delete signup requirements" on public.event_signup_requirements;
drop policy if exists "Authenticated users can view signups" on public.event_signups;
drop policy if exists "Public can view gallery photos" on public.gallery_photos;
drop policy if exists "Members and staff can upload gallery photos" on public.gallery_photos;
drop policy if exists "Members and staff can update gallery photos" on public.gallery_photos;
drop policy if exists "Authenticated users can view documents" on public.documents_library;
drop policy if exists "Staff can upload documents" on public.documents_library;
drop policy if exists "Staff can view service requests" on public.service_requests;
drop policy if exists "Staff can update service requests" on public.service_requests;
drop policy if exists "Staff can delete service requests" on public.service_requests;
drop policy if exists "Rostered users can upload gallery objects" on storage.objects;
drop policy if exists "Uploaders can delete gallery objects" on storage.objects;
drop policy if exists "Authenticated users can view document objects" on storage.objects;
drop policy if exists "Staff can upload document objects" on storage.objects;
drop policy if exists "Staff can delete document objects" on storage.objects;

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

create policy "Authenticated users can view signup requirements"
  on public.event_signup_requirements
  for select
  to authenticated
  using (true);

create policy "Staff can insert signup requirements"
  on public.event_signup_requirements
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

create policy "Staff can update signup requirements"
  on public.event_signup_requirements
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

create policy "Staff can delete signup requirements"
  on public.event_signup_requirements
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

create policy "Authenticated users can view signups"
  on public.event_signups
  for select
  to authenticated
  using (true);

create policy "Public can view gallery photos"
  on public.gallery_photos
  for select
  to public
  using (true);

create policy "Members and staff can upload gallery photos"
  on public.gallery_photos
  for insert
  to authenticated
  with check (
    uploader_user_id = (select auth.uid())
    and (
      exists (
        select 1
        from public.roster_members members
        where lower(members.contact) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
      or exists (
        select 1
        from public.user_profiles profiles
        where profiles.user_id = (select auth.uid())
          and profiles.role = 'staff'
      )
    )
  );

create policy "Members and staff can update gallery photos"
  on public.gallery_photos
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.roster_members members
      where lower(members.contact) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
    or exists (
      select 1
      from public.user_profiles profiles
      where profiles.user_id = (select auth.uid())
        and profiles.role = 'staff'
    )
  )
  with check (
    exists (
      select 1
      from public.roster_members members
      where lower(members.contact) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
    or exists (
      select 1
      from public.user_profiles profiles
      where profiles.user_id = (select auth.uid())
        and profiles.role = 'staff'
    )
  );

create policy "Authenticated users can view documents"
  on public.documents_library
  for select
  to authenticated
  using (true);

create policy "Staff can upload documents"
  on public.documents_library
  for insert
  to authenticated
  with check (
    uploader_user_id = (select auth.uid())
    and exists (
      select 1
      from public.user_profiles profiles
      where profiles.user_id = (select auth.uid())
        and profiles.role = 'staff'
    )
  );

create policy "Staff can view service requests"
  on public.service_requests
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.user_profiles profiles
      where profiles.user_id = (select auth.uid())
        and profiles.role = 'staff'
    )
  );

create policy "Staff can update service requests"
  on public.service_requests
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

create policy "Staff can delete service requests"
  on public.service_requests
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

insert into storage.buckets (id, name, public)
values ('gallery-photos', 'gallery-photos', true)
on conflict (id) do update
set name = excluded.name,
    public = excluded.public;

insert into storage.buckets (id, name, public)
values ('documents-library', 'documents-library', false)
on conflict (id) do update
set name = excluded.name,
    public = excluded.public;

create policy "Rostered users can upload gallery objects"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'gallery-photos'
    and (
      exists (
        select 1
        from public.roster_members members
        where lower(members.contact) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
      or exists (
        select 1
        from public.user_profiles profiles
        where profiles.user_id = (select auth.uid())
          and profiles.role = 'staff'
      )
    )
  );

create policy "Uploaders can delete gallery objects"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'gallery-photos'
    and owner_id = (select auth.uid()::text)
  );

create policy "Authenticated users can view document objects"
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'documents-library');

create policy "Staff can upload document objects"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'documents-library'
    and exists (
      select 1
      from public.user_profiles profiles
      where profiles.user_id = (select auth.uid())
        and profiles.role = 'staff'
    )
  );

create policy "Staff can delete document objects"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'documents-library'
    and exists (
      select 1
      from public.user_profiles profiles
      where profiles.user_id = (select auth.uid())
        and profiles.role = 'staff'
    )
  );

revoke all on function public.set_event_signup_requirements(uuid, jsonb) from public;
grant execute on function public.set_event_signup_requirements(uuid, jsonb) to authenticated;

revoke all on function public.fetch_public_leadership_directory() from public;
grant execute on function public.fetch_public_leadership_directory() to anon, authenticated;

revoke all on function public.set_about_featured_photo(uuid, integer) from public;
grant execute on function public.set_about_featured_photo(uuid, integer) to authenticated;

revoke all on function public.sign_up_for_event(uuid) from public;
grant execute on function public.sign_up_for_event(uuid) to authenticated;

revoke all on function public.withdraw_from_event(uuid) from public;
grant execute on function public.withdraw_from_event(uuid) to authenticated;

insert into public.roster_members (name, certification, contact, phone_number, company, class_year, leadership)
select *
from (
  values
    ('Cadet Bennett Marshall', 'EMT', 'benentt.marshall@westpoint.edu', '(845) 555-0101', 'C-4', '2027', 'Cadet in Charge'),
    ('Cadet Brooke Ellis', 'EMT', 'brooke.ellis@institution.edu', '(845) 555-0102', 'B Company', '2028', 'Vice President'),
    ('Cadet Cameron Hayes', '68W', 'cameron.hayes@institution.edu', '(845) 555-0103', 'C Company', '2027', 'Operations Officer'),
    ('Cadet Dana Mitchell', 'EMR', 'dana.mitchell@institution.edu', '(845) 555-0104', 'D Company', '2029', 'Membership Coordinator'),
    ('Cadet Evan Brooks', 'EMT', 'evan.brooks@institution.edu', '(845) 555-0105', 'E Company', '2028', 'Training Officer'),
    ('Cadet Fiona Grant', 'AEMT', 'fiona.grant@institution.edu', '(845) 555-0106', 'F Company', '2027', 'Equipment Officer'),
    ('Cadet Gavin Moore', '68W', 'gavin.moore@institution.edu', '(845) 555-0107', 'G Company', '2029', 'Member'),
    ('Cadet Harper Reed', 'EMT', 'harper.reed@institution.edu', '(845) 555-0108', 'H Company', '2028', 'Public Affairs Officer')
) as seed(name, certification, contact, phone_number, company, class_year, leadership)
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
    ('Home Event Medical Coverage', 4, '1300', '1700', 'Primary Stadium / Venue', 'Staffing', 'Coverage detail for a major campus event requiring a visible and disciplined CEMS presence.', true, ''),
    ('Trauma Skills Refresher', 7, '1830', '2030', 'Training Room 101', 'Training', 'Hands-on airway, hemorrhage control, patient packaging, and handoff practice.', true, ''),
    ('Weekend Duty Rotation', 11, '0800', '1200', 'Campus Quad', 'Weekend', 'Weekend support window for campus activity coverage and standby response.', true, ''),
    ('Mass Casualty Tabletop', 16, '1900', '2100', 'Leadership Lab', 'Training', 'Scenario-based command and triage planning focused on communication and delegation.', false, ''),
    ('Spring Open House Coverage', 20, '0900', '1500', 'Main Parade Field', 'Staffing', 'High-visibility public-facing standby shift for visitors and campus activities.', true, ''),
    ('Senior-to-Junior Turnover Brief', 27, '1800', '1930', 'Club Headquarters', 'Weekend', 'Leadership continuity meeting covering operations, equipment, and expectations for the next cycle.', false, '')
) as seed(title, day_offset, start_time, end_time, location, category, description, signup_open, signup_url)
where not exists (
  select 1 from public.calendar_events
);

insert into public.event_signup_requirements (event_id, certification, slots_needed)
select
  events.id,
  seed.certification,
  seed.slots_needed
from (
  values
    ('Home Event Medical Coverage', 'AEMT', 1),
    ('Home Event Medical Coverage', 'EMT', 2),
    ('Home Event Medical Coverage', '68W', 1),
    ('Trauma Skills Refresher', 'EMT', 3),
    ('Trauma Skills Refresher', 'EMR', 2),
    ('Weekend Duty Rotation', 'EMT', 1),
    ('Weekend Duty Rotation', '68W', 1),
    ('Spring Open House Coverage', 'AEMT', 1),
    ('Spring Open House Coverage', 'EMT', 2),
    ('Spring Open House Coverage', 'EMR', 1)
) as seed(title, certification, slots_needed)
join public.calendar_events events
  on events.title = seed.title
where not exists (
  select 1
  from public.event_signup_requirements requirements
  where requirements.event_id = events.id
    and requirements.certification = seed.certification
);

insert into public.event_signups (event_id, requirement_id, member_id)
select
  events.id,
  requirements.id,
  members.id
from (
  values
    ('Home Event Medical Coverage', 'Cadet Bennett Marshall'),
    ('Home Event Medical Coverage', 'Cadet Fiona Grant'),
    ('Trauma Skills Refresher', 'Cadet Brooke Ellis'),
    ('Weekend Duty Rotation', 'Cadet Cameron Hayes'),
    ('Spring Open House Coverage', 'Cadet Dana Mitchell')
) as seed(event_title, member_name)
join public.calendar_events events
  on events.title = seed.event_title
join public.roster_members members
  on members.name = seed.member_name
join public.event_signup_requirements requirements
  on requirements.event_id = events.id
 and requirements.certification = members.certification
where not exists (
  select 1
  from public.event_signups signups
  where signups.event_id = events.id
    and signups.member_id = members.id
);

-- Promote a specific signed-up user to staff after they exist in auth.users:
-- update public.user_profiles
-- set role = 'staff'
-- where email = 'staff.member@westpoint.edu';
