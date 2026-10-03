import { getCookie, setCookie, deleteCookie, getRequestHeader } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { DiamondRow, Invoice, CompanyInfo } from "./invoice";

const COOKIE = "lepdo_session";
const SESSION_DAYS = 30;
const MAX_FAILS = 8;
const WINDOW_MIN = 15;

export const db = () => supabaseAdmin;

const b64 = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const sha256 = async (s: string) => b64(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

const clientIp = () =>
  getRequestHeader("cf-connecting-ip") || getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

const cookieOpts = { httpOnly: true, secure: true, sameSite: "none" as const, partitioned: true, path: "/" };

export async function login(password: string) {
  const ip = clientIp();
  const since = new Date(Date.now() - WINDOW_MIN * 60_000).toISOString();
  const { count } = await db().from("login_attempts").select("id", { count: "exact", head: true }).eq("ip", ip).gte("attempted_at", since);
  if ((count ?? 0) >= MAX_FAILS) return { ok: false as const, error: `Too many attempts. Please wait ${WINDOW_MIN} minutes and try again.` };

  const { data: cfg, error } = await db().from("access_config").select("password_hash, salt, iterations").eq("id", 1).single();
  if (error || !cfg) throw new Error("Access is not configured");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: fromB64(cfg.salt), iterations: cfg.iterations }, key, 256);
  if (!safeEqual(b64(bits), cfg.password_hash)) {
    await db().from("login_attempts").insert({ ip });
    return { ok: false as const, error: "Incorrect password" };
  }
  await db().from("login_attempts").delete().eq("ip", ip);
  const token = b64(crypto.getRandomValues(new Uint8Array(32)).buffer);
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db().from("access_sessions").insert({ token_hash: await sha256(token), expires_at: expires.toISOString() });
  await db().from("access_sessions").delete().lt("expires_at", new Date().toISOString());
  setCookie(COOKIE, token, { ...cookieOpts, maxAge: SESSION_DAYS * 86_400 });
  return { ok: true as const };
}

export async function hasSession() {
  const token = getCookie(COOKIE);
  if (!token) return false;
  const { data } = await db().from("access_sessions").select("expires_at").eq("token_hash", await sha256(token)).maybeSingle();
  return !!data && new Date(data.expires_at).getTime() > Date.now();
}

/** Throws 401 unless the request carries a valid session cookie. Call first in every data handler. */
export async function requireSession() {
  if (!(await hasSession())) throw new Response("Unauthorized", { status: 401 });
}

export async function logout() {
  const token = getCookie(COOKIE);
  if (token) await db().from("access_sessions").delete().eq("token_hash", await sha256(token));
  deleteCookie(COOKIE, cookieOpts);
}

/* ---------- Mapping ---------- */
type QRow = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const s = (v: unknown) => (v == null ? "" : String(v));
const opt = (v: unknown) => (v == null ? undefined : String(v));

export function rowFromDb(r: QRow): DiamondRow {
  const out: DiamondRow = {
    id: s(r.id), description: s(r.description), link: s(r.link), hsn: s(r.hsn), type: s(r.type), size: s(r.size),
    sizeUnit: s(r.size_unit), colour: s(r.colour), clarity: s(r.clarity), cps: s(r.cps), certificate: s(r.certificate),
    fluorescence: s(r.fluorescence), wtPerPcs: s(r.wt_per_pcs), pcs: s(r.pcs), pricePerCt: s(r.price_per_ct),
  };
  const extra: [keyof DiamondRow, unknown][] = [["stone", r.stone], ["shape", r.shape], ["totalWt", r.total_wt], ["cut", r.cut],
    ["polish", r.polish], ["symmetry", r.symmetry], ["certLab", r.cert_lab], ["certNo", r.cert_no]];
  for (const [k, v] of extra) { const o = opt(v); if (o !== undefined) (out as Record<string, unknown>)[k] = o; }
  return out;
}

