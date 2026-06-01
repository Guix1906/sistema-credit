create or replace function public.purge_client_permanently(p_client_id uuid)
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
begin
  if v_actor_id is null then raise exception 'Usuario nao autenticado'; end if;
  if not public.is_admin() then raise exception 'Somente administradores podem excluir clientes permanentemente'; end if;

  select * into v_client from public.clients where id=p_client_id for update;
  if v_client.id is null then raise exception 'Cliente nao encontrado'; end if;

  select count(*) into v_loans from public.loans where client_id=p_client_id;
  select count(*) into v_payments from public.payments where client_id=p_client_id;
  select count(*) into v_documents from public.client_documents where client_id=p_client_id;
  select count(*) into v_collection_logs from public.collection_logs where client_id=p_client_id;
  select count(*) into v_alerts from public.alerts where client_id=p_client_id;

  delete from public.payments where client_id=p_client_id;
  delete from public.loans where client_id=p_client_id;
  delete from public.clients where id=p_client_id;

  insert into public.audit_logs(owner_id,actor_id,table_name,record_id,action,old_data,new_data)
  values(
    v_client.owner_id,
    v_actor_id,
    'clients',
    p_client_id,
    'delete',
    to_jsonb(v_client),
    jsonb_build_object(
      'mode','permanent',
      'loans_removed',v_loans,
      'payments_removed',v_payments,
      'documents_removed',v_documents,
      'collection_logs_removed',v_collection_logs,
      'alerts_removed',v_alerts
    )
  );

  return jsonb_build_object(
    'mode','permanent',
    'loans_removed',v_loans,
    'payments_removed',v_payments,
    'documents_removed',v_documents,
    'collection_logs_removed',v_collection_logs,
    'alerts_removed',v_alerts
  );
end;
$$;

grant execute on function public.purge_client_permanently(uuid) to authenticated;
