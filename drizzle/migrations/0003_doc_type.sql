ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS doc_type text NOT NULL DEFAULT 'Quotation';
CREATE OR REPLACE FUNCTION public._set_doc_type() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
DROP FUNCTION public._set_doc_type();
DO $$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.save_quotation(jsonb,jsonb,integer,boolean)'::regprocedure);
  d := replace(d, 'terms, company, saved_as_draft, version)', 'terms, company, saved_as_draft, version, doc_type)');
  d := replace(d, 'p_q->''company'', p_mark_draft, 1);', 'p_q->''company'', p_mark_draft, 1, coalesce(nullif(p_q->>''docType'',''''),''Quotation''));');
  d := replace(d, 'terms = coalesce(p_q->>''terms'',''''), company = p_q->''company'',', 'terms = coalesce(p_q->>''terms'',''''), company = p_q->''company'', doc_type = coalesce(nullif(p_q->>''docType'',''''),''Quotation''),');
  EXECUTE d;
END $$;
REVOKE ALL ON FUNCTION public.save_quotation(jsonb, jsonb, integer, boolean) FROM PUBLIC, anon, authenticated;