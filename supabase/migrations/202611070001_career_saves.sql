-- Apply in the Supabase SQL editor or with Supabase CLI before enabling sync.
create table if not exists public.career_saves (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null default 1 check (revision > 0),
  generation text not null,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists career_saves_updated_at_idx on public.career_saves (updated_at desc);
alter table public.career_saves enable row level security;
revoke all on public.career_saves from anon, authenticated;
grant select, insert, update on public.career_saves to authenticated;

create policy "Read own career" on public.career_saves for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Create own career" on public.career_saves for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Update own career" on public.career_saves for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create or replace function public.career_save_cas(expected_revision bigint, new_generation text, new_payload jsonb)
returns table (revision bigint, generation text, updated_at timestamptz)
language plpgsql security invoker set search_path = public, pg_temp as $$
declare owner_id uuid := auth.uid();
begin
  if owner_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if expected_revision < 0 or new_generation is null or length(new_generation) > 100 or new_payload is null then
    raise exception 'Invalid career write' using errcode = '22023';
  end if;
  return query
    insert into public.career_saves as saved (user_id, revision, generation, payload)
    values (owner_id, 1, new_generation, new_payload)
    on conflict (user_id) do update
      set revision = saved.revision + 1,
          generation = excluded.generation,
          payload = excluded.payload,
          updated_at = now()
      where saved.revision = expected_revision
    returning saved.revision, saved.generation, saved.updated_at;
  if not found then raise exception 'Career revision conflict' using errcode = 'P0001'; end if;
end;
$$;

revoke all on function public.career_save_cas(bigint, text, jsonb) from public, anon;
grant execute on function public.career_save_cas(bigint, text, jsonb) to authenticated;
