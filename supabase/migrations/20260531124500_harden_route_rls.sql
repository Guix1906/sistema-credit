-- Remove permissive owner-only policies created before route-aware access control.
drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Users can delete own profile" on public.profiles;

drop policy if exists "Users can read own routes" on public.routes;
drop policy if exists "Users can create own routes" on public.routes;
drop policy if exists "Users can update own routes" on public.routes;
drop policy if exists "Users can delete own routes" on public.routes;

drop policy if exists "Users can read own clients" on public.clients;
drop policy if exists "Users can create own clients" on public.clients;
drop policy if exists "Users can update own clients" on public.clients;
drop policy if exists "Users can delete own clients" on public.clients;

drop policy if exists "Users can read own loans" on public.loans;
drop policy if exists "Users can create own loans" on public.loans;
drop policy if exists "Users can update own loans" on public.loans;
drop policy if exists "Users can delete own loans" on public.loans;

drop policy if exists "Users can read own installments" on public.installments;
drop policy if exists "Users can create own installments" on public.installments;
drop policy if exists "Users can update own installments" on public.installments;
drop policy if exists "Users can delete own installments" on public.installments;

drop policy if exists "Users can read own payments" on public.payments;
drop policy if exists "Users can create own payments" on public.payments;
drop policy if exists "Users can update own payments" on public.payments;
drop policy if exists "Users can delete own payments" on public.payments;

drop policy if exists "Users can read own cashboxes" on public.cashboxes;
drop policy if exists "Users can create own cashboxes" on public.cashboxes;
drop policy if exists "Users can update own cashboxes" on public.cashboxes;
drop policy if exists "Users can delete own cashboxes" on public.cashboxes;

drop policy if exists "Users can read own cash movements" on public.cash_movements;
drop policy if exists "Users can create own cash movements" on public.cash_movements;
drop policy if exists "Users can update own cash movements" on public.cash_movements;
drop policy if exists "Users can delete own cash movements" on public.cash_movements;

drop policy if exists "Users can read own expenses" on public.expenses;
drop policy if exists "Users can create own expenses" on public.expenses;
drop policy if exists "Users can update own expenses" on public.expenses;
drop policy if exists "Users can delete own expenses" on public.expenses;

drop policy if exists "Users can read own collection logs" on public.collection_logs;
drop policy if exists "Users can create own collection logs" on public.collection_logs;
drop policy if exists "Users can update own collection logs" on public.collection_logs;
drop policy if exists "Users can delete own collection logs" on public.collection_logs;

drop policy if exists "Users can read own alerts" on public.alerts;
drop policy if exists "Users can create own alerts" on public.alerts;
drop policy if exists "Users can update own alerts" on public.alerts;
drop policy if exists "Users can delete own alerts" on public.alerts;

drop policy if exists "Users can read own client documents" on public.client_documents;
drop policy if exists "Users can create own client documents" on public.client_documents;
drop policy if exists "Users can update own client documents" on public.client_documents;
drop policy if exists "Users can delete own client documents" on public.client_documents;

drop policy if exists "Team can update payments from accessible routes" on public.payments;
create policy "Team can update payments from accessible routes"
on public.payments for update to authenticated
using (
  exists (
    select 1 from public.loans
    where loans.id = payments.loan_id
      and public.can_access_route(loans.route_id)
  )
)
with check (
  exists (
    select 1 from public.loans
    where loans.id = payments.loan_id
      and public.can_access_route(loans.route_id)
  )
);

drop policy if exists "Team can update route cashboxes" on public.cashboxes;
create policy "Team can update route cashboxes"
on public.cashboxes for update to authenticated
using (public.can_access_route(route_id))
with check (public.can_access_route(route_id));

drop policy if exists "Team can read accessible cash movements" on public.cash_movements;
create policy "Team can read accessible cash movements"
on public.cash_movements for select to authenticated
using (
  exists (
    select 1 from public.cashboxes
    where cashboxes.id = cash_movements.cashbox_id
      and public.can_access_route(cashboxes.route_id)
  )
);

