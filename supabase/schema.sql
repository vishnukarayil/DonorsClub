-- =====================================================================
--  Donors' Club  -  Ahalia Blood Transfusion Services
--  Run this whole file once in:  Supabase dashboard > SQL Editor > New query
--  Safe to re-run: every statement is idempotent except the seed rows,
--  which only insert when the table is empty.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------

-- One-row table holding every editable club-wide setting.
create table if not exists public.club_settings (
  id               int primary key default 1 check (id = 1),
  club_name        text not null default 'Ahalia Donors'' Club',
  center_name      text not null default 'Ahalia Blood Transfusion Services',
  license_no       text not null default '231/28C/KER/DC-CLAA/2015',
  enquiry_phone    text not null default '+91 9400214146',
  feedback_email   text not null default 'bloodbank@ahalia.in',
  medical_officer  text not null default 'Dr Vishnu K R, MD FRCPath',
  validity_days    int  not null default 100 check (validity_days between 1 and 3650),
  min_gap_days     int  not null default 90  check (min_gap_days between 0 and 365),
  disclaimer       text not null default 'Tier levels and membership benefits are subject to change as per our policies.',
  active_banner_id uuid,
  updated_at       timestamptz not null default now()
);
insert into public.club_settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.banners (
  id         uuid primary key default gen_random_uuid(),
  path       text not null unique,          -- object path inside the 'banners' storage bucket
  label      text,
  created_at timestamptz not null default now()
);

do $$ begin
  alter table public.club_settings
    add constraint club_settings_banner_fk
    foreign key (active_banner_id) references public.banners(id) on delete set null;
exception when duplicate_object then null; end $$;

-- Eleven fixed rungs. Admins can rename and recolour them, not add or remove.
create table if not exists public.tiers (
  rank  int primary key check (rank between 1 and 11),
  name  text not null check (char_length(btrim(name)) between 1 and 40),
  color text not null default '#9AA3AE' check (color ~ '^#[0-9A-Fa-f]{6}$')
);

create table if not exists public.benefits (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(btrim(title)) between 1 and 120),
  description text check (description is null or char_length(description) <= 400),
  min_rank    int  not null default 1 references public.tiers(rank) on update cascade,
  sort_order  int  not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists public.donors (
  id              uuid primary key default gen_random_uuid(),
  phone           text not null unique check (phone ~ '^[6-9][0-9]{9}$'),
  name            text not null check (char_length(btrim(name)) between 2 and 80),
  dob             date not null check (dob < current_date),
  gender          text not null check (gender in ('male','female','other')),
  blood_group     text not null check (blood_group in ('A+','A-','B+','B-','AB+','AB-','O+','O-')),
  village_town    text not null check (char_length(btrim(village_town)) between 2 and 80),
  pincode         text not null check (pincode ~ '^[1-9][0-9]{5}$'),
  works_in_ahalia boolean not null default false,
  created_at      timestamptz not null default now()
);

create table if not exists public.donations (
  id          uuid primary key default gen_random_uuid(),
  donor_id    uuid not null references public.donors(id) on delete cascade,
  donated_at  timestamptz not null default now(),
  -- active   = counts towards the tier
  -- flagged  = still counts, waiting in the review queue
  -- rejected = deleted by a reviewer; does not count; purged on demand
  status      text not null default 'active' check (status in ('active','flagged','rejected')),
  flag_reason text,
  flagged_at  timestamptz,
  reviewed_by uuid,
  reviewed_at timestamptz,
  source      text not null default 'web' check (source in ('web','admin')),
  created_at  timestamptz not null default now()
);
create index if not exists donations_donor_idx  on public.donations (donor_id);
create index if not exists donations_status_idx on public.donations (status);

create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email   text
);

-- ---------------------------------------------------------------------
-- 2. Helpers
-- ---------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins a where a.user_id = auth.uid());
$$;

-- stamps who reviewed a donation, and when its status changed
create or replace function public.donations_audit()
returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status then
    new.reviewed_by := auth.uid();
    new.reviewed_at := now();
    if new.status = 'flagged' and new.flagged_at is null then new.flagged_at := now(); end if;
    if new.status = 'active' then new.flag_reason := null; new.flagged_at := null; end if;
  end if;
  return new;
end $$;

drop trigger if exists donations_audit_trg on public.donations;
create trigger donations_audit_trg before update on public.donations
  for each row execute function public.donations_audit();

create or replace function public.touch_settings()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists club_settings_touch on public.club_settings;
create trigger club_settings_touch before update on public.club_settings
  for each row execute function public.touch_settings();

