-- Cockroach Action - database schema
--
-- Run this once in the Supabase SQL editor (Dashboard > SQL Editor > New query).
-- It is idempotent enough to re-run during setup, but it does not migrate data.
--
-- Design notes that matter:
--
--  * demands.vote_count is a MATERIALIZED counter kept by trigger, not a
--    SUM() over votes. Reads must stay O(1) because the public demand list
--    is the hottest query in the app. Never replace it with an aggregate view.
--  * voters.verification exists from day one so phone-OTP can be switched on
--    later without a migration. Anonymous votes already carry weight 1; a
--    verified tier can be weighted differently by changing one function.
--  * Anonymous users are real auth users (auth.uid() is stable), so upgrading
--    an anonymous voter to a phone identity preserves every vote they cast.

-- No extensions required. gen_random_uuid() is core Postgres since 13, and
-- nothing here depends on pgcrypto - see the note on make_slug() below for
-- why depending on it would be a trap under Supabase's schema layout.

-- ---------------------------------------------------------------- types

do $$ begin
  create type demand_status as enum ('proposed', 'accepted', 'rejected', 'archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type verification_level as enum ('anonymous', 'phone', 'email');
exception when duplicate_object then null; end $$;

do $$ begin
  create type mod_role as enum ('moderator', 'admin');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------- tables

-- A chapter is one local organizing group. Everything is scoped to one so a
-- second city can be added without touching the schema.
create table if not exists chapters (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  name        text not null,
  region      text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- One row per auth user, including anonymous ones.
create table if not exists voters (
  id            uuid primary key references auth.users(id) on delete cascade,
  chapter_id    uuid references chapters(id) on delete set null,
  verification  verification_level not null default 'anonymous',
  verified_at   timestamptz,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);

create table if not exists demands (
  id            uuid primary key default gen_random_uuid(),
  chapter_id    uuid not null references chapters(id) on delete cascade,
  slug          text not null,
  title         text not null check (char_length(trim(title)) between 8 and 120),
  body          text not null check (char_length(trim(body)) between 20 and 1000),
  status        demand_status not null default 'proposed',
  author_id     uuid references voters(id) on delete set null,

  -- Votes collected on paper at a protest site, folded in by an organizer.
  -- Kept separate from live votes so the online number is never overwritten.
  offline_votes integer not null default 0 check (offline_votes >= 0),

  -- Maintained by trigger. Do not write directly.
  vote_count    integer not null default 0,

  decided_by    uuid references voters(id) on delete set null,
  decided_at    timestamptz,
  decision_note text,
  created_at    timestamptz not null default now(),
  unique (chapter_id, slug)
);

create index if not exists demands_public_idx
  on demands (chapter_id, status, vote_count desc);
create index if not exists demands_queue_idx
  on demands (status, created_at desc) where status = 'proposed';

-- One vote per voter per demand, enforced structurally by the primary key.
-- This is stronger than any rate limit: double voting is not expressible.
create table if not exists votes (
  demand_id  uuid not null references demands(id) on delete cascade,
  voter_id   uuid not null references voters(id) on delete cascade,
  weight     smallint not null default 1 check (weight between 1 and 5),
  created_at timestamptz not null default now(),
  primary key (demand_id, voter_id)
);

create index if not exists votes_voter_idx on votes (voter_id, created_at desc);

create table if not exists moderators (
  id         uuid primary key references auth.users(id) on delete cascade,
  chapter_id uuid references chapters(id) on delete cascade,
  role       mod_role not null default 'moderator',
  added_at   timestamptz not null default now()
);

-- Append-only. Every moderation decision lands here and is also mirrored
-- into git by the snapshot workflow, so the audit trail is tamper-evident.
create table if not exists audit_log (
  id         bigserial primary key,
  actor_id   uuid,
  action     text not null,
  demand_id  uuid,
  detail     jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_log_recent_idx on audit_log (created_at desc);

-- ---------------------------------------------------------------- helpers

create or replace function is_moderator()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from moderators m where m.id = auth.uid());
$$;

create or replace function is_anonymous_user()
returns boolean language sql stable as $$
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);
$$;

-- Slug that stays readable and collision-resistant without a lookup loop.
--
-- Deliberately avoids pgcrypto's gen_random_bytes(): Supabase installs
-- extensions into the `extensions` schema, and the callers below run with
-- `set search_path = public`, so an unqualified pgcrypto call resolves at
-- CREATE time but fails at CALL time. md5(random()) needs no extension.
--
-- VOLATILE, not IMMUTABLE - it is random, and marking it immutable would
-- invite the planner to fold repeated calls into a single value.
create or replace function make_slug(raw text)
returns text language sql volatile as $$
  select left(
    regexp_replace(lower(trim(raw)), '[^a-z0-9]+', '-', 'g'),
    48
  ) || '-' || substr(md5(random()::text || clock_timestamp()::text), 1, 6);
$$;

-- ------------------------------------------------- materialized vote counter

create or replace function sync_vote_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update demands set vote_count = vote_count + new.weight where id = new.demand_id;
  elsif tg_op = 'DELETE' then
    update demands set vote_count = greatest(0, vote_count - old.weight) where id = old.demand_id;
  elsif tg_op = 'UPDATE' and new.weight <> old.weight then
    update demands set vote_count = greatest(0, vote_count - old.weight + new.weight)
      where id = new.demand_id;
  end if;
  return null;
end $$;

drop trigger if exists votes_sync_count on votes;
create trigger votes_sync_count
  after insert or update or delete on votes
  for each row execute function sync_vote_count();

-- ---------------------------------------------------------------- RLS

alter table chapters   enable row level security;
alter table voters     enable row level security;
alter table demands    enable row level security;
alter table votes      enable row level security;
alter table moderators enable row level security;
alter table audit_log  enable row level security;

drop policy if exists chapters_read on chapters;
create policy chapters_read on chapters for select using (is_active);

-- A voter row is private to its owner; moderators can see them for abuse review.
drop policy if exists voters_self_read on voters;
create policy voters_self_read on voters for select
  using (id = auth.uid() or is_moderator());

drop policy if exists voters_self_insert on voters;
create policy voters_self_insert on voters for insert
  with check (id = auth.uid());

drop policy if exists voters_self_update on voters;
create policy voters_self_update on voters for update
  using (id = auth.uid()) with check (id = auth.uid());

-- The public sees accepted demands. Moderators additionally see the queue.
-- Authors can always see their own proposal so it does not vanish on submit.
drop policy if exists demands_public_read on demands;
create policy demands_public_read on demands for select
  using (
    status = 'accepted'
    or is_moderator()
    or author_id = auth.uid()
  );

-- Proposals only ever arrive through propose_demand(); direct inserts are
-- refused so the rate limit and the status default cannot be bypassed.
drop policy if exists demands_no_direct_insert on demands;
create policy demands_no_direct_insert on demands for insert with check (false);

drop policy if exists demands_moderator_update on demands;
create policy demands_moderator_update on demands for update
  using (is_moderator()) with check (is_moderator());

-- A voter reads and writes only their own ballot. Aggregate counts are read
-- from demands.vote_count, which is why this can stay this tight.
drop policy if exists votes_self_read on votes;
create policy votes_self_read on votes for select using (voter_id = auth.uid());

drop policy if exists votes_self_write on votes;
create policy votes_self_write on votes for insert
  with check (
    voter_id = auth.uid()
    and exists (select 1 from demands d where d.id = demand_id and d.status = 'accepted')
  );

drop policy if exists votes_self_delete on votes;
create policy votes_self_delete on votes for delete using (voter_id = auth.uid());

drop policy if exists moderators_read on moderators;
create policy moderators_read on moderators for select
  using (id = auth.uid() or is_moderator());

drop policy if exists audit_read on audit_log;
create policy audit_read on audit_log for select using (is_moderator());

-- ---------------------------------------------------------------- RPC

-- Ensures a voters row exists for the caller. Called once per session.
create or replace function ensure_voter(p_chapter text default 'default')
returns voters language plpgsql security definer set search_path = public as $$
declare
  v_chapter uuid;
  v_row voters;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select id into v_chapter from chapters where slug = p_chapter and is_active;

  insert into voters (id, chapter_id)
  values (auth.uid(), v_chapter)
  on conflict (id) do update set last_seen_at = now()
  returning * into v_row;

  return v_row;
end $$;

-- Set this voter's position on a demand.
--
-- p_voted is the DESIRED end state, not an instruction to flip. That makes the
-- call idempotent, which matters because the offline outbox replays intents
-- that may already have been applied - a toggle would undo them. Pass null to
-- toggle explicitly (what a tap on the arrow does when already in sync).
create or replace function cast_vote(p_demand uuid, p_voted boolean default null)
returns table (demand_id uuid, vote_count integer, voted boolean)
language plpgsql security definer set search_path = public as $$
declare
  v_exists boolean;
  v_target boolean;
  v_recent integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  perform ensure_voter();

  -- Cheap throttle on vote churn. The primary key already prevents double
  -- voting; this only stops someone hammering toggle to burn write capacity.
  select count(*) into v_recent
    from votes v
   where v.voter_id = auth.uid()
     and v.created_at > now() - interval '10 seconds';

  if v_recent >= 8 then
    raise exception 'slow down' using errcode = 'P0001';
  end if;

  select exists (select 1 from votes v where v.demand_id = p_demand and v.voter_id = auth.uid())
    into v_exists;

  v_target := coalesce(p_voted, not v_exists);

  if v_target and not v_exists then
    insert into votes (demand_id, voter_id, weight)
    values (p_demand, auth.uid(), 1)
    on conflict do nothing;
  elsif not v_target and v_exists then
    delete from votes v where v.demand_id = p_demand and v.voter_id = auth.uid();
  end if;

  return query
    select d.id, d.vote_count + d.offline_votes, v_target
      from demands d where d.id = p_demand;
end $$;

-- Submit a proposal. Lands as 'proposed' and is invisible to the public
-- until a moderator accepts it.
create or replace function propose_demand(
  p_title text,
  p_body text,
  p_chapter text default 'default'
)
returns demands language plpgsql security definer set search_path = public as $$
declare
  v_chapter uuid;
  v_recent integer;
  v_row demands;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  perform ensure_voter(p_chapter);

  select id into v_chapter from chapters where slug = p_chapter and is_active;
  if v_chapter is null then
    raise exception 'unknown chapter %', p_chapter using errcode = 'P0002';
  end if;

  -- Proposals are the real spam vector, so this limit is the strict one.
  select count(*) into v_recent
    from demands d
   where d.author_id = auth.uid()
     and d.created_at > now() - interval '1 hour';

  if v_recent >= 3 then
    raise exception 'proposal limit reached, try again later' using errcode = 'P0001';
  end if;

  insert into demands (chapter_id, slug, title, body, author_id, status)
  values (v_chapter, make_slug(p_title), trim(p_title), trim(p_body), auth.uid(), 'proposed')
  returning * into v_row;

  insert into audit_log (actor_id, action, demand_id, detail)
  values (auth.uid(), 'propose', v_row.id, jsonb_build_object('title', v_row.title));

  return v_row;
end $$;

-- Moderator decision. Writes the audit row in the same transaction so a
-- decision can never exist without its trail.
create or replace function moderate_demand(
  p_demand uuid,
  p_status demand_status,
  p_note text default null
)
returns demands language plpgsql security definer set search_path = public as $$
declare
  v_row demands;
begin
  if not is_moderator() then
    raise exception 'not a moderator' using errcode = '42501';
  end if;

  if p_status not in ('accepted', 'rejected', 'archived') then
    raise exception 'invalid target status' using errcode = 'P0002';
  end if;

  update demands
     set status = p_status,
         decided_by = auth.uid(),
         decided_at = now(),
         decision_note = p_note
   where id = p_demand
  returning * into v_row;

  if v_row.id is null then
    raise exception 'demand not found' using errcode = 'P0002';
  end if;

  insert into audit_log (actor_id, action, demand_id, detail)
  values (auth.uid(), 'moderate', p_demand,
          jsonb_build_object('status', p_status, 'note', p_note));

  return v_row;
end $$;

-- The exact payload the GitHub Action commits to data/demands.json.
-- Kept in SQL so the published snapshot and the live app can never disagree
-- about what "accepted" means.
create or replace function public_snapshot(p_chapter text default 'default')
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'version', 2,
    'chapter', p_chapter,
    'demands', coalesce(jsonb_agg(
      jsonb_build_object(
        'id', d.id,
        'slug', d.slug,
        'title', d.title,
        'text', d.body,
        'votes', d.vote_count + d.offline_votes
      ) order by (d.vote_count + d.offline_votes) desc, d.created_at
    ), '[]'::jsonb)
  )
  from demands d
  join chapters c on c.id = d.chapter_id
  where c.slug = p_chapter and d.status = 'accepted';
$$;

grant execute on function cast_vote(uuid, boolean)             to anon, authenticated;
grant execute on function propose_demand(text, text, text)     to anon, authenticated;
grant execute on function ensure_voter(text)                   to anon, authenticated;
grant execute on function moderate_demand(uuid, demand_status, text) to authenticated;
grant execute on function public_snapshot(text)                to anon, authenticated, service_role;

-- ---------------------------------------------------------------- seed

insert into chapters (slug, name, region)
values ('default', 'Cockroach Action', 'India')
on conflict (slug) do nothing;

-- To make yourself a moderator, sign in once through /moderate.html so an
-- auth user exists, then run (replacing the email):
--
--   insert into moderators (id, chapter_id, role)
--   select u.id, c.id, 'admin'
--     from auth.users u, chapters c
--    where u.email = 'you@example.com' and c.slug = 'default'
--   on conflict (id) do update set role = 'admin';
