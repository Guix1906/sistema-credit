alter table public.routes
  add column if not exists main_collection_day integer check (main_collection_day between 1 and 7),
  add column if not exists observations text;

update public.routes
set main_collection_day = collection_days[1]
where main_collection_day is null
  and cardinality(collection_days) > 0;

create or replace function public.inherit_loan_route_from_client()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.route_id is null then
    select route_id
    into new.route_id
    from public.clients
    where id = new.client_id;
  end if;

  return new;
end;
$$;

drop trigger if exists inherit_loan_route_from_client on public.loans;
create trigger inherit_loan_route_from_client
before insert or update of client_id, route_id on public.loans
for each row execute function public.inherit_loan_route_from_client();

update public.loans
set route_id = clients.route_id
from public.clients
where loans.client_id = clients.id
  and loans.route_id is null
  and clients.route_id is not null;
