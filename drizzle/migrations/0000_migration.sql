CREATE TABLE public.quotations (
  id text PRIMARY KEY,
  customer_name text NOT NULL DEFAULT '',
  customer_address text NOT NULL DEFAULT '',
  quotation_number text NOT NULL DEFAULT '',
  quotation_date text NOT NULL DEFAULT '',
  seller_name text NOT NULL DEFAULT '',
  currency text NOT NULL DEFAULT 'USD',
  discount_type text NOT NULL DEFAULT 'percent',
  discount_value text NOT NULL DEFAULT '',
  shipping text NOT NULL DEFAULT '',
  other_label text NOT NULL DEFAULT '',
  other_charges text NOT NULL DEFAULT '',
  show_secondary boolean NOT NULL DEFAULT false,
  secondary_currency text NOT NULL DEFAULT 'INR',
  exchange_rate text NOT NULL DEFAULT '',
  terms text NOT NULL DEFAULT '',
  company jsonb,
  saved_as_draft boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.quotations TO service_role;
ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.quotation_rows (
  quotation_id text NOT NULL REFERENCES public.quotations(id) ON DELETE CASCADE,
  id text NOT NULL,
  position integer NOT NULL,
  description text NOT NULL DEFAULT '',
  link text NOT NULL DEFAULT '',
  hsn text NOT NULL DEFAULT '',
  stone text,
  type text NOT NULL DEFAULT '',
  shape text,
  size text NOT NULL DEFAULT '',
  size_unit text NOT NULL DEFAULT 'ct',
  colour text NOT NULL DEFAULT '',
  clarity text NOT NULL DEFAULT '',
  cps text NOT NULL DEFAULT '',
  certificate text NOT NULL DEFAULT '',
  fluorescence text NOT NULL DEFAULT '',
  wt_per_pcs text NOT NULL DEFAULT '',
  pcs text NOT NULL DEFAULT '',
  total_wt text,
  price_per_ct text NOT NULL DEFAULT '',
  cut text, polish text, symmetry text, cert_lab text, cert_no text,
  PRIMARY KEY (quotation_id, id)
);
CREATE INDEX quotation_rows_order ON public.quotation_rows (quotation_id, position);
GRANT ALL ON public.quotation_rows TO service_role;
ALTER TABLE public.quotation_rows ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.access_config (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  password_hash text NOT NULL,
  salt text NOT NULL,
  iterations integer NOT NULL
);
GRANT ALL ON public.access_config TO service_role;
ALTER TABLE public.access_config ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.access_sessions (
  token_hash text PRIMARY KEY,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.access_sessions TO service_role;
ALTER TABLE public.access_sessions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.login_attempts (
  id bigserial PRIMARY KEY,
  ip text NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX login_attempts_ip_time ON public.login_attempts (ip, attempted_at);
GRANT ALL ON public.login_attempts TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.login_attempts_id_seq TO service_role;
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.save_quotation(p_q jsonb, p_rows jsonb, p_expected integer, p_mark_draft boolean)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE v integer;
BEGIN
  IF p_expected = 0 THEN
    INSERT INTO quotations (id, customer_name, customer_address, quotation_number, quotation_date, seller_name, currency,
      discount_type, discount_value, shipping, other_label, other_charges, show_secondary, secondary_currency, exchange_rate,
      terms, company, saved_as_draft, version)
    VALUES (p_q->>'id', coalesce(p_q->>'customerName',''), coalesce(p_q->>'customerAddress',''), coalesce(p_q->>'invoiceNumber',''),
      coalesce(p_q->>'invoiceDate',''), coalesce(p_q->>'sellerName',''), coalesce(p_q->>'currency','USD'),
      coalesce(p_q->>'discountType','percent'), coalesce(p_q->>'discountValue',''), coalesce(p_q->>'shipping',''),
      coalesce(p_q->>'otherLabel',''), coalesce(p_q->>'otherCharges',''), coalesce((p_q->>'showSecondary')::boolean,false),
      coalesce(p_q->>'secondaryCurrency','INR'), coalesce(p_q->>'exchangeRate',''), coalesce(p_q->>'terms',''),
      p_q->'company', p_mark_draft, 1);
    v := 1;
  ELSE
    UPDATE quotations SET
      customer_name = coalesce(p_q->>'customerName',''), customer_address = coalesce(p_q->>'customerAddress',''),
      quotation_number = coalesce(p_q->>'invoiceNumber',''), quotation_date = coalesce(p_q->>'invoiceDate',''),
      seller_name = coalesce(p_q->>'sellerName',''), currency = coalesce(p_q->>'currency','USD'),
      discount_type = coalesce(p_q->>'discountType','percent'), discount_value = coalesce(p_q->>'discountValue',''),
      shipping = coalesce(p_q->>'shipping',''), other_label = coalesce(p_q->>'otherLabel',''),
      other_charges = coalesce(p_q->>'otherCharges',''), show_secondary = coalesce((p_q->>'showSecondary')::boolean,false),
      secondary_currency = coalesce(p_q->>'secondaryCurrency','INR'), exchange_rate = coalesce(p_q->>'exchangeRate',''),
      terms = coalesce(p_q->>'terms',''), company = p_q->'company',
      saved_as_draft = saved_as_draft OR p_mark_draft, version = version + 1, updated_at = now()
    WHERE id = p_q->>'id' AND version = p_expected
    RETURNING version INTO v;
    IF v IS NULL THEN RAISE EXCEPTION 'conflict' USING ERRCODE = 'P0409'; END IF;
  END IF;

  DELETE FROM quotation_rows WHERE quotation_id = p_q->>'id';
  INSERT INTO quotation_rows (quotation_id, id, position, description, link, hsn, stone, type, shape, size, size_unit, colour,
    clarity, cps, certificate, fluorescence, wt_per_pcs, pcs, total_wt, price_per_ct, cut, polish, symmetry, cert_lab, cert_no)
  SELECT p_q->>'id', r->>'id', (pos - 1)::int, coalesce(r->>'description',''), coalesce(r->>'link',''), coalesce(r->>'hsn',''),
    r->>'stone', coalesce(r->>'type',''), r->>'shape', coalesce(r->>'size',''), coalesce(r->>'sizeUnit','ct'),
    coalesce(r->>'colour',''), coalesce(r->>'clarity',''), coalesce(r->>'cps',''), coalesce(r->>'certificate',''),
    coalesce(r->>'fluorescence',''), coalesce(r->>'wtPerPcs',''), coalesce(r->>'pcs',''), r->>'totalWt',
    coalesce(r->>'pricePerCt',''), r->>'cut', r->>'polish', r->>'symmetry', r->>'certLab', r->>'certNo'
  FROM jsonb_array_elements(coalesce(p_rows,'[]'::jsonb)) WITH ORDINALITY AS e(r, pos);
  RETURN v;
END;
$$;
REVOKE ALL ON FUNCTION public.save_quotation(jsonb, jsonb, integer, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_quotation(jsonb, jsonb, integer, boolean) TO service_role;