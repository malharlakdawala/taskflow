create or replace function taskflow.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new."updatedAt" = now();
  return new;
end;
$$;
