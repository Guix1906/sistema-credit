create or replace function public.save_access_settings(
  p_opening_time time,
  p_closing_time time,
  p_allowed_days smallint[],
  p_timezone text,
  p_allow_admin_outside_hours boolean
)
returns public.access_settings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
  v_settings public.access_settings;
begin
  if not public.can_manage_all() then
    raise exception 'Somente administradores e gerentes podem alterar horario de acesso';
  end if;

  v_owner_id := public.resolve_operation_owner_id();
  if v_owner_id is null then
    raise exception 'Operacao nao encontrada para salvar horario de acesso';
  end if;

  if p_allowed_days is null or array_length(p_allowed_days, 1) is null then
    raise exception 'Selecione ao menos um dia permitido';
  end if;

  if not p_allowed_days <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[] then
    raise exception 'Dias permitidos invalidos';
  end if;

  insert into public.access_settings (
    owner_id,
    opening_time,
    closing_time,
    allowed_days,
    timezone,
    allow_admin_outside_hours
  )
  values (
    v_owner_id,
    p_opening_time,
    p_closing_time,
    p_allowed_days,
    coalesce(nullif(trim(p_timezone), ''), 'America/Sao_Paulo'),
    p_allow_admin_outside_hours
  )
  on conflict (owner_id) do update
  set
    opening_time = excluded.opening_time,
    closing_time = excluded.closing_time,
    allowed_days = excluded.allowed_days,
    timezone = excluded.timezone,
    allow_admin_outside_hours = excluded.allow_admin_outside_hours
  returning * into v_settings;

  return v_settings;
end;
$$;

grant execute on function public.save_access_settings(time, time, smallint[], text, boolean) to authenticated;