drop policy if exists "Team can create accessible cash movements" on public.cash_movements;
create policy "Team can create accessible cash movements"
on public.cash_movements for insert to authenticated
with check (
  exists (
    select 1 from public.cashboxes
    where cashboxes.id = cash_movements.cashbox_id
      and public.can_access_route(cashboxes.route_id)
  )
);

drop policy if exists "Managers can update cash movements" on public.cash_movements;
create policy "Managers can update cash movements"
on public.cash_movements for update to authenticated
using (public.can_manage_all())
with check (public.can_manage_all());

drop policy if exists "Team can create accessible expenses" on public.expenses;
create policy "Team can create accessible expenses"
on public.expenses for insert to authenticated
with check (public.can_access_route(route_id));

drop policy if exists "Team can update accessible expenses" on public.expenses;
create policy "Team can update accessible expenses"
on public.expenses for update to authenticated
using (public.can_access_route(route_id))
with check (public.can_access_route(route_id));

drop policy if exists "Team can read accessible collection logs" on public.collection_logs;
create policy "Team can read accessible collection logs"
on public.collection_logs for select to authenticated
using (
  exists (
    select 1 from public.clients
    where clients.id = collection_logs.client_id
      and public.can_access_route(clients.route_id)
  )
);

drop policy if exists "Team can create accessible collection logs" on public.collection_logs;
create policy "Team can create accessible collection logs"
on public.collection_logs for insert to authenticated
with check (
  exists (
    select 1 from public.clients
    where clients.id = collection_logs.client_id
      and public.can_access_route(clients.route_id)
  )
);

drop policy if exists "Team can update accessible collection logs" on public.collection_logs;
create policy "Team can update accessible collection logs"
on public.collection_logs for update to authenticated
using (
  exists (
    select 1 from public.clients
    where clients.id = collection_logs.client_id
      and public.can_access_route(clients.route_id)
  )
)
with check (
  exists (
    select 1 from public.clients
    where clients.id = collection_logs.client_id
      and public.can_access_route(clients.route_id)
  )
);

drop policy if exists "Team can read accessible alerts" on public.alerts;
create policy "Team can read accessible alerts"
on public.alerts for select to authenticated
using (
  exists (
    select 1 from public.clients
    where clients.id = alerts.client_id
      and public.can_access_route(clients.route_id)
  )
);

drop policy if exists "Team can create accessible alerts" on public.alerts;
create policy "Team can create accessible alerts"
on public.alerts for insert to authenticated
with check (
  exists (
    select 1 from public.clients
    where clients.id = alerts.client_id
      and public.can_access_route(clients.route_id)
  )
);

drop policy if exists "Team can update accessible alerts" on public.alerts;
create policy "Team can update accessible alerts"
on public.alerts for update to authenticated
using (
  exists (
    select 1 from public.clients
    where clients.id = alerts.client_id
      and public.can_access_route(clients.route_id)
  )
)
with check (
  exists (
    select 1 from public.clients
    where clients.id = alerts.client_id
      and public.can_access_route(clients.route_id)
  )
);

drop policy if exists "Team can read accessible client documents" on public.client_documents;
create policy "Team can read accessible client documents"
on public.client_documents for select to authenticated
using (
  exists (
    select 1 from public.clients
    where clients.id = client_documents.client_id
      and public.can_access_route(clients.route_id)
  )
);

drop policy if exists "Team can create accessible client documents" on public.client_documents;
create policy "Team can create accessible client documents"
on public.client_documents for insert to authenticated
with check (
  exists (
    select 1 from public.clients
    where clients.id = client_documents.client_id
      and public.can_access_route(clients.route_id)
  )
);

drop policy if exists "Team can update accessible client documents" on public.client_documents;
create policy "Team can update accessible client documents"
on public.client_documents for update to authenticated
using (
  exists (
    select 1 from public.clients
    where clients.id = client_documents.client_id
      and public.can_access_route(clients.route_id)
  )
)
with check (
  exists (
    select 1 from public.clients
    where clients.id = client_documents.client_id
      and public.can_access_route(clients.route_id)
  )
);
