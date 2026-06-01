alter table public.expenses
  add column if not exists status text not null default 'active',
  add column if not exists payment_method text not null default 'cash',
  add column if not exists notes text,
  add column if not exists responsible_id uuid references public.profiles(id) on delete set null;

alter table public.expenses drop constraint if exists expenses_status_check;
alter table public.expenses add constraint expenses_status_check check (status in ('active', 'archived'));

alter table public.cash_movements
  add column if not exists expense_id uuid references public.expenses(id) on delete set null;

create index if not exists expenses_status_idx on public.expenses(status, expense_date desc);
create index if not exists cash_movements_expense_id_idx on public.cash_movements(expense_id);

create or replace function public.create_expense_with_cash_movement(
  p_cashbox_id uuid,
  p_route_id uuid,
  p_category text,
  p_amount numeric,
  p_expense_date date,
  p_description text
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_owner_id uuid := auth.uid();
  v_cashbox public.cashboxes%rowtype;
  v_expense_id uuid;
begin
  if v_actor_id is null then raise exception 'Usuario nao autenticado'; end if;
  if trim(coalesce(p_category, '')) = '' then raise exception 'Informe a categoria'; end if;
  if p_amount <= 0 then raise exception 'Valor deve ser maior que zero'; end if;
  if p_cashbox_id is not null then
    select * into v_cashbox from public.cashboxes where id=p_cashbox_id for update;
    if v_cashbox.id is null then raise exception 'Caixa nao encontrado'; end if;
    v_owner_id := v_cashbox.owner_id;
    if v_cashbox.current_balance-p_amount < 0 and not v_cashbox.allow_negative and not public.is_admin() then
      raise exception 'Saldo do caixa nao pode ficar negativo sem permissao admin';
    end if;
  end if;
  insert into public.expenses(owner_id,cashbox_id,route_id,category,amount,expense_date,description,responsible_id)
  values(v_owner_id,p_cashbox_id,p_route_id,p_category,p_amount,p_expense_date,p_description,v_actor_id)
  returning id into v_expense_id;
  if p_cashbox_id is not null then
    insert into public.cash_movements(owner_id,cashbox_id,expense_id,type,amount,description)
    values(v_cashbox.owner_id,p_cashbox_id,v_expense_id,'outflow',p_amount,'Despesa: '||p_category);
    update public.cashboxes set current_balance=current_balance-p_amount where id=p_cashbox_id;
  end if;
  insert into public.audit_logs(owner_id,actor_id,table_name,record_id,action,new_data)
  values(v_actor_id,v_actor_id,'expenses',v_expense_id,'insert',jsonb_build_object('amount',p_amount,'category',p_category));
  return v_expense_id;
end;
$$;

create or replace function public.update_expense_details(
  p_expense_id uuid,
  p_route_id uuid,
  p_category text,
  p_description text,
  p_payment_method text,
  p_notes text
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_expense public.expenses%rowtype;
begin
  if v_actor_id is null then raise exception 'Usuario nao autenticado'; end if;
  select * into v_expense from public.expenses where id=p_expense_id for update;
  if v_expense.id is null then raise exception 'Gasto nao encontrado'; end if;
  if v_expense.status <> 'active' then raise exception 'Gasto arquivado nao pode ser alterado'; end if;
  update public.expenses set
    route_id=p_route_id,
    category=p_category,
    description=p_description,
    payment_method=coalesce(nullif(p_payment_method, ''), 'cash'),
    notes=p_notes
  where id=p_expense_id;
  insert into public.audit_logs(owner_id,actor_id,table_name,record_id,action,old_data,new_data)
  values(v_actor_id,v_actor_id,'expenses',p_expense_id,'update',to_jsonb(v_expense),jsonb_build_object('category',p_category,'route_id',p_route_id,'payment_method',p_payment_method));
end;
$$;

create or replace function public.archive_expense(p_expense_id uuid)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_expense public.expenses%rowtype;
  v_cashbox public.cashboxes%rowtype;
  v_movement_id uuid;
begin
  if v_actor_id is null then raise exception 'Usuario nao autenticado'; end if;
  select * into v_expense from public.expenses where id=p_expense_id for update;
  if v_expense.id is null then raise exception 'Gasto nao encontrado'; end if;
  if v_expense.status = 'archived' then raise exception 'Gasto ja arquivado'; end if;
  if v_expense.cashbox_id is not null then
    select * into v_cashbox from public.cashboxes where id=v_expense.cashbox_id for update;
    insert into public.cash_movements(owner_id,cashbox_id,expense_id,type,amount,description)
    values(v_cashbox.owner_id,v_cashbox.id,v_expense.id,'inflow',v_expense.amount,'Estorno de despesa: '||v_expense.category)
    returning id into v_movement_id;
    update public.cashboxes set current_balance=current_balance+v_expense.amount where id=v_cashbox.id;
  end if;
  update public.expenses set status='archived' where id=p_expense_id;
  insert into public.audit_logs(owner_id,actor_id,table_name,record_id,action,old_data,new_data)
  values(v_actor_id,v_actor_id,'expenses',p_expense_id,'update',to_jsonb(v_expense),jsonb_build_object('status','archived','cash_movement_id',v_movement_id));
  return v_movement_id;
end;
$$;

grant execute on function public.update_expense_details(uuid,uuid,text,text,text,text) to authenticated;
grant execute on function public.archive_expense(uuid) to authenticated;
