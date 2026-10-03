CREATE OR REPLACE FUNCTION public.app_login(p_password text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_ip text; n int; h text; tok text;
BEGIN
  v_ip := coalesce(trim(split_part(coalesce(current_setting('request.headers', true)::json->>'x-forwarded-for',''), ',', 1)), '');
  IF v_ip = '' THEN v_ip := 'unknown'; END IF;
  SELECT count(*) INTO n FROM login_attempts la WHERE la.ip = v_ip AND la.attempted_at > now() - interval '15 minutes';
  IF n >= 8 THEN RETURN jsonb_build_object('ok', false, 'error', 'Too many attempts. Please wait 15 minutes and try again.'); END IF;
  SELECT bcrypt_hash INTO h FROM access_config WHERE id = 1;
  IF h IS NULL OR p_password IS NULL OR length(p_password) > 200 OR crypt(p_password, h) <> h THEN
    INSERT INTO login_attempts(ip) VALUES (v_ip);
    RETURN jsonb_build_object('ok', false, 'error', 'Incorrect password');
  END IF;
  DELETE FROM login_attempts la WHERE la.ip = v_ip;
  DELETE FROM access_sessions WHERE expires_at < now();
  tok := encode(gen_random_bytes(32), 'base64');
  INSERT INTO access_sessions(token_hash, expires_at) VALUES (encode(digest(tok, 'sha256'), 'base64'), now() + interval '30 days');
  RETURN jsonb_build_object('ok', true, 'token', tok);
END $$;