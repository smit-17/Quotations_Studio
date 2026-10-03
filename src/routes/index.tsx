import { createFileRoute } from "@tanstack/react-router";
import { useDeferredValue, useEffect, useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Cloud, CloudOff, Loader2, Lock, LogOut, Copy, Download, FilePlus, FolderOpen, Maximize2, Menu, Minimize2, ZoomIn, ZoomOut, Expand, ExternalLink, Plus, Printer, RotateCcw, Save, Settings2, SlidersHorizontal, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { InvoiceSheet } from "@/components/invoice/InvoiceSheet";
import { RowCardEditor, RowCells } from "@/components/invoice/RowEditor";
import { CompanySettings } from "@/components/invoice/CompanySettings";
import { ManageOptions } from "@/components/invoice/ManageOptions";
import { Combo } from "@/components/invoice/Combo";
import { OptionsContext, OPTIONS_KEY, defaultOptions, normalizeOptions, readLegacyOptions, type Options } from "@/lib/options";
import { checkAccess, deleteDraftFn, importLocalFn, loadWorkspace, loginFn, logoutFn, saveQuotationFn, saveSettingFn, setCurrentFn, uploadLogoFn } from "@/lib/cloud.functions";
import { fmtCt, fmtDate, fmtMoney, fmtNum, invoiceCalc, migrateStoneRows, newInvoice, newRow, rowCalc, uid, companyOf, builtinDefaults, COMPANY, DEFAULT_TERMS, DEFAULTS_KEY, type CompanyDefaults, type CompanyInfo, type DiamondRow, type Invoice } from "@/lib/invoice";
import logo from "@/assets/lepdo-logo.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "LEPDO Diamond Quotation Studio" },
      { name: "description", content: "Create, preview and export A4 landscape diamond quotations for LEPDO with live totals and PDF export." },
      { property: "og:title", content: "LEPDO Diamond Quotation Studio" },
      { property: "og:description", content: "Live-preview diamond quotations with multi-currency totals and crisp PDF export." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

const CUR_KEY = "lepdo.invoice.current";
const DRAFTS_KEY = "lepdo.invoice.drafts";

type SaveStatus = "saved" | "pending" | "saving" | "error" | "conflict";

function Index() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  useEffect(() => { checkAccess().then((r) => setAuthed(r.authed)).catch(() => setAuthed(false)); }, []);
  if (authed === null) return <Splash />;
  if (!authed) return <LoginScreen onDone={() => setAuthed(true)} />;
  return <Studio onLogout={() => setAuthed(false)} />;
}

function Splash({ text }: { text?: string }) {
  return (
    <div className="grid min-h-screen place-items-center bg-desk">
      <div className="text-center"><img src={logo} alt="LEPDO" className="mx-auto h-14 w-auto animate-pulse" />{text && <p className="mt-4 text-sm text-primary-foreground/70">{text}</p>}</div>
    </div>
  );
}

function LoginScreen({ onDone }: { onDone: () => void }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); if (!pw || busy) return;
    setBusy(true); setErr(null);
    try { const r = await loginFn({ data: { password: pw } }); if (r.ok) onDone(); else { setErr(r.error); setPw(""); } }
    catch { setErr("Could not reach the server — please try again"); }
    finally { setBusy(false); }
  };
  return (
    <div className="grid min-h-screen place-items-center bg-desk px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-xl bg-card p-6 shadow-2xl">
        <img src={logo} alt="LEPDO" className="mx-auto h-12 w-auto" />
        <h1 className="mt-4 text-center font-display text-2xl font-semibold text-navy">Quotation Studio</h1>
        <p className="mt-1 text-center text-sm text-muted-foreground">Enter the access password to continue.</p>
        <div className="mt-5 space-y-1">
          <Label htmlFor="pw" className="text-xs text-muted-foreground">Password</Label>
          <Input id="pw" type="password" autoComplete="current-password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} className="h-11" />
        </div>
        {err && <p role="alert" className="mt-2 text-sm text-destructive">{err}</p>}
        <Button type="submit" disabled={busy || !pw} className="mt-4 h-11 w-full"><Lock /> {busy ? "Checking…" : "Unlock"}</Button>
      </form>
    </div>
  );
}

