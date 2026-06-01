create or replace function public.refresh_overdue_alerts()
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_owner_id uuid := auth.uid();
  v_operational_date date := (now() at time zone 'America/Sao_Paulo')::date;
  v_inserted integer := 0;
begin
  if v_owner_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  update public.installments
  set status = 'overdue'
  where status in ('pending', 'partial')
    and due_date < v_operational_date;

  update public.loans
  set status = 'overdue'
  where status = 'active'
    and exists (
      select 1
      from public.installments
      where installments.loan_id = loans.id
        and installments.status = 'overdue'
    );

  update public.alerts
  set
    title = case
      when installments.due_date < v_operational_date then 'Parcela atrasada'
      when installments.due_date = v_operational_date then 'Parcela vence hoje'
      else 'Parcela vence amanha'
    end,
    message = 'Parcela ' || installments.installment_number || ' com vencimento em ' || installments.due_date,
    severity = case
      when v_operational_date - installments.due_date >= 10 then 'critical'
      when installments.due_date < v_operational_date then 'warning'
      else 'info'
    end,
    due_at = installments.due_date::timestamptz,
    resolved_at = null,
    updated_at = now()
  from public.installments
  where alerts.installment_id = installments.id
    and alerts.status = 'open'
    and installments.status not in ('paid', 'cancelled')
    and installments.due_date <= v_operational_date + 1;

  update public.alerts
  set status = 'resolved', resolved_at = now(), updated_at = now()
  where status = 'open'
    and installment_id is not null
    and exists (
      select 1
      from public.installments
      where installments.id = alerts.installment_id
        and (
          installments.status in ('paid', 'cancelled')
          or installments.due_date > v_operational_date + 1
        )
    );

  insert into public.alerts (
    owner_id, client_id, loan_id, installment_id, title, message, severity, status, due_at
  )
  select
    installments.owner_id,
    loans.client_id,
    loans.id,
    installments.id,
    case
      when installments.due_date < v_operational_date then 'Parcela atrasada'
      when installments.due_date = v_operational_date then 'Parcela vence hoje'
      else 'Parcela vence amanha'
    end,
    'Parcela ' || installments.installment_number || ' com vencimento em ' || installments.due_date,
    case
      when v_operational_date - installments.due_date >= 10 then 'critical'
      when installments.due_date < v_operational_date then 'warning'
      else 'info'
    end,
    'open',
    installments.due_date::timestamptz
  from public.installments
  join public.loans on loans.id = installments.loan_id
  where installments.status not in ('paid', 'cancelled')
    and installments.due_date <= v_operational_date + 1
    and not exists (
      select 1
      from public.alerts
      where alerts.installment_id = installments.id
        and alerts.status = 'open'
    );

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

grant execute on function public.refresh_overdue_alerts() to authenticated;