const signCache = new Map<string, { url: string; exp: number }>();
export async function signLogo(path: string) {
  const c = signCache.get(path);
  if (c && c.exp > Date.now()) return c.url;
  const { data } = await db().storage.from("logos").createSignedUrl(path, 7 * 86_400);
  const url = data?.signedUrl ?? "";
  if (url) signCache.set(path, { url, exp: Date.now() + 6 * 86_400_000 });
  return url;
}
/** Company objects keep the storage path; the browser gets a fresh signed URL in `logo`. */
export async function withLogoUrl(c: CompanyInfo | null | undefined): Promise<CompanyInfo | undefined> {
  if (!c) return undefined;
  if (c.logoPath) return { ...c, logo: await signLogo(c.logoPath) };
  return c;
}
export function stripLogoUrl(c: CompanyInfo | undefined) {
  if (!c) return c;
  return c.logoPath ? { ...c, logo: "" } : c;
}

export async function uploadLogo(dataUrl: string) {
  const m = /^data:(image\/(png|jpe?g|webp));base64,(.+)$/i.exec(dataUrl);
  if (!m) throw new Error("Unsupported logo format");
  const bytes = fromB64(m[3]!);
  if (bytes.length > 5 * 1024 * 1024) throw new Error("Logo is larger than 5 MB");
  const ext = m[2]!.toLowerCase().replace("jpeg", "jpg");
  const path = `logo-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
  const { error } = await db().storage.from("logos").upload(path, bytes, { contentType: m[1]!, upsert: false });
  if (error) throw new Error(error.message);
  return path;
}
/** Move an embedded data-URL logo into storage (used for older/local company snapshots). */
export async function normaliseCompany(c: CompanyInfo | undefined) {
  if (!c) return c;
  if (c.logo && c.logo.startsWith("data:") && !c.logoPath) return { ...c, logoPath: await uploadLogo(c.logo), logo: "" };
  return stripLogoUrl(c);
}

export async function loadQuotations(filter: { ids?: string[]; drafts?: boolean }) {
  let q = db().from("quotations").select("*");
  if (filter.ids) q = q.in("id", filter.ids);
  if (filter.drafts) q = q.eq("saved_as_draft", true);
  const { data, error } = await q.order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  if (!data.length) return [];
  const { data: rows, error: re } = await db().from("quotation_rows").select("*").in("quotation_id", data.map((d) => d.id)).order("position");
  if (re) throw new Error(re.message);
  return Promise.all(data.map(async (d) => ({
    version: d.version,
    savedAsDraft: d.saved_as_draft,
    inv: {
      id: d.id, customerName: d.customer_name, customerAddress: d.customer_address, invoiceNumber: d.quotation_number,
      invoiceDate: d.quotation_date, sellerName: d.seller_name, currency: d.currency,
      discountType: d.discount_type === "fixed" ? "fixed" : "percent", discountValue: d.discount_value, shipping: d.shipping,
      otherLabel: d.other_label, otherCharges: d.other_charges, showSecondary: d.show_secondary,
      secondaryCurrency: d.secondary_currency, exchangeRate: d.exchange_rate, terms: d.terms,
      company: await withLogoUrl(d.company as unknown as CompanyInfo | null),
      rows: rows.filter((r) => r.quotation_id === d.id).map((r) => rowFromDb(r as QRow)),
      updatedAt: new Date(d.updated_at).getTime(),
    } as Invoice,
  })));
}

export async function saveQuotation(inv: Invoice, expected: number, markDraft: boolean) {
  const { rows, ...q } = inv;
  const company = await normaliseCompany(q.company);
  const { data, error } = await db().rpc("save_quotation", {
    p_q: JSON.parse(JSON.stringify({ ...q, company: company ?? null })), p_rows: JSON.parse(JSON.stringify(rows)),
    p_expected: expected, p_mark_draft: markDraft,
  });
  if (error) {
    if (error.code === "P0409" || error.code === "23505" || /conflict/i.test(error.message)) return { conflict: true as const };
    throw new Error(error.message);
  }
  return { version: data as number, company: await withLogoUrl(company) };
}

export async function getSetting<T>(key: string): Promise<T | null> {
  const { data, error } = await db().from("app_settings").select("value").eq("key", key).maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.value as T) ?? null;
}
export async function setSetting(key: string, value: unknown) {
  const { error } = await db().from("app_settings").upsert({ key, value: JSON.parse(JSON.stringify(value)), updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}
