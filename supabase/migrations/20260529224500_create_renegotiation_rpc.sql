create or replace function public.renegotiate_loan(
  p_loan_id uuid,
  p_term_days integer,
  p_frequency text,
  p_start_date date
)
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_owner_id uuid := auth.uid();
  v_loan public.loans%rowtype;
  v_count integer;
  v_amount numeric;
  v_index integer;
  v_due_date date;
begin
  if p_term_days not in (20, 24, 30) then
    raise exception 'Modalidade invalida';
  end if;
  if p_frequency not in ('daily', 'weekly', 'biweekly', 'monthly') then
    raise exception 'Frequencia invalida';
  end if;

  select * into v_loan from public.loans where id = p_loan_id for update;
  if v_loan.id is null then raise exception 'Venda nao encontrada'; end if;
  if v_loan.remaining_amount <= 0 then raise exception 'Venda ja quitada'; end if;

  v_count := case
    when p_frequency = 'daily' then p_term_days
    when p_frequency = 'weekly' then ceil(p_term_days / 7.0)::integer
    when p_frequency = 'biweekly' then ceil(p_term_days / 15.0)::integer
    else 1
  end;
  v_amount := round(v_loan.remaining_amount / v_count, 2);

  update public.installments
  set status = 'cancelled'
  where loan_id = p_loan_id and status in ('pending', 'partial', 'overdue');

  for v_index in 1..v_count loop
    v_due_date := case
      when p_frequency = 'daily' then p_start_date + v_index
      when p_frequency = 'weekly' then least(p_start_date + (v_index * 7), p_start_date + p_term_days)
      when p_frequency = 'biweekly' then least(p_start_date + (v_index * 15), p_start_date + p_term_days)
      else p_start_date + p_term_days
    end;
    insert into public.installments (owner_id, loan_id, installment_number, due_date, amount, paid_amount, status)
    values (
      v_owner_id,
      p_loan_id,
      (select coalesce(max(installment_number), 0) + 1 from public.installments where loan_id = p_loan_id),
      v_due_date,
      case when v_index = v_count then v_loan.remaining_amount - (v_amount * (v_count - 1)) else v_amount end,
      0,
      'pending'
    );
  end loop;

  update public.loans
  set term_days = p_term_days,
      payment_frequency = p_frequency,
      first_due_date = case when p_frequency = 'monthly' then p_start_date + p_term_days else p_start_date + case when p_frequency = 'daily' then 1 when p_frequency = 'weekly' then 7 else 15 end end,
      final_due_date = p_start_date + p_term_days,
      status = 'active',
      notes = coalesce(notes, '') || E'\nRenegociado em ' || now()
  where id = p_loan_id;

  update public.alerts
  set status = 'resolved', resolved_at = now()
  where loan_id = p_loan_id and status = 'open';

  insert into public.audit_logs (owner_id, actor_id, table_name, record_id, action, new_data)
  values (v_owner_id, v_owner_id, 'loans', p_loan_id, 'update', jsonb_build_object('renegotiated', true, 'term_days', p_term_days, 'frequency', p_frequency));

  return v_count;
end;
$$;

grant execute on function public.renegotiate_loan(uuid, integer, text, date) to authenticated;
