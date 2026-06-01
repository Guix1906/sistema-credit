alter table public.clients
  add column if not exists affiliate_id uuid references public.profiles(id) on delete set null;

alter table public.routes
  add column if not exists collection_days integer[] not null default '{}'::integer[];

create index if not exists clients_affiliate_id_idx on public.clients (affiliate_id);
create index if not exists routes_collection_days_idx on public.routes using gin (collection_days);

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
    or exists (
      select 1
      from public.routes
      where routes.id = target_route_id
        and routes.collector_id = auth.uid()
    )
$$;

grant execute on function public.can_access_route(uuid) to authenticated;

create or replace function public.create_credit_sale(
  p_existing_client_id uuid,
  p_client jsonb,
  p_loan jsonb,
  p_installments jsonb,
  p_cashbox_id uuid default null
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_owner_id uuid;
  v_client_id uuid;
  v_loan_id uuid;
  v_cashbox public.cashboxes%rowtype;
  v_phone text := nullif(trim(p_client->>'phone'), '');
  v_document text := nullif(trim(p_client->>'document_number'), '');
begin
  if v_actor_id is null then raise exception 'Usuario nao autenticado'; end if;

  if p_existing_client_id is not null then
    select id, owner_id into v_client_id, v_owner_id from public.clients where id = p_existing_client_id;
    if v_client_id is null then raise exception 'Cliente nao encontrado'; end if;
  else
    if nullif(trim(p_client->>'name'), '') is null then raise exception 'Nome do cliente e obrigatorio'; end if;
    if v_phone is null then raise exception 'Telefone do cliente e obrigatorio'; end if;
    if exists (
      select 1 from public.clients
      where regexp_replace(coalesce(phone, ''), '\D', '', 'g') = regexp_replace(v_phone, '\D', '', 'g')
        or (
          v_document is not null
          and regexp_replace(coalesce(document_number, ''), '\D', '', 'g') = regexp_replace(v_document, '\D', '', 'g')
        )
    ) then raise exception 'Cliente ja cadastrado com este telefone ou documento'; end if;

    v_owner_id := v_actor_id;
    insert into public.clients (
      owner_id, route_id, affiliate_id, name, document_number, rg, phone, whatsapp, address,
      neighborhood, city, reference_point, notes
    )
    values (
      v_owner_id, nullif(p_client->>'route_id', '')::uuid,
      nullif(p_client->>'affiliate_id', '')::uuid, trim(p_client->>'name'),
      v_document, nullif(p_client->>'rg', ''), v_phone, nullif(p_client->>'whatsapp', ''),
      nullif(p_client->>'address', ''), nullif(p_client->>'neighborhood', ''),
      nullif(p_client->>'city', ''), nullif(p_client->>'reference_point', ''),
      nullif(p_client->>'notes', '')
    )
    returning id into v_client_id;
  end if;

  insert into public.loans (
    owner_id, client_id, route_id, collector_id, principal_amount, interest_amount,
    total_amount, paid_amount, remaining_amount, issued_at, first_due_date,
    final_due_date, payment_frequency, term_days, interest_rate, status, notes
  )
  values (
    v_owner_id, v_client_id, nullif(p_loan->>'route_id', '')::uuid,
    nullif(p_loan->>'collector_id', '')::uuid, (p_loan->>'principal_amount')::numeric,
    (p_loan->>'interest_amount')::numeric, (p_loan->>'total_amount')::numeric, 0,
    (p_loan->>'total_amount')::numeric, (p_loan->>'issued_at')::date,
    (p_loan->>'first_due_date')::date, (p_loan->>'final_due_date')::date,
    p_loan->>'payment_frequency', (p_loan->>'term_days')::integer,
    (p_loan->>'interest_rate')::numeric, 'active', nullif(p_loan->>'notes', '')
  )
  returning id into v_loan_id;

  insert into public.installments (owner_id, loan_id, installment_number, due_date, amount, paid_amount, status)
  select v_owner_id, v_loan_id, (item->>'installment_number')::integer,
    (item->>'due_date')::date, (item->>'amount')::numeric, 0, 'pending'
  from jsonb_array_elements(p_installments) item;

  if p_cashbox_id is not null then
    select * into v_cashbox from public.cashboxes where id = p_cashbox_id for update;
    if v_cashbox.id is null then raise exception 'Caixa nao encontrado'; end if;
    if v_cashbox.owner_id <> v_owner_id then raise exception 'Caixa e cliente devem pertencer a mesma operacao'; end if;
    if v_cashbox.current_balance - (p_loan->>'principal_amount')::numeric < 0
      and not v_cashbox.allow_negative and not public.is_admin()
    then raise exception 'Saldo do caixa nao pode ficar negativo sem permissao admin'; end if;
    insert into public.cash_movements (owner_id, cashbox_id, type, amount, description)
    values (v_owner_id, p_cashbox_id, 'outflow', (p_loan->>'principal_amount')::numeric, 'Saida de venda ' || v_loan_id);
    update public.cashboxes set current_balance = current_balance - (p_loan->>'principal_amount')::numeric where id = p_cashbox_id;
  end if;

  insert into public.audit_logs (owner_id, actor_id, table_name, record_id, action, new_data)
  values (v_actor_id, v_actor_id, 'loans', v_loan_id, 'insert', jsonb_build_object('client_id', v_client_id, 'total_amount', p_loan->>'total_amount'));
  return jsonb_build_object('loan_id', v_loan_id, 'client_id', v_client_id);
end;
$$;

grant execute on function public.create_credit_sale(uuid, jsonb, jsonb, jsonb, uuid) to authenticated;
