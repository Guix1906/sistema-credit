create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  role text not null default 'atendente' check (role in ('admin', 'gerente', 'afiliado', 'cobrador', 'atendente')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.routes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  description text,
  collector_id uuid references public.profiles(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  route_id uuid references public.routes(id) on delete set null,
  name text not null,
  document_number text,
  phone text,
  email text,
  address text,
  city text,
  state text,
  postal_code text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.loan_settings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  interest_rate numeric(8, 4) not null default 0 check (interest_rate >= 0),
  late_fee_rate numeric(8, 4) not null default 0 check (late_fee_rate >= 0),
  default_installments integer not null default 1 check (default_installments > 0),
  default_frequency text not null default 'monthly' check (default_frequency in ('daily', 'weekly', 'biweekly', 'monthly')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.loans (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete restrict,
  loan_setting_id uuid references public.loan_settings(id) on delete set null,
  principal_amount numeric(14, 2) not null check (principal_amount > 0),
  interest_amount numeric(14, 2) not null default 0 check (interest_amount >= 0),
  total_amount numeric(14, 2) not null check (total_amount > 0),
  issued_at date not null default current_date,
  first_due_date date not null,
  status text not null default 'active' check (status in ('draft', 'active', 'paid', 'overdue', 'cancelled', 'defaulted')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.installments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  loan_id uuid not null references public.loans(id) on delete cascade,
  installment_number integer not null check (installment_number > 0),
  due_date date not null,
  amount numeric(14, 2) not null check (amount > 0),
  paid_amount numeric(14, 2) not null default 0 check (paid_amount >= 0),
  status text not null default 'pending' check (status in ('pending', 'partial', 'paid', 'overdue', 'cancelled')),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (loan_id, installment_number)
);

create table public.cashboxes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  opening_balance numeric(14, 2) not null default 0,
  current_balance numeric(14, 2) not null default 0,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete restrict,
  loan_id uuid not null references public.loans(id) on delete restrict,
  installment_id uuid references public.installments(id) on delete set null,
  cashbox_id uuid references public.cashboxes(id) on delete set null,
  amount numeric(14, 2) not null check (amount > 0),
  paid_at timestamptz not null default now(),
  payment_method text not null default 'cash' check (payment_method in ('cash', 'pix', 'debit_card', 'credit_card', 'bank_transfer', 'other')),
  reference text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.cash_movements (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  cashbox_id uuid not null references public.cashboxes(id) on delete cascade,
  payment_id uuid references public.payments(id) on delete set null,
  type text not null check (type in ('inflow', 'outflow', 'adjustment')),
  amount numeric(14, 2) not null check (amount > 0),
  description text not null,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  cashbox_id uuid references public.cashboxes(id) on delete set null,
  category text not null,
  amount numeric(14, 2) not null check (amount > 0),
  expense_date date not null default current_date,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.collection_logs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  loan_id uuid references public.loans(id) on delete set null,
  installment_id uuid references public.installments(id) on delete set null,
  collector_id uuid references public.profiles(id) on delete set null,
  contact_type text not null check (contact_type in ('call', 'message', 'visit', 'email', 'other')),
  result text not null,
  notes text,
  contacted_at timestamptz not null default now(),
  next_contact_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid references public.clients(id) on delete cascade,
  loan_id uuid references public.loans(id) on delete cascade,
  installment_id uuid references public.installments(id) on delete cascade,
  title text not null,
  message text not null,
  severity text not null default 'info' check (severity in ('info', 'warning', 'critical')),
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  due_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  table_name text not null,
  record_id uuid,
  action text not null check (action in ('insert', 'update', 'delete', 'login', 'logout')),
  old_data jsonb,
  new_data jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create table public.client_documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  document_type text not null,
  file_name text not null,
  file_path text not null,
  mime_type text,
  file_size bigint check (file_size is null or file_size >= 0),
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.routes add constraint routes_id_owner_id_key unique (id, owner_id);
alter table public.clients add constraint clients_id_owner_id_key unique (id, owner_id);
alter table public.loan_settings add constraint loan_settings_id_owner_id_key unique (id, owner_id);
alter table public.loans add constraint loans_id_owner_id_key unique (id, owner_id);
alter table public.installments add constraint installments_id_owner_id_key unique (id, owner_id);
alter table public.payments add constraint payments_id_owner_id_key unique (id, owner_id);
alter table public.cashboxes add constraint cashboxes_id_owner_id_key unique (id, owner_id);
alter table public.cash_movements add constraint cash_movements_id_owner_id_key unique (id, owner_id);
alter table public.expenses add constraint expenses_id_owner_id_key unique (id, owner_id);
alter table public.collection_logs add constraint collection_logs_id_owner_id_key unique (id, owner_id);
alter table public.alerts add constraint alerts_id_owner_id_key unique (id, owner_id);
alter table public.client_documents add constraint client_documents_id_owner_id_key unique (id, owner_id);

alter table public.clients
  add constraint clients_route_owner_fk foreign key (route_id, owner_id) references public.routes(id, owner_id) on delete set null (route_id);

alter table public.loans
  add constraint loans_client_owner_fk foreign key (client_id, owner_id) references public.clients(id, owner_id) on delete restrict,
  add constraint loans_setting_owner_fk foreign key (loan_setting_id, owner_id) references public.loan_settings(id, owner_id) on delete set null (loan_setting_id);

alter table public.installments
  add constraint installments_loan_owner_fk foreign key (loan_id, owner_id) references public.loans(id, owner_id) on delete cascade;

alter table public.payments
  add constraint payments_client_owner_fk foreign key (client_id, owner_id) references public.clients(id, owner_id) on delete restrict,
  add constraint payments_loan_owner_fk foreign key (loan_id, owner_id) references public.loans(id, owner_id) on delete restrict,
  add constraint payments_installment_owner_fk foreign key (installment_id, owner_id) references public.installments(id, owner_id) on delete set null (installment_id),
  add constraint payments_cashbox_owner_fk foreign key (cashbox_id, owner_id) references public.cashboxes(id, owner_id) on delete set null (cashbox_id);

alter table public.cash_movements
  add constraint cash_movements_cashbox_owner_fk foreign key (cashbox_id, owner_id) references public.cashboxes(id, owner_id) on delete cascade,
  add constraint cash_movements_payment_owner_fk foreign key (payment_id, owner_id) references public.payments(id, owner_id) on delete set null (payment_id);

alter table public.expenses
  add constraint expenses_cashbox_owner_fk foreign key (cashbox_id, owner_id) references public.cashboxes(id, owner_id) on delete set null (cashbox_id);

alter table public.collection_logs
  add constraint collection_logs_client_owner_fk foreign key (client_id, owner_id) references public.clients(id, owner_id) on delete cascade,
  add constraint collection_logs_loan_owner_fk foreign key (loan_id, owner_id) references public.loans(id, owner_id) on delete set null (loan_id),
  add constraint collection_logs_installment_owner_fk foreign key (installment_id, owner_id) references public.installments(id, owner_id) on delete set null (installment_id);

alter table public.alerts
  add constraint alerts_client_owner_fk foreign key (client_id, owner_id) references public.clients(id, owner_id) on delete cascade,
  add constraint alerts_loan_owner_fk foreign key (loan_id, owner_id) references public.loans(id, owner_id) on delete cascade,
  add constraint alerts_installment_owner_fk foreign key (installment_id, owner_id) references public.installments(id, owner_id) on delete cascade;

alter table public.client_documents
  add constraint client_documents_client_owner_fk foreign key (client_id, owner_id) references public.clients(id, owner_id) on delete cascade;

create trigger set_profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger set_routes_updated_at before update on public.routes for each row execute function public.set_updated_at();
create trigger set_clients_updated_at before update on public.clients for each row execute function public.set_updated_at();
create trigger set_loan_settings_updated_at before update on public.loan_settings for each row execute function public.set_updated_at();
create trigger set_loans_updated_at before update on public.loans for each row execute function public.set_updated_at();
create trigger set_installments_updated_at before update on public.installments for each row execute function public.set_updated_at();
create trigger set_payments_updated_at before update on public.payments for each row execute function public.set_updated_at();
create trigger set_cashboxes_updated_at before update on public.cashboxes for each row execute function public.set_updated_at();
create trigger set_cash_movements_updated_at before update on public.cash_movements for each row execute function public.set_updated_at();
create trigger set_expenses_updated_at before update on public.expenses for each row execute function public.set_updated_at();
create trigger set_collection_logs_updated_at before update on public.collection_logs for each row execute function public.set_updated_at();
create trigger set_alerts_updated_at before update on public.alerts for each row execute function public.set_updated_at();
create trigger set_client_documents_updated_at before update on public.client_documents for each row execute function public.set_updated_at();

create index profiles_email_idx on public.profiles (email);
create index routes_owner_id_idx on public.routes (owner_id);
create index routes_collector_id_idx on public.routes (collector_id);
create index clients_owner_id_idx on public.clients (owner_id);
create index clients_route_id_idx on public.clients (route_id);
create index clients_document_number_idx on public.clients (document_number);
create index clients_name_idx on public.clients (name);
create index loan_settings_owner_id_idx on public.loan_settings (owner_id);
create index loans_owner_id_idx on public.loans (owner_id);
create index loans_client_id_idx on public.loans (client_id);
create index loans_status_idx on public.loans (status);
create index loans_issued_at_idx on public.loans (issued_at);
create index installments_owner_id_idx on public.installments (owner_id);
create index installments_loan_id_idx on public.installments (loan_id);
create index installments_due_date_idx on public.installments (due_date);
create index installments_status_idx on public.installments (status);
create index payments_owner_id_idx on public.payments (owner_id);
create index payments_client_id_idx on public.payments (client_id);
create index payments_loan_id_idx on public.payments (loan_id);
create index payments_installment_id_idx on public.payments (installment_id);
create index payments_paid_at_idx on public.payments (paid_at);
create index cashboxes_owner_id_idx on public.cashboxes (owner_id);
create index cashboxes_status_idx on public.cashboxes (status);
create index cash_movements_owner_id_idx on public.cash_movements (owner_id);
create index cash_movements_cashbox_id_idx on public.cash_movements (cashbox_id);
create index cash_movements_occurred_at_idx on public.cash_movements (occurred_at);
create index expenses_owner_id_idx on public.expenses (owner_id);
create index expenses_cashbox_id_idx on public.expenses (cashbox_id);
create index expenses_expense_date_idx on public.expenses (expense_date);
create index collection_logs_owner_id_idx on public.collection_logs (owner_id);
create index collection_logs_client_id_idx on public.collection_logs (client_id);
create index collection_logs_next_contact_at_idx on public.collection_logs (next_contact_at);
create index alerts_owner_id_idx on public.alerts (owner_id);
create index alerts_status_idx on public.alerts (status);
create index alerts_due_at_idx on public.alerts (due_at);
create index audit_logs_owner_id_idx on public.audit_logs (owner_id);
create index audit_logs_actor_id_idx on public.audit_logs (actor_id);
create index audit_logs_table_record_idx on public.audit_logs (table_name, record_id);
create index audit_logs_created_at_idx on public.audit_logs (created_at);
create index client_documents_owner_id_idx on public.client_documents (owner_id);
create index client_documents_client_id_idx on public.client_documents (client_id);

alter table public.profiles enable row level security;
alter table public.routes enable row level security;
alter table public.clients enable row level security;
alter table public.loan_settings enable row level security;
alter table public.loans enable row level security;
alter table public.installments enable row level security;
alter table public.payments enable row level security;
alter table public.cashboxes enable row level security;
alter table public.cash_movements enable row level security;
alter table public.expenses enable row level security;
alter table public.collection_logs enable row level security;
alter table public.alerts enable row level security;
alter table public.audit_logs enable row level security;
alter table public.client_documents enable row level security;

create policy "Users can read own profile"
on public.profiles for select
to authenticated
using (id = auth.uid());

create policy "Users can create own profile"
on public.profiles for insert
to authenticated
with check (id = auth.uid());

create policy "Users can update own profile"
on public.profiles for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy "Users can delete own profile"
on public.profiles for delete
to authenticated
using (id = auth.uid());

create policy "Users can read own routes"
on public.routes for select
to authenticated
using (owner_id = auth.uid());

create policy "Users can create own routes"
on public.routes for insert
to authenticated
with check (owner_id = auth.uid());

create policy "Users can update own routes"
on public.routes for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy "Users can delete own routes"
on public.routes for delete
to authenticated
using (owner_id = auth.uid());

create policy "Users can read own clients"
on public.clients for select
to authenticated
using (owner_id = auth.uid());

create policy "Users can create own clients"
on public.clients for insert
to authenticated
with check (owner_id = auth.uid());

create policy "Users can update own clients"
on public.clients for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy "Users can delete own clients"
on public.clients for delete
to authenticated
using (owner_id = auth.uid());

create policy "Users can read own loan settings"
on public.loan_settings for select
to authenticated
using (owner_id = auth.uid());

create policy "Users can create own loan settings"
on public.loan_settings for insert
to authenticated
with check (owner_id = auth.uid());

create policy "Users can update own loan settings"
on public.loan_settings for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy "Users can delete own loan settings"
on public.loan_settings for delete
to authenticated
using (owner_id = auth.uid());

create policy "Users can read own loans"
on public.loans for select
to authenticated
using (owner_id = auth.uid());

create policy "Users can create own loans"
on public.loans for insert
to authenticated
with check (owner_id = auth.uid());

create policy "Users can update own loans"
on public.loans for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy "Users can delete own loans"
on public.loans for delete
to authenticated
using (owner_id = auth.uid());

create policy "Users can read own installments"
on public.installments for select
to authenticated
using (owner_id = auth.uid());

create policy "Users can create own installments"
on public.installments for insert
to authenticated
with check (owner_id = auth.uid());

create policy "Users can update own installments"
on public.installments for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy "Users can delete own installments"
on public.installments for delete
to authenticated
using (owner_id = auth.uid());

create policy "Users can read own payments"
on public.payments for select
to authenticated
using (owner_id = auth.uid());

create policy "Users can create own payments"
on public.payments for insert
to authenticated
with check (owner_id = auth.uid());

create policy "Users can update own payments"
on public.payments for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy "Users can delete own payments"
on public.payments for delete
to authenticated
using (owner_id = auth.uid());

create policy "Users can read own cashboxes"
on public.cashboxes for select
to authenticated
using (owner_id = auth.uid());

create policy "Users can create own cashboxes"
on public.cashboxes for insert
to authenticated
with check (owner_id = auth.uid());

create policy "Users can update own cashboxes"
on public.cashboxes for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy "Users can delete own cashboxes"
on public.cashboxes for delete
to authenticated
using (owner_id = auth.uid());

create policy "Users can read own cash movements"
on public.cash_movements for select
to authenticated
using (owner_id = auth.uid());

create policy "Users can create own cash movements"
on public.cash_movements for insert
to authenticated
with check (owner_id = auth.uid());

create policy "Users can update own cash movements"
on public.cash_movements for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy "Users can delete own cash movements"
on public.cash_movements for delete
to authenticated
using (owner_id = auth.uid());

create policy "Users can read own expenses"
on public.expenses for select
to authenticated
using (owner_id = auth.uid());

create policy "Users can create own expenses"
on public.expenses for insert
to authenticated
with check (owner_id = auth.uid());

create policy "Users can update own expenses"
on public.expenses for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy "Users can delete own expenses"
on public.expenses for delete
to authenticated
using (owner_id = auth.uid());

create policy "Users can read own collection logs"
on public.collection_logs for select
to authenticated
using (owner_id = auth.uid());

create policy "Users can create own collection logs"
on public.collection_logs for insert
to authenticated
with check (owner_id = auth.uid());

create policy "Users can update own collection logs"
on public.collection_logs for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy "Users can delete own collection logs"
on public.collection_logs for delete
to authenticated
using (owner_id = auth.uid());

create policy "Users can read own alerts"
on public.alerts for select
to authenticated
using (owner_id = auth.uid());

create policy "Users can create own alerts"
on public.alerts for insert
to authenticated
with check (owner_id = auth.uid());

create policy "Users can update own alerts"
on public.alerts for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy "Users can delete own alerts"
on public.alerts for delete
to authenticated
using (owner_id = auth.uid());

create policy "Users can read own audit logs"
on public.audit_logs for select
to authenticated
using (owner_id = auth.uid());

create policy "Users can create own audit logs"
on public.audit_logs for insert
to authenticated
with check (owner_id = auth.uid());

create policy "Users can read own client documents"
on public.client_documents for select
to authenticated
using (owner_id = auth.uid());

create policy "Users can create own client documents"
on public.client_documents for insert
to authenticated
with check (owner_id = auth.uid());

create policy "Users can update own client documents"
on public.client_documents for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy "Users can delete own client documents"
on public.client_documents for delete
to authenticated
using (owner_id = auth.uid());
