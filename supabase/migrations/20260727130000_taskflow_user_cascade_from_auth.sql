-- Deleting an account in Supabase Auth previously left an orphaned
-- taskflow."User" row behind, which then blocked the email from being reused.
alter table taskflow."User"
  add constraint "User_id_auth_users_fkey"
  foreign key (id) references auth.users(id) on delete cascade;
