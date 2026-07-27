-- Public-read bucket for task attachments; writes are restricted to the
-- owner's own `<uid>/...` prefix.
insert into storage.buckets (id, name, public, file_size_limit)
values ('task-attachments', 'task-attachments', true, 10485760)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit;

drop policy if exists "task attachments public read"   on storage.objects;
drop policy if exists "task attachments insert own"    on storage.objects;
drop policy if exists "task attachments delete own"    on storage.objects;

create policy "task attachments public read" on storage.objects
  for select using (bucket_id = 'task-attachments');

create policy "task attachments insert own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'task-attachments'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "task attachments delete own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'task-attachments'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
