drop policy if exists "Users can read own access settings" on public.access_settings;
drop policy if exists "Users can create own access settings" on public.access_settings;
drop policy if exists "Users can update own access settings" on public.access_settings;
drop policy if exists "Users can delete own access settings" on public.access_settings;

drop policy if exists "Team can read access settings" on public.access_settings;
create policy "Team can read access settings"
on public.access_settings for select to authenticated
using (true);

drop policy if exists "Managers can create own access settings" on public.access_settings;
create policy "Managers can create own access settings"
on public.access_settings for insert to authenticated
with check (public.can_manage_all() and owner_id = auth.uid());

drop policy if exists "Managers can update own access settings" on public.access_settings;
create policy "Managers can update own access settings"
on public.access_settings for update to authenticated
using (public.can_manage_all() and owner_id = auth.uid())
with check (public.can_manage_all() and owner_id = auth.uid());
