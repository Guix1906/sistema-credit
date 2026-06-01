create table if not exists public.app_settings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade unique,
  system_name text not null default 'Sistema de Credito',
  logo_path text,
  modalities integer[] not null default array[20, 24, 30],
  payment_methods text[] not null default array['cash', 'pix', 'bank_transfer', 'other'],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_app_settings_updated_at on public.app_settings;
create trigger set_app_settings_updated_at before update on public.app_settings for each row execute function public.set_updated_at();

create index if not exists app_settings_owner_id_idx on public.app_settings (owner_id);

alter table public.app_settings enable row level security;

drop policy if exists "Users can read own app settings" on public.app_settings;
create policy "Users can read own app settings"
on public.app_settings for select
to authenticated
using (owner_id = auth.uid());

drop policy if exists "Users can create own app settings" on public.app_settings;
create policy "Users can create own app settings"
on public.app_settings for insert
to authenticated
with check (owner_id = auth.uid());

drop policy if exists "Users can update own app settings" on public.app_settings;
create policy "Users can update own app settings"
on public.app_settings for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());
