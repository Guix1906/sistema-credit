create or replace function public.current_profile_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.current_profile_route_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select route_id from public.profiles where id = auth.uid()
$$;

create or replace function public.can_manage_all()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_profile_role() in ('admin', 'gerente', 'manager'), false)
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_profile_role() = 'admin', false)
$$;

create or replace function public.can_access_route(target_route_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.can_manage_all()
    or target_route_id = public.current_profile_route_id()
$$;

grant execute on function public.current_profile_role() to authenticated;
grant execute on function public.current_profile_route_id() to authenticated;
grant execute on function public.can_manage_all() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.can_access_route(uuid) to authenticated;

drop policy if exists "Managers can read profiles" on public.profiles;
create policy "Managers can read profiles"
on public.profiles for select
to authenticated
using (public.can_manage_all());

drop policy if exists "Admins can update profiles" on public.profiles;
create policy "Admins can update profiles"
on public.profiles for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Team can read accessible routes" on public.routes;
create policy "Team can read accessible routes"
on public.routes for select
to authenticated
using (public.can_manage_all() or id = public.current_profile_route_id());

drop policy if exists "Managers can manage routes" on public.routes;
create policy "Managers can manage routes"
on public.routes for all
to authenticated
using (public.can_manage_all())
with check (public.can_manage_all());

drop policy if exists "Team can read clients from accessible routes" on public.clients;
create policy "Team can read clients from accessible routes"
on public.clients for select
to authenticated
using (public.can_access_route(route_id));

drop policy if exists "Team can create clients in accessible routes" on public.clients;
create policy "Team can create clients in accessible routes"
on public.clients for insert
to authenticated
with check (public.can_access_route(route_id));

drop policy if exists "Team can update clients from accessible routes" on public.clients;
create policy "Team can update clients from accessible routes"
on public.clients for update
to authenticated
using (public.can_access_route(route_id))
with check (public.can_access_route(route_id));

drop policy if exists "Team can read loans from accessible routes" on public.loans;
create policy "Team can read loans from accessible routes"
on public.loans for select
to authenticated
using (public.can_access_route(route_id));

drop policy if exists "Team can create loans in accessible routes" on public.loans;
create policy "Team can create loans in accessible routes"
on public.loans for insert
to authenticated
with check (public.can_access_route(route_id));

drop policy if exists "Team can update loans from accessible routes" on public.loans;
create policy "Team can update loans from accessible routes"
on public.loans for update
to authenticated
using (public.can_access_route(route_id))
with check (public.can_access_route(route_id));

drop policy if exists "Team can read installments from accessible routes" on public.installments;
create policy "Team can read installments from accessible routes"
on public.installments for select
to authenticated
using (
  exists (
    select 1 from public.loans
    where loans.id = installments.loan_id
      and public.can_access_route(loans.route_id)
  )
);

drop policy if exists "Team can create installments from accessible routes" on public.installments;
create policy "Team can create installments from accessible routes"
on public.installments for insert
to authenticated
with check (
  exists (
    select 1 from public.loans
    where loans.id = installments.loan_id
      and public.can_access_route(loans.route_id)
  )
);

drop policy if exists "Team can update installments from accessible routes" on public.installments;
create policy "Team can update installments from accessible routes"
on public.installments for update
to authenticated
using (
  exists (
    select 1 from public.loans
    where loans.id = installments.loan_id
      and public.can_access_route(loans.route_id)
  )
)
with check (
  exists (
    select 1 from public.loans
    where loans.id = installments.loan_id
      and public.can_access_route(loans.route_id)
  )
);

drop policy if exists "Team can read payments from accessible routes" on public.payments;
create policy "Team can read payments from accessible routes"
on public.payments for select
to authenticated
using (
  exists (
    select 1 from public.loans
    where loans.id = payments.loan_id
      and public.can_access_route(loans.route_id)
  )
);

drop policy if exists "Team can create payments from accessible routes" on public.payments;
create policy "Team can create payments from accessible routes"
on public.payments for insert
to authenticated
with check (
  exists (
    select 1 from public.loans
    where loans.id = payments.loan_id
      and public.can_access_route(loans.route_id)
  )
);

drop policy if exists "Team can read route cashboxes" on public.cashboxes;
create policy "Team can read route cashboxes"
on public.cashboxes for select
to authenticated
using (public.can_access_route(route_id));

drop policy if exists "Managers can manage cashboxes" on public.cashboxes;
create policy "Managers can manage cashboxes"
on public.cashboxes for all
to authenticated
using (public.can_manage_all())
with check (public.can_manage_all());

drop policy if exists "Managers can read cash movements" on public.cash_movements;
create policy "Managers can read cash movements"
on public.cash_movements for select
to authenticated
using (public.can_manage_all());

drop policy if exists "Managers can read expenses" on public.expenses;
create policy "Managers can read expenses"
on public.expenses for select
to authenticated
using (public.can_manage_all() or public.can_access_route(route_id));

drop policy if exists "Managers can read audit logs" on public.audit_logs;
create policy "Managers can read audit logs"
on public.audit_logs for select
to authenticated
using (public.can_manage_all());
