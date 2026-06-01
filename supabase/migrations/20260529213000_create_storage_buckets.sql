insert into storage.buckets (id, name, public)
values
  ('client-documents', 'client-documents', false),
  ('receipts', 'receipts', false),
  ('brand-assets', 'brand-assets', true)
on conflict (id) do nothing;

drop policy if exists "Users can read own client documents" on storage.objects;
create policy "Users can read own client documents"
on storage.objects for select
to authenticated
using (
  bucket_id = 'client-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can upload own client documents" on storage.objects;
create policy "Users can upload own client documents"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'client-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can update own client documents" on storage.objects;
create policy "Users can update own client documents"
on storage.objects for update
to authenticated
using (
  bucket_id = 'client-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'client-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can read own receipts" on storage.objects;
create policy "Users can read own receipts"
on storage.objects for select
to authenticated
using (
  bucket_id = 'receipts'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can upload own receipts" on storage.objects;
create policy "Users can upload own receipts"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'receipts'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can update own receipts" on storage.objects;
create policy "Users can update own receipts"
on storage.objects for update
to authenticated
using (
  bucket_id = 'receipts'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'receipts'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can read brand assets" on storage.objects;
create policy "Users can read brand assets"
on storage.objects for select
to authenticated
using (bucket_id = 'brand-assets');

drop policy if exists "Users can upload own brand assets" on storage.objects;
create policy "Users can upload own brand assets"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'brand-assets'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can update own brand assets" on storage.objects;
create policy "Users can update own brand assets"
on storage.objects for update
to authenticated
using (
  bucket_id = 'brand-assets'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'brand-assets'
  and (storage.foldername(name))[1] = auth.uid()::text
);
