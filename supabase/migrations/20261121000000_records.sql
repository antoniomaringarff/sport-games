-- Jugadores (sin login: el id lo genera el navegador y queda guardado ahí) y sus tiempos.
-- Solo se accede desde las funciones de Vercel con la clave de servicio: RLS prendido y sin políticas.

create table public.players (
  id uuid primary key,
  name text not null check (char_length(btrim(name)) between 2 and 16),
  first_ip text,
  first_city text,
  first_region text,
  first_country text,
  last_ip text,
  last_city text,
  last_region text,
  last_country text,
  user_agent text,
  visits integer not null default 1,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table public.records (
  id bigint generated always as identity primary key,
  player_id uuid not null references public.players (id) on delete cascade,
  player_name text not null,
  place text not null check (place in ('monaco', 'rally', 'condor')),
  car text not null,
  time_ms integer not null check (time_ms > 0),
  sectors jsonb,
  ip text,
  city text,
  region text,
  country text,
  created_at timestamptz not null default now()
);

create index records_place_time_idx on public.records (place, time_ms);
create index records_player_idx on public.records (player_id, created_at desc);
create index players_last_seen_idx on public.players (last_seen_at desc);

alter table public.players enable row level security;
alter table public.records enable row level security;

-- Mejor tiempo de cada jugador en cada lugar (para el ranking)
create view public.best_records with (security_invoker = true) as
select distinct on (place, player_id)
  place, player_id, player_name, car, time_ms, city, country, created_at
from public.records
order by place, player_id, time_ms, created_at;

-- Alta o visita de un jugador: guarda la primera y la última ubicación y cuenta las visitas.
create function public.touch_player(
  p_id uuid, p_name text, p_ip text, p_city text, p_region text, p_country text, p_user_agent text
) returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.players as p (
    id, name, first_ip, first_city, first_region, first_country,
    last_ip, last_city, last_region, last_country, user_agent
  ) values (
    p_id, btrim(p_name), p_ip, p_city, p_region, p_country,
    p_ip, p_city, p_region, p_country, p_user_agent
  )
  on conflict (id) do update set
    name = excluded.name,
    last_ip = excluded.last_ip,
    last_city = excluded.last_city,
    last_region = excluded.last_region,
    last_country = excluded.last_country,
    user_agent = excluded.user_agent,
    visits = p.visits + 1,
    last_seen_at = now();
$$;

revoke all on function public.touch_player from public, anon, authenticated;
revoke all on public.best_records from anon, authenticated;
