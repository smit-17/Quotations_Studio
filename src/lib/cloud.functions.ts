import { createServerFn } from "@tanstack/react-start";
import type { CompanyInfo, Invoice } from "./invoice";

type Defaults = { company: CompanyInfo; terms: string };
const any = <T,>(d: unknown) => d as T;

export const checkAccess = createServerFn({ method: "GET" }).handler(async () => {
  const { hasSession } = await import("./cloud.server");
  return { authed: await hasSession() };
});

export const loginFn = createServerFn({ method: "POST" })
  .inputValidator((d: { password: string }) => {
    if (typeof d?.password !== "string" || d.password.length < 1 || d.password.length > 200) throw new Error("Invalid password");
    return d;
  })
  .handler(async ({ data }) => (await import("./cloud.server")).login(data.password));

export const logoutFn = createServerFn({ method: "POST" }).handler(async () => {
  await (await import("./cloud.server")).logout();
  return { ok: true };
});

/** Everything the editor needs on open. */
export const loadWorkspace = createServerFn({ method: "GET" }).handler(async () => {
  const c = await import("./cloud.server");
  await c.requireSession();
  const [currentId, defaults, options] = await Promise.all([
    c.getSetting<string>("current_quotation_id"), c.getSetting<Defaults>("company_default"), c.getSetting<Record<string, string[]>>("options"),
  ]);
  const drafts = await c.loadQuotations({ drafts: true });
  const cur = currentId ? (drafts.find((d) => d.inv.id === currentId) ?? (await c.loadQuotations({ ids: [currentId] }))[0]) : undefined;
  return {
    current: cur ?? null,
    drafts: drafts.map((d) => ({ inv: d.inv, version: d.version })),
    defaults: defaults ? { ...defaults, company: (await c.withLogoUrl(defaults.company))! } : null,
    options,
  };
});

export const saveQuotationFn = createServerFn({ method: "POST" })
  .inputValidator((d: { inv: Invoice; expected: number; markDraft?: boolean; makeCurrent?: boolean }) => {
    if (!d?.inv?.id || !Array.isArray(d.inv.rows) || typeof d.expected !== "number") throw new Error("Invalid quotation");
    if (d.inv.rows.length > 1000) throw new Error("Too many rows");
    return d;
  })
  .handler(async ({ data }) => {
    const c = await import("./cloud.server");
    await c.requireSession();
    const r = await c.saveQuotation(data.inv, data.expected, !!data.markDraft);
    if (!("conflict" in r) && data.makeCurrent) await c.setSetting("current_quotation_id", data.inv.id);
    return r;
  });

/** Switch the working quotation; optionally discard the previous one if it was never saved as a draft. */
export const setCurrentFn = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string; discardId?: string }) => any<{ id: string; discardId?: string }>(d))
  .handler(async ({ data }) => {
    const c = await import("./cloud.server");
    await c.requireSession();
    await c.setSetting("current_quotation_id", data.id);
    if (data.discardId && data.discardId !== data.id) await c.db().from("quotations").delete().eq("id", data.discardId).eq("saved_as_draft", false);
    return { ok: true };
  });

export const deleteDraftFn = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string; isCurrent: boolean }) => any<{ id: string; isCurrent: boolean }>(d))
  .handler(async ({ data }) => {
    const c = await import("./cloud.server");
    await c.requireSession();
    const q = data.isCurrent
      ? c.db().from("quotations").update({ saved_as_draft: false }).eq("id", data.id)
      : c.db().from("quotations").delete().eq("id", data.id);
    const { error } = await q;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const saveSettingFn = createServerFn({ method: "POST" })
  .inputValidator((d: { key: "company_default" | "options"; value: unknown }) => {
    if (d?.key !== "company_default" && d?.key !== "options") throw new Error("Invalid setting");
    return d;
  })
  .handler(async ({ data }) => {
    const c = await import("./cloud.server");
    await c.requireSession();
    let value = data.value;
    if (data.key === "company_default") {
      const v = value as Defaults;
      value = { ...v, company: await c.normaliseCompany(v.company) };
    }
    await c.setSetting(data.key, value);
    return { ok: true };
  });

export const uploadLogoFn = createServerFn({ method: "POST" })
  .inputValidator((d: { dataUrl: string }) => {
    if (typeof d?.dataUrl !== "string" || d.dataUrl.length > 8_000_000) throw new Error("Logo too large");
    return d;
  })
  .handler(async ({ data }) => {
    const c = await import("./cloud.server");
    await c.requireSession();
    const path = await c.uploadLogo(data.dataUrl);
    return { path, url: await c.signLogo(path) };
  });

/** One-time import of data previously kept in this browser. Never overwrites existing cloud records. */
export const importLocalFn = createServerFn({ method: "POST" })
  .inputValidator((d: { current: Invoice | null; drafts: Invoice[]; defaults: Defaults | null; options: Record<string, string[]> | null }) => {
    if (!d || !Array.isArray(d.drafts)) throw new Error("Invalid import");
    return d;
  })
  .handler(async ({ data }) => {
    const c = await import("./cloud.server");
    await c.requireSession();
    const draftIds = new Set(data.drafts.map((d) => d.id));
    const all = [...(data.current ? [data.current] : []), ...data.drafts.filter((d) => d.id !== data.current?.id)];
    const existing = new Set((await c.db().from("quotations").select("id").in("id", all.map((q) => q.id))).data?.map((r) => r.id) ?? []);
    for (const q of all) if (!existing.has(q.id)) {
      const r = await c.saveQuotation(q, 0, draftIds.has(q.id));
      if ("conflict" in r) existing.add(q.id);
    }
    if (data.current && !(await c.getSetting("current_quotation_id"))) await c.setSetting("current_quotation_id", data.current.id);
    if (data.defaults && !(await c.getSetting("company_default"))) await c.setSetting("company_default", { ...data.defaults, company: await c.normaliseCompany(data.defaults.company) });
    if (data.options && !(await c.getSetting("options"))) await c.setSetting("options", data.options);
    // Verify every quotation is now present before the browser clears its copy.
    const { data: found } = await c.db().from("quotations").select("id").in("id", all.map((q) => q.id));
    const ok = (found?.length ?? 0) === all.length;
    return { ok, count: all.length };
  });
