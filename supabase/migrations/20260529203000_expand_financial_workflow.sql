alter table public.profiles
  add column if not exists phone text,
  add column if not exists cpf text,
  add column if not exists route_id uuid references public.routes(id) on delete set null,
  add column if not exists commission_rate numeric(8, 4) not null default 0 check (commission_rate >= 0),
  add column if not exists permissions jsonb not null default '{}'::jsonb;

alter table public.routes
  add column if not exists city text,
  add column if not exists neighborhood text,
  add column if not exists goal_amount numeric(14, 2) not null default 0 check (goal_amount >= 0);

alter table public.clients
  add column if not exists rg text,
  add column if not exists whatsapp text,
  add column if not exists neighborhood text,
  add column if not exists reference_point text,
  add column if not exists photo_path text,
  add column if not exists status text not null default 'active' check (status in ('active', 'paid_off', 'overdue', 'inactive'));

alter table public.loans
  add column if not exists route_id uuid references public.routes(id) on delete set null,
  add column if not exists collector_id uuid references public.profiles(id) on delete set null,
  add column if not exists final_due_date date,
  add column if not exists payment_frequency text not null default 'daily' check (payment_frequency in ('daily', 'weekly', 'biweekly', 'monthly')),
  add column if not exists term_days integer not null default 20 check (term_days in (20, 24, 30)),
  add column if not exists interest_rate numeric(8, 4) not null default 20 check (interest_rate >= 0),
  add column if not exists paid_amount numeric(14, 2) not null default 0 check (paid_amount >= 0),
  add column if not exists remaining_amount numeric(14, 2) not null default 0 check (remaining_amount >= 0);

update public.loans
set
  final_due_date = coalesce(final_due_date, first_due_date),
  remaining_amount = case when remaining_amount = 0 then greatest(total_amount - paid_amount, 0) else remaining_amount end;

alter table public.loans
  alter column final_due_date set not null;

alter table public.cashboxes
  add column if not exists kind text not null default 'major' check (kind in ('major', 'minor', 'route')),
  add column if not exists route_id uuid references public.routes(id) on delete set null,
  add column if not exists allow_negative boolean not null default false;

alter table public.cash_movements
  add column if not exists reversed_movement_id uuid references public.cash_movements(id) on delete set null;

alter table public.expenses
  add column if not exists route_id uuid references public.routes(id) on delete set null,
  add column if not exists receipt_path text;

alter table public.payments
  add column if not exists late_fee_amount numeric(14, 2) not null default 0 check (late_fee_amount >= 0),
  add column if not exists receipt_path text;

create index if not exists profiles_route_id_idx on public.profiles (route_id);
create index if not exists profiles_role_idx on public.profiles (role);
create index if not exists routes_city_idx on public.routes (city);
create index if not exists clients_status_idx on public.clients (status);
create index if not exists clients_whatsapp_idx on public.clients (whatsapp);
create index if not exists loans_route_id_idx on public.loans (route_id);
create index if not exists loans_collector_id_idx on public.loans (collector_id);
create index if not exists loans_final_due_date_idx on public.loans (final_due_date);
create index if not exists cashboxes_kind_idx on public.cashboxes (kind);
create index if not exists cashboxes_route_id_idx on public.cashboxes (route_id);
create index if not exists expenses_route_id_idx on public.expenses (route_id);
