-- A public bucket already serves objects at /storage/v1/object/public/... without
-- consulting RLS. The broad SELECT policy added nothing for that, but it did let
-- any client enumerate every file in the bucket. Drop it.
--
-- Verified after applying: public object URLs still return 200, while an
-- anonymous list call returns zero rows.
drop policy if exists "task attachments public read" on storage.objects;
