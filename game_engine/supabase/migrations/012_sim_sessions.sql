-- Situation sessions: the authoritative copy of a generated world's state.
--
-- One row per play session. `state` is the WorldState from lib/sim/schema.ts —
-- facts, mission states, the clock, and the append-only log that both sides'
-- utterances and every applied mutation are written to. The log is the
-- transcript of record: the debrief reads it from here, never from the client,
-- so a refreshed tab or a closed laptop cannot change what happened.
--
-- `version` is optimistic concurrency. Turns arrive from one browser, but the
-- ambient event clock also writes, and a lost update is how a wallet quietly
-- refills itself mid-bargain.
--
-- RLS is on with no policies on purpose: nothing here is reachable with the
-- publishable key. Only the server touches these tables, with the secret key,
-- because a client that could write `state` could write itself a full wallet.

create extension if not exists pgcrypto;

create table if not exists public.sim_sessions (
  id          uuid primary key default gen_random_uuid(),
  -- Anonymous id minted in localStorage; a session survives a reload without
  -- requiring the player to have signed in.
  session_key text not null unique,
  user_id     uuid references auth.users (id) on delete set null,
  city_id     text not null,
  archetype   text not null,
  prompt      text not null,
  spec        jsonb not null,
  scenario    jsonb not null,
  state       jsonb not null,
  version     integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists sim_sessions_session_key_idx on public.sim_sessions (session_key);
create index if not exists sim_sessions_created_at_idx on public.sim_sessions (created_at desc);

alter table public.sim_sessions enable row level security;

-- Compiled specs and voice packs, keyed by a hash of (city, prompt).
--
-- Two reasons, and the second is the one that matters on the day: repeated
-- prompts stop spending Groq quota, and the demo's exact prompts are warm, so
-- if Groq stalls mid-pitch the world still builds from cache by hash.
create table if not exists public.sim_spec_cache (
  prompt_hash text primary key,
  city_id     text not null,
  prompt      text not null,
  spec        jsonb not null,
  voice_pack  jsonb,
  created_at  timestamptz not null default now()
);

alter table public.sim_spec_cache enable row level security;
