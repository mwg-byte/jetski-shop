-- ============================================================
-- JET SKI SHOP — Supabase schema
-- Run this once in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- ---------- profiles & roles ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'New user',
  role text not null default 'tech' check (role in ('owner','manager','tech')),
  active boolean not null default false,  -- new signups wait for approval
  created_at timestamptz not null default now()
);

-- auto-create a profile when someone signs up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1)));
  return new;
end $$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- helper: the requesting user's role (only if active)
create or replace function public.my_role()
returns text language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid() and active = true
$$;

-- guard: who may change role/active flags
create or replace function public.guard_profile_changes()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role then
    -- only owners grant/revoke manager or owner status
    if public.my_role() <> 'owner' then
      raise exception 'Only an owner can change roles';
    end if;
  end if;
  if new.active is distinct from old.active then
    if public.my_role() not in ('owner','manager') then
      raise exception 'Only managers or owners can activate/deactivate crew';
    end if;
  end if;
  return new;
end $$;
create trigger guard_profiles before update on public.profiles
  for each row execute function public.guard_profile_changes();

-- ---------- pay rates (kept separate so techs can't read them) ----------
create table public.pay_rates (
  tech_id uuid primary key references public.profiles(id) on delete cascade,
  hourly_rate numeric not null default 0
);

-- ---------- shop settings ----------
create table public.settings (
  id int primary key default 1 check (id = 1),
  mileage_rate numeric not null default 0.70,
  ot_weekly_threshold numeric not null default 40,
  ot_multiplier numeric not null default 1.5
);
insert into public.settings (id) values (1);

-- ---------- work orders ----------
create table public.work_orders (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  customer_name text not null,
  customer_phone text default '',
  make text default '', model text default '', year text default '', hull_id text default '',
  issue text not null,
  status text not null default 'intake' check (status in ('intake','diagnosing','awaiting_parts','in_repair','testing','ready','closed')),
  assigned_to uuid references public.profiles(id),
  priority int not null default 0
);

create table public.media (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.work_orders(id) on delete cascade,
  path text not null,           -- storage object path
  kind text not null check (kind in ('image','video')),
  name text default '',
  created_at timestamptz not null default now()
);

create table public.hour_entries (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.work_orders(id) on delete cascade,
  tech_id uuid not null references public.profiles(id),
  work_date date not null default current_date,
  hours numeric not null check (hours > 0),
  note text default '',
  clocked boolean not null default false
);

create table public.job_sessions (   -- live job timers
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.work_orders(id) on delete cascade,
  tech_id uuid not null references public.profiles(id),
  started_at timestamptz not null default now(),
  unique (order_id, tech_id)
);

create table public.lake_sessions (  -- live lake test timer (one per order)
  order_id uuid primary key references public.work_orders(id) on delete cascade,
  tech_id uuid not null references public.profiles(id),
  started_at timestamptz not null default now()
);

create table public.lake_tests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.work_orders(id) on delete cascade,
  tech_id uuid not null references public.profiles(id),
  test_date date not null default current_date,
  seconds int not null,
  result text not null default 'pending' check (result in ('pending','passed','failed')),
  note text default ''
);

create table public.parts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.work_orders(id) on delete cascade,
  name text not null,
  qty int not null default 1,
  note text default '',
  status text not null default 'requested' check (status in ('requested','ordered','received'))
);

-- ---------- shop time clock (payroll source) ----------
create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  tech_id uuid not null references public.profiles(id),
  started_at timestamptz not null default now(),
  ended_at timestamptz   -- null while on shift
);

