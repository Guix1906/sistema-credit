create unique index if not exists alerts_open_installment_unique_idx
on public.alerts (installment_id)
where status = 'open' and installment_id is not null;

create or replace function public.refresh_overdue_alerts()
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_owner_id uuid := auth.uid();
  v_inserted integer := 0;
begin
  if v_owner_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  update public.installments
  set status = 'overdue'
  where status in ('pending', 'partial')
    and due_date < current_date;

  update public.loans
  set status = 'overdue'
  where status = 'active'
    and exists (
      select 1
      from public.installments
      where installments.loan_id = loans.id
        and installments.status = 'overdue'
    );

  insert into public.alerts (
    owner_id, client_id, loan_id, installment_id, title, message, severity, status, due_at
  )
  select
    installments.owner_id,
    loans.client_id,
    loans.id,
    installments.id,
    'Parcela atrasada',
    'Parcela ' || installments.installment_number || ' vencida em ' || installments.due_date,
    case
      when current_date - installments.due_date >= 10 then 'critical'
      else 'warning'
    end,
    'open',
    installments.due_date::timestamptz
  from public.installments
  join public.loans on loans.id = installments.loan_id
  where installments.status = 'overdue'
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
