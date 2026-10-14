-- Ranking de PokéFútbol (ver js/ranking.js y README.md). Se aplica después de tools/supabase.sql.
--
-- Cada jugador se identifica con el SHA-256 de un código secreto que genera el juego y guarda en la partida
-- (así viaja con la nube y los archivos). Nadie accede a las tablas directamente (RLS sin políticas):
-- sólo por rank_register, rank_report y rank_top. Las respuestas nunca devuelven el hash de nadie.
--
-- Puntos por partido: victoria 3, empate 1, derrota 0, por la dificultad del rival (fácil ×1, normal ×2, difícil ×3).
-- Abandonar un partido empezado cuenta como derrota. Cada jugador puede reportar como mucho ~1 partido cada
-- 45 s (con un margen de 20 seguidos), y el último reporte se ignora si llega repetido (mismo p_nonce).

create table public.rank_players (
  player_hash text primary key check (player_hash ~ '^[0-9a-f]{64}$'),
  team_name   text not null check (char_length(team_name) between 3 and 20),
  name_key    text not null unique,
  created_at  timestamptz not null default now(),
  bucket      real not null default 20,
  bucket_at   timestamptz not null default now(),
  last_nonce  text
);

create table public.rank_stats (
  player_hash text not null references public.rank_players on delete cascade,
  size        smallint not null check (size in (2, 3, 5)),
  lineup      text not null check (lineup ~ '^[a-z0-9_-]{1,24}(,[a-z0-9_-]{1,24}){1,4}$'),
  played      int not null default 0,
  won         int not null default 0,
  drawn       int not null default 0,
  lost        int not null default 0,
  gf          int not null default 0,
  ga          int not null default 0,
  points      int not null default 0,
  updated_at  timestamptz not null default now(),
  primary key (player_hash, size, lineup)
);
create index rank_stats_size on public.rank_stats (size);

alter table public.rank_players enable row level security;
alter table public.rank_stats enable row level security;

