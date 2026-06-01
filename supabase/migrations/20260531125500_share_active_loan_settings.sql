drop policy if exists "Users can read own loan settings" on public.loan_settings;
drop policy if exists "Users can create own loan settings" on public.loan_settings;
drop policy if exists "Users can update own loan settings" on public.loan_settings;
drop policy if exists "Users can delete own loan settings" on public.loan_settings;

drop policy if exists "Team can read active loan settings" on public.loan_settings;
create policy "Team can read active loan settings"
on public.loan_settings for select to authenticated
using (is_active or owner_id = auth.uid());

drop policy if exists "Managers can create loan settings" on public.loan_settings;
create policy "Managers can create loan settings"
on public.loan_settings for insert to authenticated
with check (public.can_manage_all() and owner_id = auth.uid());

drop policy if exists "Managers can update own loan settings" on public.loan_settings;
create policy "Managers can update own loan settings"
on public.loan_settings for update to authenticated
using (public.can_manage_all() and owner_id = auth.uid())
with check (public.can_manage_all() and owner_id = auth.uid());
