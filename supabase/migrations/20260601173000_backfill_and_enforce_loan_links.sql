update public.clients
set affiliate_id = routes.collector_id
from public.routes
where clients.route_id = routes.id
  and clients.affiliate_id is null
  and routes.collector_id is not null;

update public.loans
set route_id = clients.route_id
from public.clients
where loans.client_id = clients.id
  and loans.route_id is null
  and clients.route_id is not null;

update public.loans
set collector_id = coalesce(
  (select clients.affiliate_id from public.clients where clients.id = loans.client_id),
  (select routes.collector_id from public.routes where routes.id = loans.route_id)
)
where loans.collector_id is null;

create or replace function public.inherit_loan_route_from_client()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  select
    coalesce(new.route_id, clients.route_id),
    coalesce(new.collector_id, clients.affiliate_id, routes.collector_id)
  into new.route_id, new.collector_id
  from public.clients
  left join public.routes on routes.id = coalesce(new.route_id, clients.route_id)
  where clients.id = new.client_id;

  if new.route_id is null then
    raise exception 'Informe a rota da venda';
  end if;

  if new.collector_id is null then
    raise exception 'Informe o afiliado responsavel pela venda';
  end if;

  return new;
end;
$$;

drop trigger if exists inherit_loan_route_from_client on public.loans;
create trigger inherit_loan_route_from_client
before insert or update of client_id, route_id, collector_id on public.loans
for each row execute function public.inherit_loan_route_from_client();
