create or replace function public.create_manual_cash_movement(
  p_cashbox_id uuid,
  p_type text,
  p_amount numeric,
  p_description text
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_cashbox public.cashboxes%rowtype;
  v_movement_id uuid;
  v_next_balance numeric;
begin
  if v_actor_id is null then raise exception 'Usuario nao autenticado'; end if;
  if p_type not in ('inflow', 'outflow', 'adjustment') then raise exception 'Tipo de movimento invalido'; end if;
  if p_amount <= 0 then raise exception 'Valor deve ser maior que zero'; end if;
  select * into v_cashbox from public.cashboxes where id = p_cashbox_id for update;
  if v_cashbox.id is null then raise exception 'Caixa nao encontrado'; end if;
  v_next_balance := case when p_type = 'outflow' then v_cashbox.current_balance - p_amount else v_cashbox.current_balance + p_amount end;
  if v_next_balance < 0 and not v_cashbox.allow_negative and not public.is_admin() then
    raise exception 'Saldo do caixa nao pode ficar negativo sem permissao admin';
  end if;
  insert into public.cash_movements(owner_id,cashbox_id,type,amount,description)
  values(v_cashbox.owner_id,p_cashbox_id,p_type,p_amount,p_description)
  returning id into v_movement_id;
  update public.cashboxes set current_balance=v_next_balance where id=p_cashbox_id;
  insert into public.audit_logs(owner_id,actor_id,table_name,record_id,action,new_data)
  values(v_actor_id,v_actor_id,'cash_movements',v_movement_id,'insert',jsonb_build_object('cashbox_id',p_cashbox_id,'type',p_type,'amount',p_amount));
  return v_movement_id;
end;
$$;

create or replace function public.reverse_cash_movement(p_movement_id uuid)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_movement public.cash_movements%rowtype;
  v_cashbox public.cashboxes%rowtype;
  v_reverse_id uuid;
  v_reverse_type text;
  v_next_balance numeric;
begin
  if v_actor_id is null then raise exception 'Usuario nao autenticado'; end if;
  select * into v_movement from public.cash_movements where id=p_movement_id for update;
  if v_movement.id is null then raise exception 'Movimento nao encontrado'; end if;
  if v_movement.reversed_movement_id is not null then raise exception 'Este movimento ja foi estornado'; end if;
  select * into v_cashbox from public.cashboxes where id=v_movement.cashbox_id for update;
  v_reverse_type := case when v_movement.type='inflow' then 'outflow' when v_movement.type='outflow' then 'inflow' else 'outflow' end;
  v_next_balance := case when v_reverse_type='outflow' then v_cashbox.current_balance-v_movement.amount else v_cashbox.current_balance+v_movement.amount end;
  if v_next_balance < 0 and not v_cashbox.allow_negative and not public.is_admin() then
    raise exception 'Saldo do caixa nao pode ficar negativo sem permissao admin';
  end if;
  insert into public.cash_movements(owner_id,cashbox_id,type,amount,description,reversed_movement_id)
  values(v_cashbox.owner_id,v_cashbox.id,v_reverse_type,v_movement.amount,'Estorno: '||v_movement.description,v_movement.id)
  returning id into v_reverse_id;
  update public.cash_movements set reversed_movement_id=v_reverse_id where id=v_movement.id;
  update public.cashboxes set current_balance=v_next_balance where id=v_cashbox.id;
  insert into public.audit_logs(owner_id,actor_id,table_name,record_id,action,new_data)
  values(v_actor_id,v_actor_id,'cash_movements',v_reverse_id,'insert',jsonb_build_object('reversed_movement_id',v_movement.id));
  return v_reverse_id;
end;
$$;

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
  if p_amount <= 0 then raise exception 'Valor deve ser maior que zero'; end if;
  if p_cashbox_id is not null then
    select * into v_cashbox from public.cashboxes where id=p_cashbox_id for update;
    if v_cashbox.id is null then raise exception 'Caixa nao encontrado'; end if;
    v_owner_id := v_cashbox.owner_id;
    if v_cashbox.current_balance-p_amount < 0 and not v_cashbox.allow_negative and not public.is_admin() then
      raise exception 'Saldo do caixa nao pode ficar negativo sem permissao admin';
    end if;
  end if;
  insert into public.expenses(owner_id,cashbox_id,route_id,category,amount,expense_date,description)
  values(v_owner_id,p_cashbox_id,p_route_id,p_category,p_amount,p_expense_date,p_description)
  returning id into v_expense_id;
  if p_cashbox_id is not null then
    insert into public.cash_movements(owner_id,cashbox_id,type,amount,description)
    values(v_cashbox.owner_id,p_cashbox_id,'outflow',p_amount,'Despesa: '||p_category);
    update public.cashboxes set current_balance=current_balance-p_amount where id=p_cashbox_id;
  end if;
  insert into public.audit_logs(owner_id,actor_id,table_name,record_id,action,new_data)
  values(v_actor_id,v_actor_id,'expenses',v_expense_id,'insert',jsonb_build_object('amount',p_amount,'category',p_category));
  return v_expense_id;
end;
$$;

grant execute on function public.create_manual_cash_movement(uuid,text,numeric,text) to authenticated;
grant execute on function public.reverse_cash_movement(uuid) to authenticated;
grant execute on function public.create_expense_with_cash_movement(uuid,uuid,text,numeric,date,text) to authenticated;
