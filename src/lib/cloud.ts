/**
 * Browser-side cloud API. Everything goes through two password-session-checked database
 * functions (app_login / app_call) using the public key, so the app needs no server of its
 * own and runs on any static host (Vercel, Lovable, etc.).
 */
import { createClient } from "@supabase/supabase-js";
import type { CompanyInfo, DiamondRow, Invoice } from "./invoice";

type Defaults = { company: CompanyInfo; terms: string };

const URL = import.meta.env['VITE_SUPABASE_URL'] || "https://qrmskhlrzgfggsealxwz.supabase.co";
const KEY = import.meta.env['VITE_SUPABASE_PUBLISHABLE_KEY'] || "sb_publishable_GDbTOSY8KVIeAIR_Uggigw_yY81YPC3";
const TOKEN_KEY = "lepdo.session";

let _c: ReturnType<typeof createClient> | undefined;
const client = () =>
  (_c ??= createClient(URL, KEY, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (h.get("Authorization") === `Bearer ${KEY}`) h.delete("Authorization");
        h.set("apikey", KEY);
        return fetch(input, { ...init, headers: h });
      },
    },
  }));

const token = () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } };

async function call<T>(action: string, data: unknown = {}): Promise<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: res, error } = await (client().rpc as any)("app_call", { p_token: token(), p_action: action, p_data: data });
  if (error) throw new Error(error.message);
  return res as T;
}

export const checkAccess = async () => (token() ? call<{ authed: boolean }>("check") : { authed: false });

export async function loginFn({ data }: { data: { password: string } }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: r, error } = await (client().rpc as any)("app_login", { p_password: data.password });
  if (error) throw new Error(error.message);
  const res = r as { ok: boolean; token?: string; error?: string };
  if (res.ok && res.token) { localStorage.setItem(TOKEN_KEY, res.token); return { ok: true as const }; }
  return { ok: false as const, error: res.error ?? "Incorrect password" };
}

export async function logoutFn() {
  try { await call("logout"); } finally { localStorage.removeItem(TOKEN_KEY); }
  return { ok: true };
}

/* ---------- Mapping ---------- */
type R = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const s = (v: unknown) => (v == null ? "" : String(v));
function rowFromDb(r: R): DiamondRow {
  const out: DiamondRow = {
    id: s(r.id), description: s(r.description), link: s(r.link), hsn: s(r.hsn), type: s(r.type), size: s(r.size),
    sizeUnit: s(r.size_unit), colour: s(r.colour), clarity: s(r.clarity), cps: s(r.cps), certificate: s(r.certificate),
    fluorescence: s(r.fluorescence), wtPerPcs: s(r.wt_per_pcs), pcs: s(r.pcs), pricePerCt: s(r.price_per_ct),
  };
  const extra: [keyof DiamondRow, unknown][] = [["stone", r.stone], ["shape", r.shape], ["totalWt", r.total_wt], ["cut", r.cut],
    ["polish", r.polish], ["symmetry", r.symmetry], ["certLab", r.cert_lab], ["certNo", r.cert_no]];
  for (const [k, v] of extra) if (v != null) (out as R)[k] = String(v);
  return out;
}
function quoteFromDb(d: R, rows: R[]): { inv: Invoice; version: number; savedAsDraft: boolean } {
  return {
    version: Number(d.version), savedAsDraft: !!d.saved_as_draft,
    inv: {
      id: d.id, customerName: d.customer_name, customerAddress: d.customer_address, invoiceNumber: d.quotation_number, docType: d.doc_type || "Quotation",
      invoiceDate: d.quotation_date, sellerName: d.seller_name, currency: d.currency,
      discountType: d.discount_type === "fixed" ? "fixed" : "percent", discountValue: d.discount_value, shipping: d.shipping,
      otherLabel: d.other_label, otherCharges: d.other_charges, showSecondary: d.show_secondary,
      secondaryCurrency: d.secondary_currency, exchangeRate: d.exchange_rate, terms: d.terms,
      company: (d.company as CompanyInfo | null) ?? undefined,
      rows: rows.filter((r) => r.quotation_id === d.id).map(rowFromDb),
      updatedAt: new Date(String(d.updated_at)).getTime(),
    } as unknown as Invoice,
  };
}

export async function loadWorkspace() {
  const w = await call<{ currentId: string | null; quotations: R[]; rows: R[]; defaults: Defaults | null; options: Record<string, string[]> | null }>("load");
  const all = w.quotations.map((q) => quoteFromDb(q, w.rows));
  const cur = w.currentId ? all.find((q) => q.inv.id === w.currentId) : undefined;
  return {
    current: cur ? { inv: cur.inv, version: cur.version } : null,
    drafts: all.filter((q) => q.savedAsDraft).map((q) => ({ inv: q.inv, version: q.version })),
    defaults: w.defaults,
    options: w.options,
  };
}

export const saveQuotationFn = ({ data }: { data: { inv: Invoice; expected: number; markDraft?: boolean; makeCurrent?: boolean } }) =>
  call<{ conflict: true } | { version: number }>("save", data);

export const setCurrentFn = ({ data }: { data: { id: string; discardId?: string } }) => call("set_current", data);
export const deleteDraftFn = ({ data }: { data: { id: string; isCurrent: boolean } }) => call("delete_draft", data);
export const saveSettingFn = ({ data }: { data: { key: "company_default" | "options"; value: unknown } }) => call("save_setting", data);

/** Logos are kept inline (as image data) inside the company details. */
export async function uploadLogoFn({ data }: { data: { dataUrl: string } }) {
  if (!/^data:image\/(png|jpe?g|webp);base64,/i.test(data.dataUrl)) throw new Error("Unsupported logo format");
  if (data.dataUrl.length > 7_000_000) throw new Error("Logo is larger than 5 MB");
  return { path: undefined, url: data.dataUrl };
}

/** One-time import of data previously kept in this browser. Never overwrites existing cloud records. */
export async function importLocalFn({ data }: { data: { current: Invoice | null; drafts: Invoice[]; defaults: Defaults | null; options: Record<string, string[]> | null } }) {
  const draftIds = new Set(data.drafts.map((d) => d.id));
  const all = [...(data.current ? [data.current] : []), ...data.drafts.filter((d) => d.id !== data.current?.id)];
  const existing = new Set(await call<string[]>("existing_ids", { ids: all.map((q) => q.id) }));
  for (const q of all) if (!existing.has(q.id)) await saveQuotationFn({ data: { inv: q, expected: 0, markDraft: draftIds.has(q.id) } });
  const get = async (key: string) => (await call<{ value: unknown }>("get_setting", { key })).value;
  if (data.current && !(await get("current_quotation_id"))) await call("save_setting", { key: "current_quotation_id", value: data.current.id });
  if (data.defaults && !(await get("company_default"))) await saveSettingFn({ data: { key: "company_default", value: data.defaults } });
  if (data.options && !(await get("options"))) await saveSettingFn({ data: { key: "options", value: data.options } });
  const found = await call<string[]>("existing_ids", { ids: all.map((q) => q.id) });
  return { ok: found.length === all.length, count: all.length };
}
