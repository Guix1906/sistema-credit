create table if not exists public.receivables (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete restrict,
  description text not null,
  amount numeric(14, 2) not null check (amount > 0),
  paid_amount numeric(14, 2) not null default 0 check (paid_amount >= 0),
  due_date date not null,
  payment_method text not null default 'cash',
  status text not null default 'a_receber' check (status in ('a_receber', 'vence_hoje', 'pago', 'parcialmente_pago', 'em_atraso', 'cobranca_enviada', 'negociado', 'cancelado')),
  notes text,
  responsible_id uuid references public.profiles(id) on delete set null,
  last_billing_at timestamptz,
  next_action text,
  recurrence text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.billing_history (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  loan_id uuid references public.loans(id) on delete set null,
  installment_id uuid references public.installments(id) on delete set null,
  receivable_id uuid references public.receivables(id) on delete cascade,
  previous_status text check (previous_status is null or previous_status in ('a_receber', 'vence_hoje', 'pago', 'parcialmente_pago', 'em_atraso', 'cobranca_enviada', 'negociado', 'cancelado')),
  new_status text not null check (new_status in ('a_receber', 'vence_hoje', 'pago', 'parcialmente_pago', 'em_atraso', 'cobranca_enviada', 'negociado', 'cancelado')),
  note text,
  responsible_id uuid references public.profiles(id) on delete set null,
  channel text not null default 'other' check (channel in ('whatsapp', 'call', 'in_person', 'other')),
  created_at timestamptz not null default now()
);

alter table public.receivables add constraint receivables_id_owner_id_key unique (id, owner_id);
alter table public.billing_history add constraint billing_history_id_owner_id_key unique (id, owner_id);

drop trigger if exists set_receivables_updated_at on public.receivables;
create trigger set_receivables_updated_at before update on public.receivables for each row execute function public.set_updated_at();

create index if not exists receivables_owner_id_idx on public.receivables (owner_id);
create index if not exists receivables_client_id_idx on public.receivables (client_id);
create index if not exists receivables_due_date_idx on public.receivables (due_date);
create index if not exists receivables_status_idx on public.receivables (status);
create index if not exists receivables_responsible_id_idx on public.receivables (responsible_id);
create index if not exists billing_history_owner_id_idx on public.billing_history (owner_id);
create index if not exists billing_history_client_id_idx on public.billing_history (client_id);
create index if not exists billing_history_installment_id_idx on public.billing_history (installment_id);
create index if not exists billing_history_receivable_id_idx on public.billing_history (receivable_id);
create index if not exists billing_history_created_at_idx on public.billing_history (created_at);

alter table public.receivables enable row level security;
alter table public.billing_history enable row level security;

drop policy if exists "Team can read accessible receivables" on public.receivables;
create policy "Team can read accessible receivables"
on public.receivables for select to authenticated
using (
  exists (
    select 1 from public.clients
    where clients.id = receivables.client_id
      and (public.can_manage_all() or public.can_access_route(clients.route_id))
  )
);

drop policy if exists "Team can create accessible receivables" on public.receivables;
create policy "Team can create accessible receivables"
on public.receivables for insert to authenticated
with check (
  exists (
    select 1 from public.clients
    where clients.id = receivables.client_id
      and (public.can_manage_all() or public.can_access_route(clients.route_id))
  )
);

drop policy if exists "Team can update accessible receivables" on public.receivables;
create policy "Team can update accessible receivables"
on public.receivables for update to authenticated
using (
  exists (
    select 1 from public.clients
    where clients.id = receivables.client_id
      and (public.can_manage_all() or public.can_access_route(clients.route_id))
  )
)
with check (
  exists (
    select 1 from public.clients
    where clients.id = receivables.client_id
      and (public.can_manage_all() or public.can_access_route(clients.route_id))
  )
);

drop policy if exists "Managers can delete receivables" on public.receivables;
create policy "Managers can delete receivables"
on public.receivables for delete to authenticated
using (public.can_manage_all());

drop policy if exists "Team can read accessible billing history" on public.billing_history;
create policy "Team can read accessible billing history"
on public.billing_history for select to authenticated
using (
  exists (
    select 1 from public.clients
    where clients.id = billing_history.client_id
      and (public.can_manage_all() or public.can_access_route(clients.route_id))
  )
);

drop policy if exists "Team can create accessible billing history" on public.billing_history;
create policy "Team can create accessible billing history"
on public.billing_history for insert to authenticated
with check (
  exists (
    select 1 from public.clients
    where clients.id = billing_history.client_id
      and (public.can_manage_all() or public.can_access_route(clients.route_id))
  )
);
