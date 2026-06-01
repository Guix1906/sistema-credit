create table public.access_settings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  opening_time time not null default '08:00',
  closing_time time not null default '18:00',
  allowed_days smallint[] not null default array[1, 2, 3, 4, 5],
  timezone text not null default 'America/Sao_Paulo',
  allow_admin_outside_hours boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id),
  check (array_length(allowed_days, 1) > 0),
  check (allowed_days <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[])
);

alter table public.audit_logs drop constraint if exists audit_logs_action_check;

alter table public.audit_logs
  add constraint audit_logs_action_check
  check (action in ('insert', 'update', 'delete', 'login', 'logout', 'access_allowed', 'access_blocked'));

create trigger set_access_settings_updated_at
before update on public.access_settings
for each row execute function public.set_updated_at();

create index access_settings_owner_id_idx on public.access_settings (owner_id);

alter table public.access_settings enable row level security;

create policy "Users can read own access settings"
on public.access_settings for select
to authenticated
using (owner_id = auth.uid());

create policy "Users can create own access settings"
on public.access_settings for insert
to authenticated
with check (owner_id = auth.uid());

create policy "Users can update own access settings"
on public.access_settings for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy "Users can delete own access settings"
on public.access_settings for delete
to authenticated
using (owner_id = auth.uid());
