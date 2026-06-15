-- Final hardening pass before client delivery.
-- Keeps the existing single-operation model, but removes unsafe global reads and
-- makes destructive deletes/storage access safer for shared route workflows.

update public.profiles
set role = case role
  when 'manager' then 'gerente'
  when 'collector' then 'cobrador'
  when 'operator' then 'atendente'
  else role
end
where role in ('manager', 'collector', 'operator');

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('admin', 'gerente', 'afiliado', 'cobrador', 'atendente'));

create or replace function public.can_manage_all()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_profile_role() in ('admin', 'gerente'), false)
$$;

grant execute on function public.can_manage_all() to authenticated;

create or replace function public.resolve_operation_owner_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_owner_id uuid;
begin
  if v_actor_id is null then
    return null;
  end if;

  if exists (select 1 from public.app_settings where owner_id = v_actor_id)
    or exists (select 1 from public.access_settings where owner_id = v_actor_id)
    or exists (select 1 from public.loan_settings where owner_id = v_actor_id)
  then
    return v_actor_id;
  end if;

  select routes.owner_id
  into v_owner_id
  from public.profiles
  join public.routes on routes.id = profiles.route_id
  where profiles.id = v_actor_id
  limit 1;

  if v_owner_id is not null then
    return v_owner_id;
  end if;

  select routes.owner_id
  into v_owner_id
  from public.routes
  where routes.collector_id = v_actor_id
  order by routes.updated_at desc, routes.created_at desc
  limit 1;

  if v_owner_id is not null then
    return v_owner_id;
  end if;

  select profiles.id
  into v_owner_id
  from public.profiles
  where profiles.role = 'admin'
    and profiles.is_active
  order by profiles.created_at asc
  limit 1;

  return coalesce(v_owner_id, v_actor_id);
end;
$$;

create or replace function public.get_current_app_settings()
returns table (
  system_name text,
  logo_path text,
  modalities integer[],
  payment_methods text[]
)
language sql
stable
security definer
set search_path = public
as $$
  select app_settings.system_name, app_settings.logo_path, app_settings.modalities, app_settings.payment_methods
  from public.app_settings
  where app_settings.owner_id = public.resolve_operation_owner_id()
  limit 1
$$;

