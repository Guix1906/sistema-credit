create or replace function public.delete_empty_route(p_route_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_route public.routes%rowtype;
  v_clients integer;
  v_members integer;
  v_loans integer;
  v_cashboxes integer;
  v_expenses integer;
begin
  if v_actor_id is null then raise exception 'Usuario nao autenticado'; end if;
  if not public.can_manage_all() then raise exception 'Somente administradores e gerentes podem excluir rotas'; end if;

  select * into v_route from public.routes where id=p_route_id for update;
  if v_route.id is null then raise exception 'Rota nao encontrada'; end if;

  select count(*) into v_clients from public.clients where route_id=p_route_id;
  select count(*) into v_members from public.profiles where route_id=p_route_id;
  select count(*) into v_loans from public.loans where route_id=p_route_id;
  select count(*) into v_cashboxes from public.cashboxes where route_id=p_route_id;
  select count(*) into v_expenses from public.expenses where route_id=p_route_id;

  if v_loans > 0 or v_cashboxes > 0 or v_expenses > 0 then
    raise exception 'Rota possui historico financeiro: % emprestimo(s), % caixa(s), % gasto(s). Use Arquivar.', v_loans, v_cashboxes, v_expenses;
  end if;

  delete from public.routes where id=p_route_id;

  insert into public.audit_logs(owner_id,actor_id,table_name,record_id,action,old_data,new_data)
  values(v_route.owner_id,v_actor_id,'routes',p_route_id,'delete',to_jsonb(v_route),jsonb_build_object('clientes_desvinculados',v_clients,'usuarios_desvinculados',v_members));

  return jsonb_build_object('clientes_desvinculados',v_clients,'usuarios_desvinculados',v_members);
end;
$$;

grant execute on function public.delete_empty_route(uuid) to authenticated;
