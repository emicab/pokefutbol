-- Partidas guardadas de PokéFútbol en la nube (ver js/cloud.js y README.md).
-- Se aplicó al proyecto "pokefutbol" de Supabase; este archivo sirve para recrearlo en otro proyecto
-- (después hay que poner su URL y su llave "publishable" en js/cloud.js).
--
-- La clave de cada fila es el SHA-256 del código secreto del jugador (el código no se guarda).
-- Nadie accede a la tabla directamente (RLS activado y sin políticas): sólo por save_get / save_put.

create table public.cloud_saves (
  code_hash  text primary key check (code_hash ~ '^[0-9a-f]{64}$'),
  data       jsonb not null check (octet_length(data::text) <= 800000),
  updated_at timestamptz not null default now(),
  device     text
);
alter table public.cloud_saves enable row level security;

-- Lee la partida de un código.
create function public.save_get(p_hash text)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object('data', s.data, 'updated_at', s.updated_at, 'device', s.device)
  from public.cloud_saves s
  where s.code_hash = p_hash;
$$;

-- Guarda la partida. p_base = la versión (updated_at) que el dispositivo tenía al sincronizar por última vez:
-- si la nube cambió desde entonces devuelve conflict = true y no pisa nada (salvo p_force).
create function public.save_put(p_hash text, p_data jsonb, p_device text, p_base timestamptz default null, p_force boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cur timestamptz;
  now_ts timestamptz := now();
begin
  if p_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'error', 'codigo');
  end if;
  select updated_at into cur from public.cloud_saves where code_hash = p_hash for update;
  if found and not p_force and (p_base is null or cur > p_base) then
    return jsonb_build_object('ok', false, 'conflict', true, 'updated_at', cur);
  end if;
  insert into public.cloud_saves (code_hash, data, updated_at, device)
  values (p_hash, p_data, now_ts, left(p_device, 40))
  on conflict (code_hash) do update set data = excluded.data, updated_at = excluded.updated_at, device = excluded.device;
  return jsonb_build_object('ok', true, 'updated_at', now_ts);
end;
$$;

revoke all on public.cloud_saves from anon, authenticated;
revoke execute on function public.save_get(text) from public;
revoke execute on function public.save_put(text, jsonb, text, timestamptz, boolean) from public;
grant execute on function public.save_get(text) to anon, authenticated;
grant execute on function public.save_put(text, jsonb, text, timestamptz, boolean) to anon, authenticated;