create or replace function public.get_current_access_settings()
returns table (
  opening_time time,
  closing_time time,
  allowed_days smallint[],
  timezone text,
  allow_admin_outside_hours boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select access_settings.opening_time, access_settings.closing_time, access_settings.allowed_days,
    access_settings.timezone, access_settings.allow_admin_outside_hours
  from public.access_settings
  where access_settings.owner_id = public.resolve_operation_owner_id()
  limit 1
$$;

create or replace function public.get_current_loan_settings()
returns table (
  id uuid,
  owner_id uuid,
  name text,
  interest_rate numeric,
  late_fee_rate numeric,
  default_installments integer,
  default_frequency text,
  is_active boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select loan_settings.id, loan_settings.owner_id, loan_settings.name, loan_settings.interest_rate,
    loan_settings.late_fee_rate, loan_settings.default_installments, loan_settings.default_frequency,
    loan_settings.is_active
  from public.loan_settings
  where loan_settings.owner_id = public.resolve_operation_owner_id()
    and loan_settings.is_active
  order by loan_settings.created_at desc
  limit 1
$$;

grant execute on function public.resolve_operation_owner_id() to authenticated;
grant execute on function public.get_current_app_settings() to authenticated;
grant execute on function public.get_current_access_settings() to authenticated;
grant execute on function public.get_current_loan_settings() to authenticated;

create or replace function public.purge_client_permanently(p_client_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_client public.clients%rowtype;
  v_loans integer;
  v_payments integer;
  v_documents integer;
  v_collection_logs integer;
  v_alerts integer;
begin
  if v_actor_id is null then raise exception 'Usuario nao autenticado'; end if;
  if not public.is_admin() then raise exception 'Somente administradores podem excluir clientes permanentemente'; end if;

  select * into v_client from public.clients where id = p_client_id for update;
  if v_client.id is null then raise exception 'Cliente nao encontrado'; end if;

  select count(*) into v_loans from public.loans where client_id = p_client_id;
  select count(*) into v_payments from public.payments where client_id = p_client_id;
  select count(*) into v_documents from public.client_documents where client_id = p_client_id;
  select count(*) into v_collection_logs from public.collection_logs where client_id = p_client_id;
  select count(*) into v_alerts from public.alerts where client_id = p_client_id;

  if v_loans > 0 or v_payments > 0 or v_documents > 0 or v_collection_logs > 0 or v_alerts > 0 then
    raise exception 'Cliente possui historico financeiro ou operacional. Arquive o cliente para preservar o historico.';
  end if;

  delete from public.clients where id = p_client_id;

  insert into public.audit_logs(owner_id, actor_id, table_name, record_id, action, old_data, new_data)
  values(v_client.owner_id, v_actor_id, 'clients', p_client_id, 'delete', to_jsonb(v_client), jsonb_build_object('mode', 'permanent_without_history'));

  return jsonb_build_object('mode', 'deleted');
end;
$$;

grant execute on function public.purge_client_permanently(uuid) to authenticated;

create or replace function public.safe_uuid(value text)
returns uuid
language plpgsql
immutable
as $$
begin
  return value::uuid;
exception when others then
  return null;
end;
$$;

grant execute on function public.safe_uuid(text) to authenticated;

drop policy if exists "Users can read own client documents" on storage.objects;
drop policy if exists "Users can upload own client documents" on storage.objects;
drop policy if exists "Users can update own client documents" on storage.objects;
drop policy if exists "Users can delete own client documents" on storage.objects;

create policy "Team can read accessible client document files"
on storage.objects for select to authenticated
using (
  bucket_id = 'client-documents'
  and exists (
    select 1
    from public.clients
    where clients.owner_id = public.safe_uuid((storage.foldername(name))[1])
      and clients.id = public.safe_uuid((storage.foldername(name))[2])
      and (public.can_manage_all() or public.can_access_route(clients.route_id))
  )
);

create policy "Team can upload accessible client document files"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'client-documents'
  and exists (
    select 1
    from public.clients
    where clients.owner_id = public.safe_uuid((storage.foldername(name))[1])
      and clients.id = public.safe_uuid((storage.foldername(name))[2])
      and (public.can_manage_all() or public.can_access_route(clients.route_id))
  )
);

create policy "Team can update accessible client document files"
on storage.objects for update to authenticated
using (
  bucket_id = 'client-documents'
  and exists (
    select 1
    from public.clients
    where clients.owner_id = public.safe_uuid((storage.foldername(name))[1])
      and clients.id = public.safe_uuid((storage.foldername(name))[2])
      and (public.can_manage_all() or public.can_access_route(clients.route_id))
  )
)
with check (
  bucket_id = 'client-documents'
  and exists (
    select 1
    from public.clients
    where clients.owner_id = public.safe_uuid((storage.foldername(name))[1])
      and clients.id = public.safe_uuid((storage.foldername(name))[2])
      and (public.can_manage_all() or public.can_access_route(clients.route_id))
  )
);

create policy "Team can delete accessible client document files"
on storage.objects for delete to authenticated
using (
  bucket_id = 'client-documents'
  and exists (
    select 1
    from public.clients
    where clients.owner_id = public.safe_uuid((storage.foldername(name))[1])
      and clients.id = public.safe_uuid((storage.foldername(name))[2])
      and (public.can_manage_all() or public.can_access_route(clients.route_id))
  )
);

drop policy if exists "Users can read own receipts" on storage.objects;
drop policy if exists "Users can upload own receipts" on storage.objects;
drop policy if exists "Users can update own receipts" on storage.objects;
drop policy if exists "Users can delete own receipts" on storage.objects;

create policy "Team can read accessible receipt files"
on storage.objects for select to authenticated
using (
  bucket_id = 'receipts'
  and (
    (
      (storage.foldername(name))[2] = 'payments'
      and exists (
        select 1
        from public.payments
        join public.loans on loans.id = payments.loan_id
        where payments.owner_id = public.safe_uuid((storage.foldername(name))[1])
          and payments.id = public.safe_uuid((storage.foldername(name))[3])
          and (public.can_manage_all() or public.can_access_route(loans.route_id))
      )
    )
    or (
      (storage.foldername(name))[2] = 'expenses'
      and exists (
        select 1
        from public.expenses
        where expenses.owner_id = public.safe_uuid((storage.foldername(name))[1])
          and expenses.id = public.safe_uuid((storage.foldername(name))[3])
          and (public.can_manage_all() or public.can_access_route(expenses.route_id))
      )
    )
  )
);

create policy "Team can upload accessible receipt files"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'receipts'
  and (
    (
      (storage.foldername(name))[2] = 'payments'
      and exists (
        select 1
        from public.payments
        join public.loans on loans.id = payments.loan_id
        where payments.owner_id = public.safe_uuid((storage.foldername(name))[1])
          and payments.id = public.safe_uuid((storage.foldername(name))[3])
          and (public.can_manage_all() or public.can_access_route(loans.route_id))
      )
    )
    or (
      (storage.foldername(name))[2] = 'expenses'
      and exists (
        select 1
        from public.expenses
        where expenses.owner_id = public.safe_uuid((storage.foldername(name))[1])
          and expenses.id = public.safe_uuid((storage.foldername(name))[3])
          and (public.can_manage_all() or public.can_access_route(expenses.route_id))
      )
    )
  )
);

create policy "Team can update accessible receipt files"
on storage.objects for update to authenticated
using (
  bucket_id = 'receipts'
  and (
    (
      (storage.foldername(name))[2] = 'payments'
      and exists (
        select 1
        from public.payments
        join public.loans on loans.id = payments.loan_id
        where payments.owner_id = public.safe_uuid((storage.foldername(name))[1])
          and payments.id = public.safe_uuid((storage.foldername(name))[3])
          and (public.can_manage_all() or public.can_access_route(loans.route_id))
      )
    )
    or (
      (storage.foldername(name))[2] = 'expenses'
      and exists (
        select 1
        from public.expenses
        where expenses.owner_id = public.safe_uuid((storage.foldername(name))[1])
          and expenses.id = public.safe_uuid((storage.foldername(name))[3])
          and (public.can_manage_all() or public.can_access_route(expenses.route_id))
      )
    )
  )
)
with check (
  bucket_id = 'receipts'
  and (
    (
      (storage.foldername(name))[2] = 'payments'
      and exists (
        select 1
        from public.payments
        join public.loans on loans.id = payments.loan_id
        where payments.owner_id = public.safe_uuid((storage.foldername(name))[1])
          and payments.id = public.safe_uuid((storage.foldername(name))[3])
          and (public.can_manage_all() or public.can_access_route(loans.route_id))
      )
    )
    or (
      (storage.foldername(name))[2] = 'expenses'
      and exists (
        select 1
        from public.expenses
        where expenses.owner_id = public.safe_uuid((storage.foldername(name))[1])
          and expenses.id = public.safe_uuid((storage.foldername(name))[3])
          and (public.can_manage_all() or public.can_access_route(expenses.route_id))
      )
    )
  )
);

create policy "Team can delete accessible receipt files"
on storage.objects for delete to authenticated
using (
  bucket_id = 'receipts'
  and (
    (
      (storage.foldername(name))[2] = 'payments'
      and exists (
        select 1
        from public.payments
        join public.loans on loans.id = payments.loan_id
        where payments.owner_id = public.safe_uuid((storage.foldername(name))[1])
          and payments.id = public.safe_uuid((storage.foldername(name))[3])
          and (public.can_manage_all() or public.can_access_route(loans.route_id))
      )
    )
    or (
      (storage.foldername(name))[2] = 'expenses'
      and exists (
        select 1
        from public.expenses
        where expenses.owner_id = public.safe_uuid((storage.foldername(name))[1])
          and expenses.id = public.safe_uuid((storage.foldername(name))[3])
          and (public.can_manage_all() or public.can_access_route(expenses.route_id))
      )
    )
  )
);

drop policy if exists "Users can upload own brand assets" on storage.objects;
drop policy if exists "Users can update own brand assets" on storage.objects;
drop policy if exists "Users can delete own brand assets" on storage.objects;

create policy "Managers can upload operation brand assets"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'brand-assets'
  and public.can_manage_all()
  and public.safe_uuid((storage.foldername(name))[1]) = auth.uid()
);

create policy "Managers can update operation brand assets"
on storage.objects for update to authenticated
using (
  bucket_id = 'brand-assets'
  and public.can_manage_all()
  and public.safe_uuid((storage.foldername(name))[1]) = auth.uid()
)
with check (
  bucket_id = 'brand-assets'
  and public.can_manage_all()
  and public.safe_uuid((storage.foldername(name))[1]) = auth.uid()
);

create policy "Managers can delete operation brand assets"
on storage.objects for delete to authenticated
using (
  bucket_id = 'brand-assets'
  and public.can_manage_all()
  and public.safe_uuid((storage.foldername(name))[1]) = auth.uid()
);
