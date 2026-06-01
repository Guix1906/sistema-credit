alter table public.app_settings enable row level security;

drop trigger if exists set_app_settings_updated_at on public.app_settings;
create trigger set_app_settings_updated_at
before update on public.app_settings
for each row execute function public.set_updated_at();

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
