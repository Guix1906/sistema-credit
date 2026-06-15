create or replace function public.list_active_collectors()
returns table (
  id uuid,
  full_name text,
  email text,
  role text,
  phone text,
  cpf text,
  route_id uuid,
  commission_rate numeric,
  permissions jsonb,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    profiles.id,
    profiles.full_name,
    profiles.email,
    profiles.role,
    profiles.phone,
    profiles.cpf,
    profiles.route_id,
    profiles.commission_rate,
    profiles.permissions,
    profiles.is_active,
    profiles.created_at,
    profiles.updated_at
  from public.profiles
  where profiles.role in ('admin', 'gerente', 'manager', 'afiliado', 'cobrador', 'collector')
    and profiles.is_active
  order by profiles.full_name;
$$;

create or replace function public.list_registered_affiliates()
returns table (
  id uuid,
  full_name text,
  email text,
  role text,
  phone text,
  cpf text,
  route_id uuid,
  commission_rate numeric,
  permissions jsonb,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    profiles.id,
    profiles.full_name,
    profiles.email,
    profiles.role,
    profiles.phone,
    profiles.cpf,
    profiles.route_id,
    profiles.commission_rate,
    profiles.permissions,
    profiles.is_active,
    profiles.created_at,
    profiles.updated_at
  from public.profiles
  where profiles.role in ('admin', 'gerente', 'manager', 'afiliado', 'cobrador', 'collector')
  order by profiles.full_name;
$$;

drop policy if exists "Team can read active collector profile options" on public.profiles;
create policy "Team can read active collector profile options"
on public.profiles for select
to authenticated
using (
  role in ('admin', 'gerente', 'manager', 'afiliado', 'cobrador', 'collector')
  and is_active
);
