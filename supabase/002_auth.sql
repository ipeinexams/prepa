-- Connexion vérifiée par le serveur : sessions personnelles (12 h, prolongées à l'usage),
-- verrouillage après 5 échecs. Ajouts uniquement : aucune donnée supprimée.
create table if not exists public.ipein_sessions (
  token text primary key, user_id bigint,
  kind text not null check (kind in ('user','setup')),
  created_at timestamptz not null default now(), expires_at timestamptz not null);
alter table public.ipein_sessions enable row level security;
create table if not exists public.ipein_attempts (email text primary key, fails int not null default 0, locked_until timestamptz);
alter table public.ipein_attempts enable row level security;
revoke all on public.ipein_sessions, public.ipein_attempts from anon, authenticated;

create or replace function public.ipein_initialized() returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from ipein_docs where left(path, 12) = 'ipein_users/' and not deleted); $$;
revoke all on function public.ipein_initialized() from public, anon, authenticated;

create or replace function public.ipein_check(p_token text) returns void
language plpgsql security definer set search_path = public as $$
declare s ipein_sessions;
begin
  select * into s from ipein_sessions where token = p_token and expires_at > now();
  if not found then raise exception 'session invalide' using errcode = '28000'; end if;
  if s.kind = 'user' and s.expires_at < now() + interval '11 hours 59 minutes' then
    update ipein_sessions set expires_at = now() + interval '12 hours' where token = p_token;
  end if;
end $$;
revoke all on function public.ipein_check(text) from public, anon, authenticated;

create or replace function public.ipein_state() returns boolean
language sql security definer set search_path = public stable as $$ select ipein_initialized(); $$;

create or replace function public.ipein_setup() returns text
language plpgsql security definer set search_path = public as $$
declare t text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  if ipein_initialized() then raise exception 'deja_initialise' using errcode = '28000'; end if;
  insert into ipein_sessions (token, kind, expires_at) values (t, 'setup', now() + interval '2 hours');
  return t;
end $$;

create or replace function public.ipein_salt(p_email text) returns text
language plpgsql security definer set search_path = public stable as $$
declare s text;
begin
  select split_part(body->>'password_hash', '$', 1) into s from ipein_docs
    where left(path, 12) = 'ipein_users/' and not deleted and lower(body->>'email') = lower(trim(p_email)) limit 1;
  return coalesce(nullif(s, ''), left(md5('ipein-salt:' || lower(trim(coalesce(p_email, '')))), 32));
end $$;

create or replace function public.ipein_login(p_email text, p_hash text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e text := lower(trim(coalesce(p_email, ''))); a ipein_attempts; u jsonb; t text;
begin
  select * into a from ipein_attempts where email = e;
  if found and a.locked_until is not null and a.locked_until > now() then
    return jsonb_build_object('error', 'verrouille', 'until', to_char(a.locked_until at time zone 'Africa/Tunis', 'HH24:MI'));
  end if;
  select body into u from ipein_docs
    where left(path, 12) = 'ipein_users/' and not deleted and lower(body->>'email') = e limit 1;
  if u is null or split_part(u->>'password_hash', '$', 2) <> coalesce(p_hash, '') then
    insert into ipein_attempts (email, fails) values (e, 1) on conflict (email) do update set fails = ipein_attempts.fails + 1;
    update ipein_attempts set locked_until = now() + interval '15 minutes', fails = 0 where email = e and fails >= 5;
    return jsonb_build_object('error', 'identifiants');
  end if;
  if coalesce((u->>'active')::boolean, true) = false then return jsonb_build_object('error', 'desactive'); end if;
  update ipein_attempts set fails = 0, locked_until = null where email = e;
  t := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into ipein_sessions (token, user_id, kind, expires_at) values (t, (u->>'id')::bigint, 'user', now() + interval '12 hours');
  return jsonb_build_object('token', t, 'user_id', (u->>'id')::bigint);
end $$;

create or replace function public.ipein_logout(p_token text) returns void
language sql security definer set search_path = public as $$ update ipein_sessions set expires_at = now() where token = p_token; $$;

grant execute on function public.ipein_state(), public.ipein_setup(), public.ipein_salt(text),
  public.ipein_login(text, text), public.ipein_logout(text) to anon, authenticated;
