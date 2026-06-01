drop policy if exists "Users can delete own client documents" on storage.objects;
create policy "Users can delete own client documents"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'client-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can delete own receipts" on storage.objects;
create policy "Users can delete own receipts"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'receipts'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can delete own brand assets" on storage.objects;
create policy "Users can delete own brand assets"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'brand-assets'
  and (storage.foldername(name))[1] = auth.uid()::text
);