-- ---------- mileage ----------
create table public.trips (
  id uuid primary key default gen_random_uuid(),
  tech_id uuid not null references public.profiles(id),
  trip_date date not null default current_date,
  miles numeric not null check (miles > 0),
  purpose text default '',
  method text not null default 'manual' check (method in ('gps','manual')),
  created_at timestamptz not null default now()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table public.profiles     enable row level security;
alter table public.pay_rates    enable row level security;
alter table public.settings     enable row level security;
alter table public.work_orders  enable row level security;
alter table public.media        enable row level security;
alter table public.hour_entries enable row level security;
alter table public.job_sessions enable row level security;
alter table public.lake_sessions enable row level security;
alter table public.lake_tests   enable row level security;
alter table public.parts        enable row level security;
alter table public.shifts       enable row level security;
alter table public.trips        enable row level security;

-- profiles: anyone signed in can read (needed to see own pending status);
-- self can update own row (trigger guards role/active); managers+ can update anyone
create policy profiles_read   on public.profiles for select to authenticated using (true);
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or public.my_role() in ('owner','manager'));

-- pay rates: managers and owners only
create policy rates_all on public.pay_rates for all to authenticated
  using (public.my_role() in ('owner','manager'))
  with check (public.my_role() in ('owner','manager'));

-- settings: crew can read, managers+ write
create policy settings_read  on public.settings for select to authenticated using (public.my_role() is not null);
create policy settings_write on public.settings for update to authenticated
  using (public.my_role() in ('owner','manager'));

-- shop data: any active crew member can read & write; deletes need manager+
create policy wo_read   on public.work_orders for select to authenticated using (public.my_role() is not null);
create policy wo_write  on public.work_orders for insert to authenticated with check (public.my_role() is not null);
create policy wo_update on public.work_orders for update to authenticated using (public.my_role() is not null);
create policy wo_delete on public.work_orders for delete to authenticated using (public.my_role() in ('owner','manager'));

create policy media_rw  on public.media for all to authenticated
  using (public.my_role() is not null) with check (public.my_role() is not null);
create policy hours_rw  on public.hour_entries for all to authenticated
  using (public.my_role() is not null) with check (public.my_role() is not null);
create policy jobsess_rw on public.job_sessions for all to authenticated
  using (public.my_role() is not null) with check (public.my_role() is not null);
create policy lakesess_rw on public.lake_sessions for all to authenticated
  using (public.my_role() is not null) with check (public.my_role() is not null);
create policy laketests_rw on public.lake_tests for all to authenticated
  using (public.my_role() is not null) with check (public.my_role() is not null);
create policy parts_rw  on public.parts for all to authenticated
  using (public.my_role() is not null) with check (public.my_role() is not null);

-- shifts: techs manage their own punches; managers+ manage anyone's
create policy shifts_read   on public.shifts for select to authenticated using (public.my_role() is not null);
create policy shifts_insert on public.shifts for insert to authenticated
  with check (tech_id = auth.uid() or public.my_role() in ('owner','manager'));
create policy shifts_update on public.shifts for update to authenticated
  using (tech_id = auth.uid() or public.my_role() in ('owner','manager'));
create policy shifts_delete on public.shifts for delete to authenticated
  using (public.my_role() in ('owner','manager'));

-- trips: techs log their own; managers+ see and manage all
create policy trips_read   on public.trips for select to authenticated
  using (tech_id = auth.uid() or public.my_role() in ('owner','manager'));
create policy trips_insert on public.trips for insert to authenticated
  with check (tech_id = auth.uid() or public.my_role() in ('owner','manager'));
create policy trips_delete on public.trips for delete to authenticated
  using (tech_id = auth.uid() or public.my_role() in ('owner','manager'));

-- ============================================================
-- STORAGE: create a bucket named  job-media  (public) in the dashboard,
-- then run these policies:
-- ============================================================
create policy "crew can upload media" on storage.objects for insert to authenticated
  with check (bucket_id = 'job-media' and public.my_role() is not null);
create policy "crew can delete media" on storage.objects for delete to authenticated
  using (bucket_id = 'job-media' and public.my_role() is not null);

-- ============================================================
-- AFTER YOU SIGN UP, make yourself the owner (replace the email):
--
--   update public.profiles set role = 'owner', active = true
--   where id = (select id from auth.users where email = 'you@example.com');
-- ============================================================
