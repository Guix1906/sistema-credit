-- Repair configuration removed by the first remote go-live cleanup attempt.
-- Authentication users are preserved by design.
insert into public.profiles (id, full_name, email, role, is_active)
select
  users.id,
  coalesce(nullif(users.raw_user_meta_data ->> 'full_name', ''), users.email, 'Usuario'),
  coalesce(users.email, ''),
  case
    when users.raw_user_meta_data ->> 'role' in ('admin', 'gerente', 'afiliado', 'cobrador', 'atendente')
      then users.raw_user_meta_data ->> 'role'
    else 'atendente'
  end,
  true
from auth.users as users
where not exists (
  select 1
  from public.profiles
  where profiles.id = users.id
);

insert into public.app_settings (owner_id)
select id
from public.profiles
where role = 'admin'
on conflict (owner_id) do nothing;

insert into public.access_settings (owner_id)
select id
from public.profiles
where role = 'admin'
on conflict (owner_id) do nothing;

insert into public.loan_settings (
  owner_id,
  name,
  interest_rate,
  late_fee_rate,
  default_installments,
  default_frequency,
  is_active
)
select
  id,
  'Padrao',
  20,
  20,
  20,
  'daily',
  true
from public.profiles
where role = 'admin'
  and not exists (
    select 1
    from public.loan_settings
    where loan_settings.owner_id = profiles.id
  );
