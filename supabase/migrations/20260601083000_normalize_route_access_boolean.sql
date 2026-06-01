create or replace function public.can_access_route(target_route_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.can_manage_all()
    or coalesce(target_route_id = public.current_profile_route_id(), false)
    or exists (
      select 1
      from public.routes
      where routes.id = target_route_id
        and routes.collector_id = auth.uid()
    )
$$;

grant execute on function public.can_access_route(uuid) to authenticated;
