-- IPEIN Examens : stockage en ligne commun à toutes les copies de l'application.
-- Table inaccessible directement (RLS sans politique) ; accès uniquement par les fonctions
-- ci-dessous, qui exigent le jeton de l'établissement. Suppression = marquage (corbeille
-- conservée), jamais d'effacement physique depuis l'application.

create table if not exists public.ipein_docs (
  path text primary key check (length(path) between 3 and 400),
  body jsonb,
  deleted boolean not null default false,
  updated_at timestamptz not null default clock_timestamp()
);
create index if not exists ipein_docs_updated on public.ipein_docs (updated_at);
alter table public.ipein_docs enable row level security;

create table if not exists public.ipein_secret (token text primary key);
alter table public.ipein_secret enable row level security;
insert into public.ipein_secret (token)
  select replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
  where not exists (select 1 from public.ipein_secret);

-- Historique de chaque version écrite (filet de sécurité : rien n'est perdu)
create table if not exists public.ipein_history (
  id bigserial primary key,
  path text not null,
  body jsonb,
  deleted boolean not null,
  at timestamptz not null default clock_timestamp()
);
alter table public.ipein_history enable row level security;

create or replace function public.ipein_check(p_token text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_token is null or not exists (select 1 from ipein_secret where token = p_token) then
    raise exception 'jeton invalide' using errcode = '28000';
  end if;
end $$;

create or replace function public.ipein_now(p_token text) returns timestamptz
language plpgsql security definer set search_path = public as $$
begin perform ipein_check(p_token); return clock_timestamp(); end $$;

create or replace function public.ipein_get(p_token text, p_path text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform ipein_check(p_token);
  return (select body from ipein_docs where path = p_path and not deleted);
end $$;

create or replace function public.ipein_list(p_token text, p_coll text, p_after text, p_limit int)
returns table (path text, body jsonb)
language plpgsql security definer set search_path = public as $$
begin
  perform ipein_check(p_token);
  return query
    select d.path, d.body from ipein_docs d
    where left(d.path, length(p_coll) + 1) = p_coll || '/' and position('/' in substr(d.path, length(p_coll) + 2)) = 0
      and not d.deleted and d.path > coalesce(p_after, '')
    order by d.path limit least(greatest(coalesce(p_limit, 1000), 1), 1000);
end $$;

create or replace function public.ipein_since(p_token text, p_since timestamptz)
returns table (path text, body jsonb, deleted boolean, updated_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  perform ipein_check(p_token);
  return query
    select d.path, d.body, d.deleted, d.updated_at from ipein_docs d
    where d.updated_at > p_since order by d.updated_at limit 5000;
end $$;

create or replace function public.ipein_put(p_token text, p_path text, p_body jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform ipein_check(p_token);
  if p_body is null or jsonb_typeof(p_body) <> 'object' then raise exception 'corps invalide' using errcode = '22023'; end if;
  insert into ipein_docs (path, body, deleted, updated_at) values (p_path, p_body, false, clock_timestamp())
    on conflict (path) do update set body = excluded.body, deleted = false, updated_at = clock_timestamp();
  insert into ipein_history (path, body, deleted) values (p_path, p_body, false);
  if random() < 0.01 then delete from ipein_history where at < now() - interval '90 days'; end if;
end $$;

create or replace function public.ipein_del(p_token text, p_path text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform ipein_check(p_token);
  update ipein_docs set deleted = true, updated_at = clock_timestamp() where path = p_path and not deleted;
  insert into ipein_history (path, body, deleted) values (p_path, null, true);
end $$;

revoke all on function public.ipein_check(text) from public, anon, authenticated;
grant execute on function public.ipein_now(text), public.ipein_get(text, text),
  public.ipein_list(text, text, text, int), public.ipein_since(text, timestamptz),
  public.ipein_put(text, text, jsonb), public.ipein_del(text, text) to anon, authenticated;
