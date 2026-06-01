create or replace function public.bootstrap_first_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.profiles
    where role = 'admin'
  ) then
    new.role := 'admin';
  end if;

  return new;
end;
$$;

drop trigger if exists bootstrap_first_admin on public.profiles;
create trigger bootstrap_first_admin
before insert on public.profiles
for each row execute function public.bootstrap_first_admin();

update public.profiles
set role = 'admin'
where id = (
  select id
  from public.profiles
  where not exists (
    select 1
    from public.profiles
    where role = 'admin'
  )
  order by created_at
  limit 1
);
