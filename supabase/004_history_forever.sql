-- Historique conservé sans limite : plus aucune purge automatique (appliqué sur IPEIN EXAMS).
create or replace function public.ipein_put(p_token text, p_path text, p_body jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform ipein_check(p_token);
  if p_body is null or jsonb_typeof(p_body) <> 'object' then raise exception 'corps invalide' using errcode = '22023'; end if;
  insert into ipein_docs (path, body, deleted, updated_at) values (p_path, p_body, false, clock_timestamp())
    on conflict (path) do update set body = excluded.body, deleted = false, updated_at = clock_timestamp();
  insert into ipein_history (path, body, deleted) values (p_path, p_body, false);
end $$;
