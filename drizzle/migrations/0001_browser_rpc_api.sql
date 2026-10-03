ALTER TABLE public.access_config ADD COLUMN IF NOT EXISTS bcrypt_hash text;
UPDATE public.access_config SET bcrypt_hash = extensions.crypt('901902', extensions.gen_salt('bf', 10)) WHERE id = 1 AND bcrypt_hash IS NULL;

CREATE OR REPLACE FUNCTION public._session_ok(p_token text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
  SELECT p_token IS NOT NULL AND EXISTS (SELECT 1 FROM access_sessions
    WHERE token_hash = encode(digest(p_token, 'sha256'), 'base64') AND expires_at > now());
$$;
REVOKE ALL ON FUNCTION public._session_ok(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.app_login(p_password text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE ip text; n int; h text; tok text;
BEGIN
  ip := coalesce(split_part(coalesce(current_setting('request.headers', true)::json->>'x-forwarded-for',''), ',', 1), '');
  IF ip = '' THEN ip := 'unknown'; END IF;
  SELECT count(*) INTO n FROM login_attempts WHERE login_attempts.ip = app_login.ip AND attempted_at > now() - interval '15 minutes';
  IF n >= 8 THEN RETURN jsonb_build_object('ok', false, 'error', 'Too many attempts. Please wait 15 minutes and try again.'); END IF;
  SELECT bcrypt_hash INTO h FROM access_config WHERE id = 1;
  IF h IS NULL OR p_password IS NULL OR length(p_password) > 200 OR crypt(p_password, h) <> h THEN
    INSERT INTO login_attempts(ip) VALUES (ip);
    RETURN jsonb_build_object('ok', false, 'error', 'Incorrect password');
  END IF;
  DELETE FROM login_attempts WHERE login_attempts.ip = app_login.ip;
  DELETE FROM access_sessions WHERE expires_at < now();
  tok := encode(gen_random_bytes(32), 'base64');
  INSERT INTO access_sessions(token_hash, expires_at) VALUES (encode(digest(tok, 'sha256'), 'base64'), now() + interval '30 days');
  RETURN jsonb_build_object('ok', true, 'token', tok);
END $$;

CREATE OR REPLACE FUNCTION public.app_call(p_token text, p_action text, p_data jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v int; ids text[]; cur text; q jsonb; r jsonb;
BEGIN
  IF p_action = 'check' THEN RETURN jsonb_build_object('authed', _session_ok(p_token)); END IF;
  IF p_action = 'logout' THEN
    DELETE FROM access_sessions WHERE token_hash = encode(digest(coalesce(p_token,''), 'sha256'), 'base64');
    RETURN '{"ok":true}';
  END IF;
  IF NOT _session_ok(p_token) THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE = '28000'; END IF;

  IF p_action = 'load' THEN
    SELECT value#>>'{}' INTO cur FROM app_settings WHERE key = 'current_quotation_id';
    SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.updated_at DESC), '[]') INTO q FROM quotations x WHERE x.saved_as_draft OR x.id = cur;
    SELECT coalesce(jsonb_agg(to_jsonb(y) ORDER BY y.position), '[]') INTO r FROM quotation_rows y
      WHERE y.quotation_id IN (SELECT x.id FROM quotations x WHERE x.saved_as_draft OR x.id = cur);
    RETURN jsonb_build_object('currentId', cur, 'quotations', q, 'rows', r,
      'defaults', (SELECT value FROM app_settings WHERE key = 'company_default'),
      'options', (SELECT value FROM app_settings WHERE key = 'options'));
  ELSIF p_action = 'save' THEN
    BEGIN
      v := save_quotation(p_data->'inv', p_data->'inv'->'rows', (p_data->>'expected')::int, coalesce((p_data->>'markDraft')::boolean, false));
    EXCEPTION WHEN SQLSTATE 'P0409' OR unique_violation THEN RETURN '{"conflict":true}';
    END;
    IF coalesce((p_data->>'makeCurrent')::boolean, false) THEN
      INSERT INTO app_settings(key, value, updated_at) VALUES ('current_quotation_id', to_jsonb(p_data->'inv'->>'id'), now())
      ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = now();
    END IF;
    RETURN jsonb_build_object('version', v);
  ELSIF p_action = 'set_current' THEN
    INSERT INTO app_settings(key, value, updated_at) VALUES ('current_quotation_id', to_jsonb(p_data->>'id'), now())
    ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = now();
    IF p_data->>'discardId' IS NOT NULL AND p_data->>'discardId' <> p_data->>'id' THEN
      DELETE FROM quotations WHERE id = p_data->>'discardId' AND saved_as_draft = false;
    END IF;
    RETURN '{"ok":true}';
  ELSIF p_action = 'delete_draft' THEN
    IF coalesce((p_data->>'isCurrent')::boolean, false) THEN UPDATE quotations SET saved_as_draft = false WHERE id = p_data->>'id';
    ELSE DELETE FROM quotations WHERE id = p_data->>'id'; END IF;
    RETURN '{"ok":true}';
  ELSIF p_action = 'save_setting' THEN
    IF p_data->>'key' NOT IN ('company_default', 'options', 'current_quotation_id') THEN RAISE EXCEPTION 'invalid setting'; END IF;
    INSERT INTO app_settings(key, value, updated_at) VALUES (p_data->>'key', p_data->'value', now())
    ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = now();
    RETURN '{"ok":true}';
  ELSIF p_action = 'existing_ids' THEN
    SELECT coalesce(jsonb_agg(id), '[]') INTO q FROM quotations WHERE id IN (SELECT jsonb_array_elements_text(p_data->'ids'));
    RETURN q;
  ELSIF p_action = 'get_setting' THEN
    RETURN jsonb_build_object('value', (SELECT value FROM app_settings WHERE key = p_data->>'key'));
  END IF;
  RAISE EXCEPTION 'unknown action';
END $$;

REVOKE ALL ON FUNCTION public.save_quotation(jsonb, jsonb, integer, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_login(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_call(text, text, jsonb) TO anon, authenticated;