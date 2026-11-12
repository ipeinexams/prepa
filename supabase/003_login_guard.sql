-- Fiches du personnel sans compte (password_hash vide) : jamais de connexion possible.
-- Appliqué sur le projet IPEIN EXAMS. Remplace la fonction de 002_auth.sql.
create or replace function public.ipein_login(p_email text, p_hash text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e text := lower(trim(coalesce(p_email, ''))); a ipein_attempts; u jsonb; t text; stored text;
begin
  select * into a from ipein_attempts where email = e;
  if found and a.locked_until is not null and a.locked_until > now() then
    return jsonb_build_object('error', 'verrouille', 'until', to_char(a.locked_until at time zone 'Africa/Tunis', 'HH24:MI'));
  end if;
  select body into u from ipein_docs
    where left(path, 12) = 'ipein_users/' and not deleted and lower(body->>'email') = e limit 1;
  stored := coalesce(split_part(coalesce(u->>'password_hash', ''), '$', 2), '');
  if u is null or stored = '' or coalesce(p_hash, '') = '' or stored <> p_hash then
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