-- Inscribe (o renombra) el equipo de un jugador. Devuelve { ok } o { ok: false, error: 'nombre' | 'ocupado' | 'codigo' }.
create function public.rank_register(p_hash text, p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  nm text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  k text;
begin
  if p_hash !~ '^[0-9a-f]{64}$' then return jsonb_build_object('ok', false, 'error', 'codigo'); end if;
  if nm !~ '^[A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñ .''!_-]{3,20}$' then return jsonb_build_object('ok', false, 'error', 'nombre'); end if;
  k := lower(nm);
  if exists (select 1 from rank_players where name_key = k and player_hash <> p_hash) then
    return jsonb_build_object('ok', false, 'error', 'ocupado');
  end if;
  insert into rank_players (player_hash, team_name, name_key) values (p_hash, nm, k)
  on conflict (player_hash) do update set team_name = excluded.team_name, name_key = excluded.name_key;
  return jsonb_build_object('ok', true, 'name', nm);
exception when unique_violation then
  return jsonb_build_object('ok', false, 'error', 'ocupado');
end;
$$;

-- Suma un partido. p_lineup: ids de los titulares separados por coma (se ordenan acá).
-- Devuelve { ok, points } o { ok: false, error: 'datos' | 'inscripcion' | 'limite' }.
create function public.rank_report(p_hash text, p_size int, p_lineup text, p_gf int, p_ga int, p_diff text, p_abandon boolean default false, p_nonce text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  pl rank_players;
  ids text[];
  lu text;
  mult int := case p_diff when 'easy' then 1 when 'normal' then 2 when 'hard' then 3 end;
  res int;          -- 1 ganó, 0 empató, -1 perdió
  pts int;
  tokens real;
begin
  ids := string_to_array(coalesce(p_lineup, ''), ',');
  if p_size not in (2, 3, 5) or mult is null or cardinality(ids) <> p_size
     or p_gf is null or p_ga is null or p_gf not between 0 and 40 or p_ga not between 0 and 40 then
    return jsonb_build_object('ok', false, 'error', 'datos');
  end if;
  select string_agg(x, ',' order by x) into lu from unnest(ids) x;
  if lu !~ '^[a-z0-9_-]{1,24}(,[a-z0-9_-]{1,24}){1,4}$' then return jsonb_build_object('ok', false, 'error', 'datos'); end if;

  select * into pl from rank_players where player_hash = p_hash for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'inscripcion'); end if;
  if p_nonce is not null and pl.last_nonce = p_nonce then return jsonb_build_object('ok', true, 'repeated', true); end if;

  tokens := least(20, pl.bucket + extract(epoch from now() - pl.bucket_at) / 45);
  if tokens < 1 then return jsonb_build_object('ok', false, 'error', 'limite'); end if;
  update rank_players set bucket = tokens - 1, bucket_at = now(), last_nonce = left(p_nonce, 40) where player_hash = p_hash;

  res := case when coalesce(p_abandon, false) then -1 else sign(p_gf - p_ga)::int end;
  pts := case res when 1 then 3 when 0 then 1 else 0 end * mult;
  insert into rank_stats as s (player_hash, size, lineup, played, won, drawn, lost, gf, ga, points)
  values (p_hash, p_size, lu, 1, (res = 1)::int, (res = 0)::int, (res = -1)::int, p_gf, p_ga, pts)
  on conflict (player_hash, size, lineup) do update set
    played = s.played + 1, won = s.won + excluded.won, drawn = s.drawn + excluded.drawn, lost = s.lost + excluded.lost,
    gf = s.gf + excluded.gf, ga = s.ga + excluded.ga, points = s.points + excluded.points, updated_at = now();
  return jsonb_build_object('ok', true, 'points', pts);
end;
$$;

-- Tabla de un modo (2, 3 o 5 por equipo): los 50 primeros y, si se pasa p_hash, la fila de ese jugador.
-- Cada fila: puesto, nombre, totales del modo y el equipo (alineación) con el que sumó más puntos, con su propio G/P.
create function public.rank_top(p_size int, p_hash text default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with agg as (
    select player_hash, sum(points)::int pts, sum(played)::int pj, sum(won)::int w, sum(drawn)::int d, sum(lost)::int l,
           sum(gf)::int gf, sum(ga)::int ga, max(updated_at) last
    from rank_stats where size = p_size group by player_hash
  ), best as (
    select distinct on (player_hash) player_hash, lineup, points bpts, played bpj, won bw, drawn bd, lost bl
    from rank_stats where size = p_size
    order by player_hash, points desc, played desc, updated_at desc
  ), ranked as (
    select rank() over (order by a.pts desc, a.w desc, a.pj asc) pos, p.team_name name,
           a.pts, a.pj, a.w, a.d, a.l, a.gf, a.ga, a.last,
           b.lineup, b.bpts, b.bpj, b.bw, b.bd, b.bl, a.player_hash = p_hash me
    from agg a join rank_players p using (player_hash) join best b using (player_hash)
  )
  select jsonb_build_object(
    'total', (select count(*) from ranked),
    'rows', coalesce((select jsonb_agg(to_jsonb(t) - 'last' order by t.pos, t.last) from (select * from ranked order by pos, last limit 50) t), '[]'::jsonb),
    'me', (select to_jsonb(r) - 'last' from ranked r where r.me limit 1)
  );
$$;

revoke all on public.rank_players, public.rank_stats from anon, authenticated;
revoke execute on function public.rank_register(text, text) from public;
revoke execute on function public.rank_report(text, int, text, int, int, text, boolean, text) from public;
revoke execute on function public.rank_top(int, text) from public;
grant execute on function public.rank_register(text, text) to anon, authenticated;
grant execute on function public.rank_report(text, int, text, int, int, text, boolean, text) to anon, authenticated;
grant execute on function public.rank_top(int, text) to anon, authenticated;