-- Builds the public-facing profile payload for one donor.
-- Returns NULL when the donor has no counting donation.
create or replace function public._profile_json(p_donor uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  d       public.donors%rowtype;
  s       public.club_settings%rowtype;
  t       public.tiers%rowtype;
  v_count int;
  v_last  timestamptz;
  v_rank  int;
  v_valid timestamptz;
  v_days  int;
begin
  select * into d from public.donors where id = p_donor;
  if not found then return null; end if;
  select * into s from public.club_settings where id = 1;

  select count(*), max(donated_at) into v_count, v_last
    from public.donations where donor_id = p_donor and status <> 'rejected';
  if v_count = 0 then return null; end if;

  v_rank  := least(v_count, (select max(rank) from public.tiers));
  select * into t from public.tiers where rank = v_rank;

  v_valid := v_last + make_interval(days => s.validity_days);
  v_days  := greatest(0, ceil(extract(epoch from (v_valid - now())) / 86400.0))::int;

  return jsonb_build_object(
    'name',             d.name,
    'gender',           d.gender,
    'blood_group',      d.blood_group,
    'donation_count',   v_count,
    'last_donated_at',  v_last,
    'valid_until',      v_valid,
    'days_left',        v_days,
    'validity_days',    s.validity_days,
    'next_eligible_at', v_last + make_interval(days => s.min_gap_days),
    'tier_rank',        t.rank,
    'tier_name',        t.name,
    'tier_color',       t.color
  );
end $$;

-- ---------------------------------------------------------------------
-- 3. Public functions (the ONLY way anonymous visitors touch donor data)
-- ---------------------------------------------------------------------

create or replace function public.register_donation(
  p_name        text,
  p_dob         date,
  p_gender      text,
  p_blood_group text,
  p_village     text,
  p_pincode     text,
  p_ahalia      boolean,
  p_phone       text,
  p_consent     boolean default false
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_name    text := btrim(coalesce(p_name, ''));
  v_village text := btrim(coalesce(p_village, ''));
  v_gap     int;
  v_age     int;
  d         public.donors%rowtype;
  v_id      uuid;
  v_prev    timestamptz;
  v_repeat  boolean := false;
  v_flag    text    := null;
begin
  -- ---- validation (the browser checks the same things; this is the real gate)
  if not coalesce(p_consent, false) then
    return jsonb_build_object('ok', false, 'code', 'consent', 'message', 'Please tick the consent box to continue.');
  end if;
  if p_phone is null or p_phone !~ '^[6-9][0-9]{9}$' then
    return jsonb_build_object('ok', false, 'code', 'phone', 'message', 'Enter a 10-digit mobile number, digits only, without +91 or spaces.');
  end if;
  if char_length(v_name) < 2 or char_length(v_name) > 80 then
    return jsonb_build_object('ok', false, 'code', 'name', 'message', 'Enter your full name.');
  end if;
  if p_dob is null or p_dob >= current_date then
    return jsonb_build_object('ok', false, 'code', 'dob', 'message', 'Enter a valid date of birth.');
  end if;
  v_age := date_part('year', age(current_date, p_dob))::int;
  if v_age < 18 or v_age > 65 then
    return jsonb_build_object('ok', false, 'code', 'dob', 'message', 'Donors must be between 18 and 65 years old. Please check the date of birth, or ask the Medical Officer.');
  end if;
  if p_gender is null or p_gender not in ('male','female','other') then
    return jsonb_build_object('ok', false, 'code', 'gender', 'message', 'Select a gender.');
  end if;
  if p_blood_group is null or p_blood_group not in ('A+','A-','B+','B-','AB+','AB-','O+','O-') then
    return jsonb_build_object('ok', false, 'code', 'blood_group', 'message', 'Select a blood group.');
  end if;
  if char_length(v_village) < 2 or char_length(v_village) > 80 then
    return jsonb_build_object('ok', false, 'code', 'village', 'message', 'Enter your village or town.');
  end if;
  if p_pincode is null or p_pincode !~ '^[1-9][0-9]{5}$' then
    return jsonb_build_object('ok', false, 'code', 'pincode', 'message', 'Enter a 6-digit pincode.');
  end if;
  if p_ahalia is null then
    return jsonb_build_object('ok', false, 'code', 'ahalia', 'message', 'Tell us whether you work at Ahalia.');
  end if;

  select min_gap_days into v_gap from public.club_settings where id = 1;

  -- ---- first-time donor or repeat? (matched on phone number)
  select * into d from public.donors where phone = p_phone for update;

  if not found then
    begin
      insert into public.donors (phone, name, dob, gender, blood_group, village_town, pincode, works_in_ahalia)
      values (p_phone, v_name, p_dob, p_gender, p_blood_group, v_village, p_pincode, p_ahalia)
      returning id into v_id;
    exception when unique_violation then
      return jsonb_build_object('ok', false, 'code', 'busy', 'message', 'Your entry was submitted twice at the same moment. Please wait a few seconds and check your profile.');
    end;
  else
    v_id := d.id;
    select max(donated_at) into v_prev
      from public.donations where donor_id = d.id and status <> 'rejected';

    if v_prev is null then
      -- every earlier entry for this number was deleted as unauthorised:
      -- treat this as a fresh start and take the new details as the truth
      update public.donors
         set name = v_name, dob = p_dob, gender = p_gender, blood_group = p_blood_group,
             village_town = v_village, pincode = p_pincode, works_in_ahalia = p_ahalia
       where id = d.id;
    else
      -- repeat donor: the date of birth must match what we hold
      if d.dob <> p_dob then
        return jsonb_build_object('ok', false, 'code', 'identity',
          'message', 'This mobile number is already registered with a different date of birth. Please contact the blood centre so we can correct the record.');
      end if;
      -- same donation submitted twice, or too soon after the last one
      if v_gap > 0 and v_prev > now() - make_interval(days => v_gap) then
        return jsonb_build_object('ok', false, 'code', 'too_soon',
          'message', 'A donation was already recorded for this number on ' || to_char(v_prev at time zone 'Asia/Kolkata', 'DD Mon YYYY') ||
                     '. The next one can be logged from ' || to_char((v_prev + make_interval(days => v_gap)) at time zone 'Asia/Kolkata', 'DD Mon YYYY') || '.',
          'next_eligible_at', v_prev + make_interval(days => v_gap));
      end if;
      v_repeat := true;
      if d.blood_group <> p_blood_group then
        v_flag := 'Blood group differs from record: held ' || d.blood_group || ', submitted ' || p_blood_group;
      end if;
      -- things that legitimately change between donations
      update public.donors
         set village_town = v_village, pincode = p_pincode, works_in_ahalia = p_ahalia
       where id = d.id;
    end if;
  end if;

  insert into public.donations (donor_id, status, flag_reason, flagged_at, source)
  values (v_id, case when v_flag is null then 'active' else 'flagged' end, v_flag,
          case when v_flag is null then null else now() end, 'web');

  return jsonb_build_object('ok', true, 'is_repeat', v_repeat, 'flagged', v_flag is not null,
                            'profile', public._profile_json(v_id));
end $$;

-- Phone + date of birth together act as the key to a profile.
create or replace function public.get_profile(p_phone text, p_dob date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_id uuid;
begin
  if p_phone is null or p_phone !~ '^[6-9][0-9]{9}$' or p_dob is null then return null; end if;
  select id into v_id from public.donors where phone = p_phone and dob = p_dob;
  if not found then return null; end if;
  return public._profile_json(v_id);
end $$;

-- ---------------------------------------------------------------------
-- 4. Admin function: permanently remove deleted (rejected) entries
-- ---------------------------------------------------------------------

create or replace function public.admin_purge_rejected()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_don int; v_donors int;
begin
  if not public.is_admin() then raise exception 'not authorised' using errcode = '42501'; end if;
  with del as (delete from public.donations where status = 'rejected' returning 1)
    select count(*) into v_don from del;
  with del as (
    delete from public.donors d
     where not exists (select 1 from public.donations n where n.donor_id = d.id)
    returning 1)
    select count(*) into v_donors from del;
  return jsonb_build_object('donations', v_don, 'donors', v_donors);
end $$;

-- ---------------------------------------------------------------------
-- 5. Admin view: one row per live donor
-- ---------------------------------------------------------------------

create or replace view public.donor_summary with (security_invoker = true) as
select d.id, d.name, d.dob, d.gender, d.blood_group, d.village_town, d.pincode,
       d.works_in_ahalia, d.phone, d.created_at,
       count(n.id)  filter (where n.status <> 'rejected') as donation_count,
       count(n.id)  filter (where n.status = 'flagged')   as flagged_count,
       max(n.donated_at) filter (where n.status <> 'rejected') as last_donated_at
  from public.donors d
  left join public.donations n on n.donor_id = d.id
 group by d.id;

-- ---------------------------------------------------------------------
-- 6. Row Level Security
-- ---------------------------------------------------------------------

alter table public.club_settings enable row level security;
alter table public.banners       enable row level security;
alter table public.tiers         enable row level security;
alter table public.benefits      enable row level security;
alter table public.donors        enable row level security;
alter table public.donations     enable row level security;
alter table public.admins        enable row level security;

-- public read of club content
drop policy if exists "read settings" on public.club_settings;
create policy "read settings" on public.club_settings for select using (true);
drop policy if exists "read banners"  on public.banners;
create policy "read banners"  on public.banners  for select using (true);
drop policy if exists "read tiers"    on public.tiers;
create policy "read tiers"    on public.tiers    for select using (true);
drop policy if exists "read benefits" on public.benefits;
create policy "read benefits" on public.benefits for select using (true);

-- admin write
drop policy if exists "admin update settings" on public.club_settings;
create policy "admin update settings" on public.club_settings for update using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin banners" on public.banners;
create policy "admin banners" on public.banners for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin update tiers" on public.tiers;
create policy "admin update tiers" on public.tiers for update using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin benefits" on public.benefits;
create policy "admin benefits" on public.benefits for all using (public.is_admin()) with check (public.is_admin());

-- donor data: admins only. No policy for anyone else = no access.
drop policy if exists "admin donors" on public.donors;
create policy "admin donors" on public.donors for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin donations" on public.donations;
create policy "admin donations" on public.donations for all using (public.is_admin()) with check (public.is_admin());
-- admins table: no policies at all (read through is_admin() only)

-- belt and braces: visitors have no table-level rights on personal data
revoke all on public.donors, public.donations, public.admins, public.donor_summary from anon;
revoke all on public.admins from authenticated;
-- tiers and settings can be edited but never added to or deleted from through the API
revoke insert, delete, truncate on public.tiers, public.club_settings from anon, authenticated;

-- function privileges
revoke all on function public._profile_json(uuid)  from public, anon, authenticated;
revoke all on function public.admin_purge_rejected() from public, anon;
grant execute on function public.admin_purge_rejected() to authenticated;
grant execute on function public.register_donation(text,date,text,text,text,text,boolean,text,boolean) to anon, authenticated;
grant execute on function public.get_profile(text,date) to anon, authenticated;
grant execute on function public.is_admin() to anon, authenticated;

-- ---------------------------------------------------------------------
-- 7. Banner storage bucket (public read, admin write)
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('banners', 'banners', true, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 2097152,
  allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists "banners public read" on storage.objects;
create policy "banners public read" on storage.objects for select using (bucket_id = 'banners');
drop policy if exists "banners admin insert" on storage.objects;
create policy "banners admin insert" on storage.objects for insert with check (bucket_id = 'banners' and public.is_admin());
drop policy if exists "banners admin update" on storage.objects;
create policy "banners admin update" on storage.objects for update using (bucket_id = 'banners' and public.is_admin());
drop policy if exists "banners admin delete" on storage.objects;
create policy "banners admin delete" on storage.objects for delete using (bucket_id = 'banners' and public.is_admin());

-- ---------------------------------------------------------------------
-- 8. Seed data (only when empty). Everything here is editable in the admin console.
-- ---------------------------------------------------------------------

insert into public.tiers (rank, name, color)
select * from (values
  (1,  'Silver',        '#9AA3AE'),
  (2,  'Gold I',        '#D4A017'),
  (3,  'Gold II',       '#F0B400'),
  (4,  'Platinum I',    '#7FA8BF'),
  (5,  'Platinum II',   '#5B8FB0'),
  (6,  'Ruby',          '#C8102E'),
  (7,  'Diamond',       '#38BDF2'),
  (8,  'Legend',        '#8E44AD'),
  (9,  'Ultra Legend',  '#6C3BD1'),
  (10, 'Demi God',      '#E8741E'),
  (11, 'Eternal Being', '#0FA37F')
) v(rank, name, color)
where not exists (select 1 from public.tiers);

insert into public.benefits (title, description, min_rank, sort_order)
select * from (values
  ('Digital donor card',            'Your membership card lives on your phone, with your blood group and tier.', 1, 10),
  ('Priority appointment slots',    'Skip the queue when you book a donation slot with the blood centre.',        1, 20),
  ('Free health check at each visit','Blood pressure, haemoglobin and a short consultation every time you donate.', 1, 30),
  ('Discount on lab tests',         'A concession on selected tests at the Ahalia laboratory.',                   2, 40),
  ('Name on the Wall of Donors',    'Your name displayed at the blood centre with your tier.',                    3, 50),
  ('Invitation to Donors'' Day',    'Join the annual meet for club members and their families.',                  4, 60),
  ('Commemorative memento',         'A keepsake from the blood centre to mark your milestone.',                   6, 70)
) v(title, description, min_rank, sort_order)
where not exists (select 1 from public.benefits);

-- =====================================================================
-- AFTER the first admin signs up (Authentication > Users > Add user),
-- make them an admin by running this with their e-mail:
--
--   insert into public.admins (user_id, email)
--   select id, email from auth.users where email = 'you@example.com';
--
-- =====================================================================
