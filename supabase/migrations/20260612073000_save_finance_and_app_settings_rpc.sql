create or replace function public.save_loan_settings(
  p_interest_rate numeric,
  p_late_fee_rate numeric,
  p_default_installments integer,
  p_default_frequency text
)
returns public.loan_settings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
  v_settings_id uuid;
  v_settings public.loan_settings;
begin
  if not public.can_manage_all() then
    raise exception 'Somente administradores e gerentes podem alterar configuracoes financeiras';
  end if;

  if p_interest_rate < 0 or p_late_fee_rate < 0 then
    raise exception 'Taxas financeiras nao podem ser negativas';
  end if;

  if p_default_installments <= 0 then
    raise exception 'Parcelas padrao deve ser maior que zero';
  end if;

  if p_default_frequency not in ('daily', 'weekly', 'biweekly', 'monthly') then
    raise exception 'Forma padrao invalida';
  end if;

  v_owner_id := public.resolve_operation_owner_id();
  if v_owner_id is null then
    raise exception 'Operacao nao encontrada para salvar configuracoes financeiras';
  end if;

  select id
  into v_settings_id
  from public.loan_settings
  where owner_id = v_owner_id
    and is_active
  order by created_at desc
  limit 1;

  if v_settings_id is null then
    insert into public.loan_settings (
      owner_id,
      name,
      interest_rate,
      late_fee_rate,
      default_installments,
      default_frequency,
      is_active
    )
    values (
      v_owner_id,
      'Padrao',
      p_interest_rate,
      p_late_fee_rate,
      p_default_installments,
      p_default_frequency,
      true
    )
    returning * into v_settings;
  else
    update public.loan_settings
    set
      name = 'Padrao',
      interest_rate = p_interest_rate,
      late_fee_rate = p_late_fee_rate,
      default_installments = p_default_installments,
      default_frequency = p_default_frequency,
      is_active = true
    where id = v_settings_id
    returning * into v_settings;
  end if;

  return v_settings;
end;
$$;

create or replace function public.save_app_settings(
  p_system_name text,
  p_logo_path text,
  p_modalities integer[],
  p_payment_methods text[]
)
returns public.app_settings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
  v_settings public.app_settings;
begin
  if not public.can_manage_all() then
    raise exception 'Somente administradores e gerentes podem alterar configuracoes do sistema';
  end if;

  v_owner_id := public.resolve_operation_owner_id();
  if v_owner_id is null then
    raise exception 'Operacao nao encontrada para salvar configuracoes do sistema';
  end if;

  if p_modalities is null or array_length(p_modalities, 1) is null then
    raise exception 'Selecione ao menos uma modalidade';
  end if;

  if p_payment_methods is null or array_length(p_payment_methods, 1) is null then
    raise exception 'Selecione ao menos uma forma de pagamento';
  end if;

  insert into public.app_settings (
    owner_id,
    system_name,
    logo_path,
    modalities,
    payment_methods
  )
  values (
    v_owner_id,
    coalesce(nullif(trim(p_system_name), ''), 'Sistema de Credito'),
    nullif(trim(coalesce(p_logo_path, '')), ''),
    p_modalities,
    p_payment_methods
  )
  on conflict (owner_id) do update
  set
    system_name = excluded.system_name,
    logo_path = excluded.logo_path,
    modalities = excluded.modalities,
    payment_methods = excluded.payment_methods
  returning * into v_settings;

  return v_settings;
end;
$$;

grant execute on function public.save_loan_settings(numeric, numeric, integer, text) to authenticated;
grant execute on function public.save_app_settings(text, text, integer[], text[]) to authenticated;
