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
begin
  if v_actor_id is null then raise exception 'Usuario nao autenticado'; end if;

  if p_existing_client_id is not null then
    select id, owner_id into v_client_id, v_owner_id from public.clients where id = p_existing_client_id;
    if v_client_id is null then raise exception 'Cliente nao encontrado'; end if;
  else
    v_owner_id := v_actor_id;
    insert into public.clients (
      owner_id, route_id, name, document_number, rg, phone, whatsapp, address,
      neighborhood, city, reference_point, notes
    )
    values (
      v_owner_id, nullif(p_client->>'route_id', '')::uuid, p_client->>'name',
      nullif(p_client->>'document_number', ''), nullif(p_client->>'rg', ''),
      nullif(p_client->>'phone', ''), nullif(p_client->>'whatsapp', ''),
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

create or replace function public.register_installment_payment(
  p_installment_id uuid,
  p_amount_paid numeric,
  p_payment_date timestamptz,
  p_payment_method text,
  p_cashbox_id uuid default null,
  p_notes text default null,
  p_late_fee_amount numeric default 0
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_installment public.installments%rowtype;
  v_loan public.loans%rowtype;
  v_cashbox public.cashboxes%rowtype;
  v_payment_id uuid;
  v_principal_payment numeric;
  v_next_paid numeric;
  v_next_status text;
  v_loan_paid numeric;
  v_loan_remaining numeric;
begin
  if v_actor_id is null then raise exception 'Usuario nao autenticado'; end if;
  if p_amount_paid <= 0 then raise exception 'Valor pago deve ser maior que zero'; end if;
  select * into v_installment from public.installments where id = p_installment_id for update;
  if v_installment.id is null then raise exception 'Parcela nao encontrada'; end if;
  select * into v_loan from public.loans where id = v_installment.loan_id for update;

  v_principal_payment := greatest(p_amount_paid - greatest(p_late_fee_amount, 0), 0);
  v_next_paid := least(v_installment.amount, v_installment.paid_amount + v_principal_payment);
  v_next_status := case when v_next_paid >= v_installment.amount then 'paid' else 'partial' end;

  if p_cashbox_id is not null then
    select * into v_cashbox from public.cashboxes where id = p_cashbox_id for update;
    if v_cashbox.id is null then raise exception 'Caixa nao encontrado'; end if;
    if v_cashbox.owner_id <> v_loan.owner_id then raise exception 'Caixa e venda devem pertencer a mesma operacao'; end if;
  end if;

  insert into public.payments (owner_id, client_id, loan_id, installment_id, cashbox_id, amount, late_fee_amount, paid_at, payment_method, notes)
  values (v_loan.owner_id, v_loan.client_id, v_loan.id, v_installment.id, p_cashbox_id, p_amount_paid, greatest(p_late_fee_amount, 0), p_payment_date, p_payment_method, p_notes)
  returning id into v_payment_id;

  update public.installments set paid_amount = v_next_paid, status = v_next_status,
    paid_at = case when v_next_status = 'paid' then p_payment_date else null end
  where id = v_installment.id;
  select coalesce(sum(paid_amount), 0) into v_loan_paid from public.installments where loan_id = v_loan.id;
  v_loan_remaining := greatest(v_loan.total_amount - v_loan_paid, 0);
  update public.loans set paid_amount = v_loan_paid, remaining_amount = v_loan_remaining,
    status = case when v_loan_remaining = 0 then 'paid' else status end where id = v_loan.id;
  if v_next_status = 'paid' then
    update public.alerts set status = 'resolved', resolved_at = now() where installment_id = v_installment.id and status = 'open';
  end if;
  if not exists (select 1 from public.loans where client_id = v_loan.client_id and status not in ('paid', 'cancelled')) then
    update public.clients set status = 'paid_off' where id = v_loan.client_id;
  end if;
  if p_cashbox_id is not null then
    insert into public.cash_movements (owner_id, cashbox_id, payment_id, type, amount, description)
    values (v_cashbox.owner_id, p_cashbox_id, v_payment_id, 'inflow', p_amount_paid, 'Recebimento de parcela ' || v_installment.installment_number);
    update public.cashboxes set current_balance = current_balance + p_amount_paid where id = p_cashbox_id;
  end if;
  insert into public.audit_logs (owner_id, actor_id, table_name, record_id, action, new_data)
  values (v_actor_id, v_actor_id, 'payments', v_payment_id, 'insert', jsonb_build_object('installment_id', v_installment.id, 'amount', p_amount_paid));
  return v_payment_id;
end;
$$;