function Studio({ onLogout }: { onLogout: () => void }) {
  const [inv, setInvState] = useState<Invoice>(() => newInvoice());
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Invoice[]>([]);
  const [defaults, setDefaults] = useState<CompanyDefaults>(builtinDefaults);
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [selected, setSelected] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [draftsOpen, setDraftsOpen] = useState(false);
  const [full, setFull] = useState(false);
  const [busy, setBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [optsOpen, setOptsOpen] = useState(false);
  const [options, setOptionsState] = useState<Options>(defaultOptions);

  /* ---------- Cloud persistence ---------- */
  const invRef = useRef(inv);
  const versions = useRef(new Map<string, number>());
  const dirty = useRef(false);
  const markDraftNext = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inFlight = useRef<Promise<boolean> | null>(null);
  const epoch = useRef(0); // bumped whenever the working quotation is switched/reset; stale saves are ignored
  useEffect(() => { invRef.current = inv; }, [inv]);

  const replaceInv = (n: Invoice) => { invRef.current = n; setInvState(n); };
  const flush = async (): Promise<boolean> => {
    clearTimeout(timer.current);
    while (inFlight.current) await inFlight.current;
    if (!dirty.current && !markDraftNext.current) return true;
    const snap = invRef.current, ep = epoch.current, mark = markDraftNext.current;
    dirty.current = false; markDraftNext.current = false;
    setStatus("saving");
    const p = (async () => {
      try {
        const r = await saveQuotationFn({ data: { inv: snap, expected: versions.current.get(snap.id) ?? 0, markDraft: mark, makeCurrent: true } });
        if ("conflict" in r) { if (ep === epoch.current) setStatus("conflict"); return false; }
        versions.current.set(snap.id, r.version);
        setDrafts((ds) => (mark || ds.some((d) => d.id === snap.id) ? [snap, ...ds.filter((d) => d.id !== snap.id)] : ds));
        if (ep === epoch.current) setStatus(dirty.current ? "pending" : "saved");
        return true;
      } catch {
        if (ep === epoch.current) { dirty.current = true; markDraftNext.current ||= mark; setStatus("error"); }
        return false;
      }
    })();
    inFlight.current = p;
    const ok = await p;
    inFlight.current = null;
    if (ok && dirty.current && ep === epoch.current) timer.current = setTimeout(() => void flush(), 800);
    return ok;
  };
  const schedule = () => { dirty.current = true; setStatus("pending"); clearTimeout(timer.current); timer.current = setTimeout(() => void flush(), 800); };
  const setInv = (fn: Invoice | ((p: Invoice) => Invoice)) => {
    setInvState((p) => { const n = typeof fn === "function" ? fn(p) : fn; invRef.current = n; return n; });
    schedule();
  };

  /** Switch the working quotation. Pending edits of a quotation being replaced are dropped; unsaved (non-draft) ones are deleted. */
  const switchTo = async (next: Invoice, isNew: boolean) => {
    clearTimeout(timer.current);
    const old = invRef.current;
    epoch.current++; dirty.current = false; markDraftNext.current = false;
    while (inFlight.current) await inFlight.current;
    replaceInv(next); setSelected(null); setStatus("saving");
    try {
      if (isNew) {
        const r = await saveQuotationFn({ data: { inv: next, expected: 0, makeCurrent: true } });
        if ("conflict" in r) throw new Error("conflict");
        versions.current.set(next.id, r.version);
      }
      await setCurrentFn({ data: { id: next.id, ...(old.id !== next.id ? { discardId: old.id } : {}) } });
      setStatus("saved");
      return true;
    } catch { dirty.current = true; setStatus("error"); return false; }
  };

  const importLegacy = async () => {
    let cur: string | null = null, ds: string | null = null, def: string | null = null;
    try { cur = localStorage.getItem(CUR_KEY); ds = localStorage.getItem(DRAFTS_KEY); def = localStorage.getItem(DEFAULTS_KEY); } catch { return; }
    const opts = readLegacyOptions();
    if (!cur && !ds && !def && !opts) return;
    const parsedDef = def ? (JSON.parse(def) as Partial<CompanyDefaults>) : null;
    const r = await importLocalFn({ data: {
      current: cur ? migrateStoneRows({ ...newInvoice(), ...(JSON.parse(cur) as Invoice) }) : null,
      drafts: ds ? (JSON.parse(ds) as Invoice[]).map(migrateStoneRows) : [],
      defaults: parsedDef ? { company: { ...COMPANY, ...parsedDef.company }, terms: parsedDef.terms ?? DEFAULT_TERMS } : null,
      options: opts as Record<string, string[]> | null,
    } });
    if (r.ok) {
      [CUR_KEY, DRAFTS_KEY, DEFAULTS_KEY, OPTIONS_KEY].forEach((k) => localStorage.removeItem(k));
      if (r.count) toast.success(`Moved ${r.count} saved quotation${r.count === 1 ? "" : "s"} from this browser to the cloud`);
    }
  };

  const loadAll = async () => {
    setLoaded(false); setLoadError(null);
    clearTimeout(timer.current); epoch.current++; dirty.current = false;
    try {
      await importLegacy();
      const w = await loadWorkspace();
      versions.current.clear();
      w.drafts.forEach((d) => versions.current.set(d.inv.id, d.version));
      const ds = w.drafts.map((d) => migrateStoneRows(d.inv as Invoice));
      setDrafts(ds);
      const defs = (w.defaults as CompanyDefaults | null) ?? builtinDefaults();
      setDefaults(defs);
      const cur = w.current ? migrateStoneRows({ ...newInvoice(defs), ...(w.current.inv as Invoice) }) : null;
      const all = [...ds, ...(cur ? [cur] : [])];
      setOptionsState(normalizeOptions(w.options as Partial<Options> | null, { hsn: all.flatMap((x) => x.rows.map((r) => r.hsn)), seller: all.map((x) => x.sellerName) }));
      if (cur && w.current) { versions.current.set(cur.id, w.current.version); replaceInv(cur); setStatus("saved"); setLoaded(true); }
      else { replaceInv(newInvoice(defs)); setLoaded(true); dirty.current = true; await flush(); }
    } catch (e) {
      console.error(e);
      const still = await checkAccess().then((r) => r.authed).catch(() => true);
      if (!still) { onLogout(); return; }
      setLoadError("Could not load your quotations from the cloud. Check your connection and try again.");
    }
  };
  useEffect(() => { void loadAll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty.current || inFlight.current) { e.preventDefault(); } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  const setOptions = (o: Options) => {
    setOptionsState(o);
    saveSettingFn({ data: { key: "options", value: o } }).catch(() => toast.error("Could not save dropdown options — check your connection and try again"));
  };
  const withUploadedLogo = async (company: CompanyInfo): Promise<CompanyInfo> => {
    if (!company.logo.startsWith("data:")) return company.logo ? company : { ...company, logoPath: undefined };
    const r = await uploadLogoFn({ data: { dataUrl: company.logo } });
    return { ...company, logo: r.url, logoPath: r.path };
  };
  const applyHere = async (company: CompanyInfo, terms: string) => {
    try { const c = await withUploadedLogo(company); setInv((p) => ({ ...p, company: c, terms, updatedAt: Date.now() })); setSettingsOpen(false); toast.success("Applied to this quotation"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not upload the logo"); }
  };
  const saveDefault = async (company: CompanyInfo, terms: string) => {
    try {
      const c = await withUploadedLogo(company);
      await saveSettingFn({ data: { key: "company_default", value: { company: c, terms } } });
      setDefaults({ company: c, terms });
      setInv((p) => ({ ...p, company: c, terms, updatedAt: Date.now() })); setSettingsOpen(false); toast.success("Saved as default for new quotations");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not save — please try again"); }
  };

  const set = <K extends keyof Invoice>(k: K, v: Invoice[K]) => setInv((p) => ({ ...p, [k]: v, updatedAt: Date.now() }));
  const setRows = (fn: (r: DiamondRow[]) => DiamondRow[]) => setInv((p) => ({ ...p, rows: fn(p.rows), updatedAt: Date.now() }));
  const patchRow = (id: string, patch: Partial<DiamondRow>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const addRow = () => { const r = newRow(); setRows((rs) => [...rs, r]); setSelected(r.id); setTimeout(() => document.querySelectorAll<HTMLInputElement>(`#desc-${r.id}`).forEach((el) => { if (el.offsetParent) { el.focus(); el.scrollIntoView({ block: "center" }); } }), 50); };
  const dupRow = (i: number) => setRows((rs) => { const c = [...rs]; const src = rs[i]; if (src) c.splice(i + 1, 0, { ...src, id: uid() }); return c; });
  const move = (i: number, d: number) => setRows((rs) => { const j = i + d; if (j < 0 || j >= rs.length) return rs; const c = [...rs]; const a = c[i]!, b = c[j]!; c[i] = b; c[j] = a; return c; });
  const delRow = (i: number) => {
    const removed = inv.rows[i];
    if (!removed) return;
    setRows((rs) => rs.filter((_, k) => k !== i));
    toast(`Item #${i + 1} deleted`, { action: { label: "Undo", onClick: () => setRows((rs) => { const c = [...rs]; c.splice(i, 0, removed); return c; }) } });
  };

  const saveDraft = async () => {
    markDraftNext.current = true;
    if (await flush()) toast.success("Draft saved to cloud"); else toast.error("Draft not saved — please retry");
  };
  const duplicateCurrent = async () => { if (await switchTo({ ...invRef.current, id: uid(), invoiceNumber: `${invRef.current.invoiceNumber}-COPY`, rows: invRef.current.rows.map((r) => ({ ...r })), updatedAt: Date.now() }, true)) toast.success("Duplicated — now editing the copy"); };
  const newInv = async () => { if (await switchTo(newInvoice(defaults), true)) toast("New quotation started"); };
  const resetForm = async () => { if (await switchTo(newInvoice(defaults), true)) toast("Form reset"); };
  const openDraft = async (d: Invoice) => { setDraftsOpen(false); if (await switchTo(d, false)) toast.success(`Loaded ${d.invoiceNumber}`); };
  const deleteDraft = async (d: Invoice) => {
    try { await deleteDraftFn({ data: { id: d.id, isCurrent: d.id === invRef.current.id } }); setDrafts((ds) => ds.filter((x) => x.id !== d.id)); }
    catch { toast.error("Could not delete the draft — please retry"); }
  };
  const logout = async () => {
    if (dirty.current) await flush();
    try { await logoutFn(); } catch { /* ignore */ }
    onLogout();
  };

  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const deferredInv = useDeferredValue(inv);
  const downloadPdf = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { exportInvoicePdf } = await import("@/lib/invoice-pdf");
      const url = await exportInvoicePdf(inv);
      setPdfUrl((old) => { if (old) URL.revokeObjectURL(old); return url; });
      toast.success("PDF ready", { action: { label: "Open PDF", onClick: () => window.open(url, "_blank") } });
    }
    catch (e) { console.error(e); toast.error("Could not create the PDF — please try again"); }
    finally { setBusy(false); }
  };

  if (loadError) return (
    <div className="grid min-h-screen place-items-center bg-desk px-4 text-center">
      <div className="max-w-sm rounded-xl bg-card p-6"><CloudOff className="mx-auto h-8 w-8 text-destructive" /><p className="mt-3 text-sm">{loadError}</p>
        <Button className="mt-4" onClick={() => void loadAll()}><RotateCcw /> Try again</Button></div>
    </div>
  );
  if (!loaded) return <Splash text="Loading your quotations…" />;

  const t = invoiceCalc(inv);

  return (
    <OptionsContext.Provider value={{ options, setOptions }}>
    <div className="min-h-screen max-lg:overflow-x-clip">
      {/* Editor */}
      <div className="no-print bg-card">
        <header className="sticky top-0 z-20 bg-navy pt-[env(safe-area-inset-top)]">
          <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
            <img src={logo} alt="LEPDO" className="h-9 w-auto shrink-0" />
            <div className="min-w-0 leading-tight max-[359px]:hidden">
              <p className="font-display text-xl font-semibold text-gold-gradient">Quotation Studio</p>
              <SaveBadge status={status} onRetry={() => void flush()} onReload={() => void loadAll()} />
            </div>
            <Button variant="secondary" className="ml-auto lg:hidden" onClick={() => setMenuOpen(true)} aria-label="Open menu"><Menu /> Menu</Button>
            <div className="ml-auto hidden grid-cols-7 gap-1.5 lg:grid">
              <Tool icon={FilePlus} label="New" onClick={newInv} />
              <Tool icon={Save} label="Save draft" onClick={saveDraft} />
              <Tool icon={FolderOpen} label={`Drafts (${drafts.length})`} onClick={() => setDraftsOpen(true)} />
              <Tool icon={Copy} label="Duplicate" onClick={duplicateCurrent} />
              <Tool icon={Settings2} label="Company & Notes" onClick={() => setSettingsOpen(true)} />
              <Tool icon={SlidersHorizontal} label="Dropdown Options" onClick={() => setOptsOpen(true)} />
              <Tool icon={LogOut} label="Log out" onClick={() => void logout()} />
            </div>
          </div>
          <div className="gold-rule h-0.5" />
        </header>

        <div className="mx-auto max-w-[1600px] space-y-8 px-4 py-6 sm:px-6">
          <div className="grid gap-8 md:grid-cols-2">
            <Section title="Customer">
              <Field label="Customer name"><Input value={inv.customerName} onChange={(e) => set("customerName", e.target.value)} /></Field>
              <Field label="Billing / shipping address"><Textarea rows={3} value={inv.customerAddress} onChange={(e) => set("customerAddress", e.target.value)} /></Field>
            </Section>

            <Section title="Quotation details">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Quotation Number"><Input value={inv.invoiceNumber} onChange={(e) => set("invoiceNumber", e.target.value)} /></Field>
                <Field label="Quotation Date"><Input type="date" value={inv.invoiceDate} onChange={(e) => set("invoiceDate", e.target.value)} /></Field>
                <Combo label="Seller" group="seller" value={inv.sellerName} onChange={(v) => set("sellerName", v)} />
                <Combo label="Currency" group="currency" value={inv.currency} onChange={(v) => set("currency", v.toUpperCase())} />
              </div>
            </Section>
          </div>

          <Section title={`Diamonds · ${inv.rows.length}`} action={<div className="hidden gap-2 lg:flex"><Button size="sm" variant="outline" onClick={() => setOptsOpen(true)}><SlidersHorizontal /> Manage Dropdown Options</Button><Button size="sm" onClick={addRow}><Plus /> Add row</Button></div>}>
            {/* Mobile / tablet: cards */}
            <div className="space-y-3 lg:hidden">
              {inv.rows.map((r, i) => {
                const c = rowCalc(r);
                return (
                  <div key={r.id} id={`card-${r.id}`} onFocusCapture={() => setSelected(r.id)} className={`rounded-lg border p-3 ${selected === r.id ? "border-navy/40 bg-select" : "border-border bg-card"}`}>
                    <div className="flex items-center gap-3">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-navy text-sm font-bold text-primary-foreground">{i + 1}</span>
                      <p className="min-w-0 flex-1 truncate font-semibold text-navy">{r.description || <span className="text-muted-foreground">New item</span>}</p>
                      <span className="text-sm font-bold text-navy">{fmtNum(c.amount)}</span>
                    </div>
                    <RowCardEditor row={r} currency={inv.currency} onChange={(p) => patchRow(r.id, p)} />
                    <div className="mt-3 grid grid-cols-4 gap-1">
                      <CardBtn icon={Copy} label="Copy" onMouseDown={(e) => e.preventDefault()} onClick={() => dupRow(i)} />
                      <CardBtn icon={ArrowUp} label="Up" onClick={() => move(i, -1)} disabled={i === 0} />
                      <CardBtn icon={ArrowDown} label="Down" onClick={() => move(i, 1)} disabled={i === inv.rows.length - 1} />
                      <CardBtn icon={Trash2} label="Delete" onClick={() => delRow(i)} danger />
                    </div>
                  </div>
                );
              })}
              <div className="flex flex-wrap justify-between gap-2 rounded-lg bg-total px-3 py-2 text-sm font-bold text-navy">
                <span>TOTAL</span><span>{t.pcs} pcs · {fmtCt(t.carats)} ct · {fmtMoney(t.subtotal, inv.currency)}</span>
              </div>
              <Button className="h-12 w-full" onClick={addRow}><Plus /> Add Diamond</Button>
              <Button variant="outline" className="h-11 w-full" onClick={() => setOptsOpen(true)}><SlidersHorizontal /> Manage Dropdown Options</Button>
            </div>
            <div className="hidden overflow-x-auto rounded-lg border border-border lg:block">
              <table className="w-full min-w-[1900px] text-sm">
                <thead className="bg-navy text-left text-xs text-primary-foreground">
                  <tr>
                    {([["Sr.", 40], ["Description & Link", 200], ["HSN", 100], ["Stone", 150], ["Type", 90], ["Shape", 110], ["Size", 140], ["Colour", 100], ["Clarity", 90], ["Cut / Pol / Sym", 230], ["Certificate", 130], ["Fluor.", 100], ["Wt/Pcs (ct)", 80], ["Pcs", 60], ["Total Wt (ct)", 90], [`Price/Ct`, 90], [`Amount (${inv.currency})`, 100], ["", 150]] as const).map(([h, w], i) => (
                      <th key={i} style={{ minWidth: w }} className={`px-2 py-2 font-semibold ${i >= 12 && i < 17 ? "text-right" : ""}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {inv.rows.map((r, i) => {
                    const c = rowCalc(r);
                    return (
                      <tr key={r.id} id={`row-${r.id}`} onFocusCapture={() => setSelected(r.id)}
                        className={`align-top border-t border-border ${selected === r.id ? "bg-select" : i % 2 ? "bg-stripe" : "bg-card"}`}>
                        <td className="px-2 py-3 font-bold text-navy">{i + 1}</td>
                        <RowCells row={r} onChange={(p) => patchRow(r.id, p)} />
                        <td className="px-1">
                          <div className="flex justify-end gap-0.5">
                            <IconBtn icon={Copy} label="Duplicate" onMouseDown={(e) => e.preventDefault()} onClick={() => dupRow(i)} />
                            <IconBtn icon={ArrowUp} label="Move up" onClick={() => move(i, -1)} disabled={i === 0} />
                            <IconBtn icon={ArrowDown} label="Move down" onClick={() => move(i, 1)} disabled={i === inv.rows.length - 1} />
                            <IconBtn icon={Trash2} label="Delete" onClick={() => delRow(i)} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-navy/30 bg-total font-bold text-navy">
                    <td className="px-2 py-2" colSpan={13}>TOTAL</td>
                    <td className="px-2 text-right">{t.pcs}</td>
                    <td className="px-2 text-right">{fmtCt(t.carats)}</td>
                    <td />
                    <td className="px-2 text-right">{fmtNum(t.subtotal)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </Section>

          <div className="grid gap-8 lg:grid-cols-2">
            <Section title="Summary">
              <div className="grid grid-cols-[1fr_auto] items-end gap-2">
                <Field label="Discount"><Input type="number" inputMode="decimal" min={0} value={inv.discountValue} onChange={(e) => set("discountValue", e.target.value)} /></Field>
                <div className="flex rounded-md border border-input p-0.5">
                  {(["percent", "fixed"] as const).map((k) => (
                    <button key={k} onClick={() => set("discountType", k)}
                      className={`rounded px-3 py-1.5 text-xs font-semibold ${inv.discountType === k ? "bg-navy text-primary-foreground" : "text-muted-foreground"}`}>
                      {k === "percent" ? "%" : inv.currency}
                    </button>
                  ))}
                </div>
              </div>
              <Field label="Shipping charges"><Input type="number" inputMode="decimal" min={0} value={inv.shipping} onChange={(e) => set("shipping", e.target.value)} /></Field>
              <div className="grid gap-2 sm:grid-cols-2">
                <Field label="Other charges label"><Input value={inv.otherLabel} onChange={(e) => set("otherLabel", e.target.value)} /></Field>
                <Field label="Amount"><Input type="number" inputMode="decimal" min={0} value={inv.otherCharges} onChange={(e) => set("otherCharges", e.target.value)} /></Field>
              </div>
              <div className="rounded-lg bg-navy p-4 text-primary-foreground">
                <Row k="Subtotal" v={fmtMoney(t.subtotal, inv.currency)} />
                {t.discount > 0 && <Row k="Discount" v={`- ${fmtMoney(t.discount, inv.currency)}`} />}
                <div className="gold-rule my-2 h-px" />
                <div className="flex items-baseline justify-between"><span className="text-sm">Grand total</span><span className="font-display text-2xl font-semibold text-gold">{fmtMoney(t.grand, inv.currency)}</span></div>
              </div>
              <label className="flex items-center justify-between text-sm"><span>Show converted total</span><Switch checked={inv.showSecondary} onCheckedChange={(v) => set("showSecondary", v)} /></label>
              {inv.showSecondary && (
                <div className="grid gap-2 sm:grid-cols-2">
                  <Combo label="Target currency" group="currency" value={inv.secondaryCurrency} onChange={(v) => set("secondaryCurrency", v.toUpperCase())} />
                  <Field label={`1 ${inv.currency} = ? ${inv.secondaryCurrency}`}><Input type="number" inputMode="decimal" min={0} step="0.0001" value={inv.exchangeRate} onChange={(e) => set("exchangeRate", e.target.value)} /></Field>
                  <p className="text-xs sm:col-span-2 text-muted-foreground">Manual rate · Converted: <b className="text-foreground">{fmtMoney(t.converted, inv.secondaryCurrency)}</b></p>
                </div>
              )}
            </Section>

            <Section title="Terms & notes" action={<Button size="sm" variant="outline" onClick={() => setSettingsOpen(true)}><Settings2 /> Edit Company Details & Notes</Button>}>
              <Textarea rows={6} value={inv.terms} onChange={(e) => set("terms", e.target.value)} className="text-xs" />
              <p className="text-xs text-muted-foreground">One term per line — numbering is added automatically.</p>
            </Section>
          </div>

          <Button variant="outline" className="w-full sm:w-auto text-destructive" onClick={() => setConfirmReset(true)}><RotateCcw /> Reset form</Button>
        </div>
      </div>

      {/* Preview */}
      <main className={`print-root flex min-w-0 flex-col bg-desk ${full ? "fixed inset-0 z-50 overflow-auto" : ""}`}>
        <div className="no-print mx-auto flex w-full max-w-[1600px] flex-wrap items-center gap-2 border-b border-primary-foreground/10 px-4 py-3 sm:px-6">
          <p className="mr-auto text-xs tracking-widest text-gold max-lg:w-full">A4 LANDSCAPE · LIVE PREVIEW</p>
          <Button size="sm" variant="secondary" className="max-lg:hidden" onClick={() => setFull((f) => !f)}>{full ? <Minimize2 /> : <Maximize2 />}{full ? "Exit" : "Full screen"}</Button>
          <Button size="sm" variant="secondary" className="max-lg:hidden" onClick={() => window.print()}><Printer /> Print</Button>
          <Button size="sm" onClick={downloadPdf} disabled={busy} className="bg-gold text-navy hover:bg-gold/90 max-lg:h-12 max-lg:flex-1 max-lg:text-base"><Download /> {busy ? "Preparing…" : "Download PDF"}</Button>
          {pdfUrl && <Button size="sm" variant="secondary" asChild className="lg:hidden max-lg:h-12"><a href={pdfUrl} target="_blank" rel="noopener noreferrer"><ExternalLink /> Open PDF</a></Button>}
        </div>
        <ScaledPreview>
          <InvoiceSheet inv={deferredInv} selectedId={selected} onSelect={(id) => { setSelected(id); const el = [document.getElementById(`row-${id}`), document.getElementById(`card-${id}`)].find((x) => x?.offsetParent); el?.scrollIntoView({ behavior: "smooth", block: "center" }); }} />
        </ScaledPreview>
      </main>


      <ManageOptions open={optsOpen} onOpenChange={setOptsOpen} />
      <CompanySettings open={settingsOpen} onOpenChange={setSettingsOpen} company={companyOf(inv)} terms={inv.terms} onApplyHere={applyHere} onSaveDefault={saveDefault} />

      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset this quotation?</AlertDialogTitle>
            <AlertDialogDescription>Customer details, all diamond rows, weights, prices, discounts, charges and currency conversion will be cleared. Saved drafts, company details, logos and dropdown options are not affected.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void resetForm()}>Reset</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="right" className="w-[86vw] max-w-sm">
          <SheetHeader><SheetTitle className="font-display text-2xl text-navy">Menu</SheetTitle></SheetHeader>
          <nav className="grid gap-2 px-4">
            {([
              [FilePlus, "New Quotation", newInv],
              [Save, "Save Draft", saveDraft],
              [FolderOpen, `Saved Drafts (${drafts.length})`, () => setDraftsOpen(true)],
              [Copy, "Duplicate", duplicateCurrent],
              [Settings2, "Company & Notes", () => setSettingsOpen(true)],
              [SlidersHorizontal, "Manage Dropdown Options", () => setOptsOpen(true)],
              [LogOut, "Log out", () => void logout()],
            ] as const).map(([I, label, fn]) => (
              <button key={label} onClick={() => { setMenuOpen(false); fn(); }}
                className="flex min-h-12 items-center gap-3 rounded-lg border border-border px-4 text-left font-medium text-navy active:bg-accent">
                <I className="h-5 w-5 shrink-0 text-gold" />{label}
              </button>
            ))}
          </nav>
        </SheetContent>
      </Sheet>

      <Sheet open={draftsOpen} onOpenChange={setDraftsOpen}>
        <SheetContent>
          <SheetHeader><SheetTitle className="font-display text-2xl text-navy">Drafts</SheetTitle></SheetHeader>
          <div className="space-y-2 px-4">
            {drafts.length === 0 && <p className="text-sm text-muted-foreground">No drafts yet. Use “Save draft” to keep a copy.</p>}
            {drafts.map((d) => (
              <div key={d.id} className="flex items-center gap-2 rounded-lg border border-border p-3">
                <button className="min-w-0 flex-1 text-left" onClick={() => void openDraft(d)}>
                  <p className="truncate text-sm font-semibold">{d.invoiceNumber} · {d.customerName || "No customer"}</p>
                  <p className="text-xs text-muted-foreground">{fmtDate(d.invoiceDate)} · {fmtMoney(invoiceCalc(d).grand, d.currency)}</p>
                </button>
                <IconBtn icon={Trash2} label="Delete draft" onClick={() => void deleteDraft(d)} />
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </div>
    </OptionsContext.Provider>
  );
}

function SaveBadge({ status, onRetry, onReload }: { status: SaveStatus; onRetry: () => void; onReload: () => void }) {
  const base = "flex items-center gap-1 text-[11px]";
  if (status === "error") return <button onClick={onRetry} className={`${base} font-semibold text-destructive-foreground underline`}><CloudOff className="h-3 w-3" /> Save failed — Retry</button>;
  if (status === "conflict") return <button onClick={onReload} className={`${base} font-semibold text-gold underline`}><CloudOff className="h-3 w-3" /> Changed on another device — Reload</button>;
  if (status === "saved") return <p className={`${base} text-primary-foreground/70`} role="status"><Cloud className="h-3 w-3" /> Saved to cloud</p>;
  return <p className={`${base} text-primary-foreground/70`} role="status"><Loader2 className="h-3 w-3 animate-spin" /> Saving…</p>;
}

function ScaledPreview({ children }: { children: React.ReactNode }) {
  const wrap = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [s, setS] = useState(1);
  const [h, setH] = useState(0);
  const [w, setW] = useState(0);
  const [overflow, setOverflow] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [zoom, setZoom] = useState(1); // mobile-only viewing zoom; never affects the document itself
  const zoomRef = useRef(1);
  zoomRef.current = zoom;
  const measure = useRef<() => void>(() => {});
  useLayoutEffect(() => {
    const el = wrap.current, i = inner.current;
    if (!el || !i) return;
    measure.current = () => {
      const sheetW = i.offsetWidth;
      const isMobile = window.innerWidth < 1024;
      setMobile(isMobile);
      const avail = el.clientWidth - (isMobile ? 24 : 48);
      const scale = isMobile ? Math.min(1.25, avail / sheetW) * zoomRef.current : Math.max(0.55, Math.min(1.25, avail / sheetW));
      setS(scale); setH(i.offsetHeight * scale); setW(sheetW * scale); setOverflow(sheetW * scale > avail + 1);
    };
    const ro = new ResizeObserver(() => measure.current());
    ro.observe(el); ro.observe(i);
    return () => ro.disconnect();
  }, []);
  useLayoutEffect(() => { measure.current(); }, [zoom]);
  const z = (f: number) => setZoom((v) => Math.min(4, Math.max(1, +(v * f).toFixed(2))));
  return (
    <div className="relative">
      {mobile && (
        <div className="no-print sticky top-[calc(env(safe-area-inset-top)+64px)] z-10 mx-auto flex w-fit items-center gap-1 rounded-full bg-navy/90 p-1 shadow-lg backdrop-blur">
          <Button size="icon" variant="ghost" className="rounded-full text-primary-foreground" aria-label="Zoom out" onClick={() => z(1 / 1.25)} disabled={zoom <= 1}><ZoomOut /></Button>
          <span className="w-12 text-center text-xs font-semibold text-gold">{Math.round(zoom * 100)}%</span>
          <Button size="icon" variant="ghost" className="rounded-full text-primary-foreground" aria-label="Zoom in" onClick={() => z(1.25)} disabled={zoom >= 4}><ZoomIn /></Button>
          <Button size="sm" variant="ghost" className="rounded-full text-primary-foreground" onClick={() => setZoom(1)}><Expand /> Fit</Button>
        </div>
      )}
      <div ref={wrap} className="print-root relative overflow-x-auto p-4 max-lg:overflow-auto max-lg:overscroll-contain max-lg:p-3 sm:p-6" style={mobile && zoom > 1 ? { maxHeight: "80vh" } : undefined}>
        {overflow && !mobile && <p className="no-print mb-2 text-center text-xs text-gold">← Swipe to see the full quotation →</p>}
        <div className="print-scale mx-auto" style={{ width: w || undefined, height: h || undefined }}>
          <div ref={inner} className="print-scale w-max origin-top-left" style={{ transform: `scale(${s})` }}>{children}</div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between border-b border-border pb-1.5">
        <h2 className="font-display text-lg font-semibold text-navy">{title}</h2>{action}
      </div>
      {children}
    </section>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label className="text-xs text-muted-foreground">{label}</Label>{children}</div>;
}
function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
      {options.map((o) => <option key={o}>{o}</option>)}
    </select>
  );
}
function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between text-sm text-primary-foreground/80"><span>{k}</span><span>{v}</span></div>;
}
function Tool({ icon: I, label, onClick }: { icon: React.ElementType; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1 rounded-lg border border-primary-foreground/20 px-2 py-1.5 text-[11px] font-medium text-primary-foreground transition-colors hover:border-gold hover:text-gold">
      <I className="h-4 w-4" />{label}
    </button>
  );
}
function CardBtn({ icon: I, label, onClick, disabled, danger, onMouseDown }: { icon: React.ElementType; label: string; onClick: () => void; disabled?: boolean; danger?: boolean; onMouseDown?: (e: React.MouseEvent) => void }) {
  return (
    <button onClick={onClick} disabled={disabled} aria-label={label} onMouseDown={onMouseDown}
      className={`flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-md border border-border text-[11px] font-medium disabled:opacity-30 ${danger ? "text-destructive" : "text-navy"} active:bg-accent`}>
      <I className="h-4 w-4" />{label}
    </button>
  );
}
function IconBtn({ icon: I, label, onClick, disabled, onMouseDown }: { icon: React.ElementType; label: string; onClick: () => void; disabled?: boolean; onMouseDown?: (e: React.MouseEvent) => void }) {
  return (
    <button aria-label={label} title={label} disabled={disabled} onMouseDown={onMouseDown} onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-navy disabled:opacity-30">
      <I className="h-3.5 w-3.5" />
    </button>
  );
}
