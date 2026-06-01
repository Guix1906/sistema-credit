create or replace function public.delete_or_archive_client(p_client_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_client public.clients%rowtype;
  v_loans integer;
  v_payments integer;
  v_documents integer;
  v_collection_logs integer;
  v_alerts integer;
  v_has_history boolean;
begin
  if v_actor_id is null then raise exception 'Usuario nao autenticado'; end if;
  if not public.can_manage_all() then raise exception 'Somente administradores e gerentes podem excluir clientes'; end if;

  select * into v_client from public.clients where id=p_client_id for update;
  if v_client.id is null then raise exception 'Cliente nao encontrado'; end if;

  select count(*) into v_loans from public.loans where client_id=p_client_id;
  select count(*) into v_payments from public.payments where client_id=p_client_id;
  select count(*) into v_documents from public.client_documents where client_id=p_client_id;
  select count(*) into v_collection_logs from public.collection_logs where client_id=p_client_id;
  select count(*) into v_alerts from public.alerts where client_id=p_client_id;
  v_has_history := v_loans > 0 or v_payments > 0 or v_documents > 0 or v_collection_logs > 0 or v_alerts > 0;

  if v_has_history then
    update public.clients set is_active=false,status='inactive' where id=p_client_id;
    insert into public.audit_logs(owner_id,actor_id,table_name,record_id,action,old_data,new_data)
    values(v_client.owner_id,v_actor_id,'clients',p_client_id,'update',to_jsonb(v_client),jsonb_build_object('is_active',false,'status','inactive','reason','archive_with_history'));
    return jsonb_build_object('mode','archived','loans',v_loans,'payments',v_payments,'documents',v_documents,'collection_logs',v_collection_logs,'alerts',v_alerts);
  end if;

  delete from public.clients where id=p_client_id;
  insert into public.audit_logs(owner_id,actor_id,table_name,record_id,action,old_data)
  values(v_client.owner_id,v_actor_id,'clients',p_client_id,'delete',to_jsonb(v_client));
  return jsonb_build_object('mode','deleted');
end;
$$;

grant execute on function public.delete_or_archive_client(uuid) to authenticated;
