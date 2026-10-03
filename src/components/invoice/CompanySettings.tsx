import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, ImageUp, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import defaultLogo from "@/assets/lepdo-logo.jpg";
import { COMPANY, termsList, type CompanyInfo } from "@/lib/invoice";

export function CompanySettings({ open, onOpenChange, company, terms, onApplyHere, onSaveDefault }: {
  open: boolean; onOpenChange: (o: boolean) => void; company: CompanyInfo; terms: string;
  onApplyHere: (c: CompanyInfo, terms: string) => void; onSaveDefault: (c: CompanyInfo, terms: string) => void;
}) {
  const [c, setC] = useState(company);
  const [notes, setNotes] = useState<string[]>(termsList(terms));
  useEffect(() => { if (open) { setC(company); setNotes(termsList(terms)); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k: keyof CompanyInfo, v: string) => setC((p) => ({ ...p, [k]: v }));
  const out = () => notes.map((n) => n.trim()).filter(Boolean).join("\n");
  const move = (i: number, d: number) => setNotes((ns) => { const j = i + d; if (j < 0 || j >= ns.length) return ns; const x = [...ns]; [x[i], x[j]] = [x[j]!, x[i]!]; return x; });

  const upload = (f: File | undefined) => {
    if (!f || !f.type.startsWith("image/")) return;
    const r = new FileReader();
    r.onload = () => {
      const src = r.result as string;
      const img = new Image();
      img.onload = () => {
        // Normalise to PNG so the PDF can embed any uploaded format sharply
        const cv = document.createElement("canvas");
        cv.width = img.naturalWidth; cv.height = img.naturalHeight;
        cv.getContext("2d")!.drawImage(img, 0, 0);
        setC((p) => ({ ...p, logo: cv.toDataURL("image/png"), logoW: img.naturalWidth, logoH: img.naturalHeight }));
      };
      img.src = src;
    };
    r.readAsDataURL(f);
  };

  const field = (label: string, k: keyof CompanyInfo, inputMode?: "tel" | "url") => (
    <div className="space-y-1"><Label className="text-xs text-muted-foreground">{label}</Label>
      <Input inputMode={inputMode} type={inputMode ?? "text"} value={String(c[k] ?? "")} onChange={(e) => set(k, e.target.value)} /></div>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="font-display text-2xl text-navy">Company Details & Notes</SheetTitle>
          <SheetDescription>Shown on the quotation header, footer and notes.</SheetDescription>
        </SheetHeader>
        <div className="space-y-6 px-4 pb-4">
          <section className="space-y-3">
            <h3 className="border-b border-border pb-1 font-display text-lg font-semibold text-navy">Logo</h3>
            <div className="flex items-center gap-3">
              <div className="grid h-20 w-36 place-items-center rounded-md border border-border bg-paper p-2">
                <img src={c.logo || defaultLogo} alt="Logo" className="max-h-full max-w-full object-contain" />
              </div>
              <div className="flex flex-col gap-2">
                <Button asChild size="sm" variant="outline"><label className="cursor-pointer"><ImageUp /> {c.logo ? "Replace logo" : "Upload logo"}
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => upload(e.target.files?.[0])} /></label></Button>
                {c.logo && <Button size="sm" variant="ghost" onClick={() => setC((p) => ({ ...p, logo: "", logoW: COMPANY.logoW, logoH: COMPANY.logoH }))}><RotateCcw /> Original logo</Button>}
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="border-b border-border pb-1 font-display text-lg font-semibold text-navy">Company</h3>
            {field("Company name", "name")}
            <div className="grid gap-3 sm:grid-cols-2">{field("IEC", "iec")}{field("GSTIN", "gstin")}</div>
            <div className="grid gap-3 sm:grid-cols-2">{field("Mobile number", "mobile", "tel")}{field("Website", "website", "url")}</div>
            {field("India address", "address1")}
            {field("USA address", "address2")}
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between border-b border-border pb-1">
              <h3 className="font-display text-lg font-semibold text-navy">Quotation notes</h3>
              <Button size="sm" variant="outline" onClick={() => setNotes((n) => [...n, ""])}><Plus /> Add note</Button>
            </div>
            {notes.length === 0 && <p className="text-sm text-muted-foreground">No notes yet.</p>}
            {notes.map((n, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="pt-2 text-sm font-bold text-navy">{i + 1}.</span>
                <Textarea rows={2} value={n} className="text-sm" onChange={(e) => setNotes((ns) => ns.map((x, k) => (k === i ? e.target.value.replace(/\n/g, " ") : x)))} />
                <div className="flex flex-col">
                  <IB label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="h-3.5 w-3.5" /></IB>
                  <IB label="Move down" disabled={i === notes.length - 1} onClick={() => move(i, 1)}><ArrowDown className="h-3.5 w-3.5" /></IB>
                  <IB label="Delete note" onClick={() => setNotes((ns) => ns.filter((_, k) => k !== i))}><Trash2 className="h-3.5 w-3.5" /></IB>
                </div>
              </div>
            ))}
          </section>

          <section className="space-y-3">
            <h3 className="border-b border-border pb-1 font-display text-lg font-semibold text-navy">Thank-you message</h3>
            <p className="text-xs text-muted-foreground">Shown once, centred above the footer on the final page.</p>
            {field("Line 1", "thanks1")}
            {field("Line 2", "thanks2")}
          </section>

          <div className="sticky bottom-0 pb-[env(safe-area-inset-bottom)] grid gap-2 border-t border-border bg-background pt-3 sm:grid-cols-2">
            <Button variant="outline" onClick={() => onApplyHere(c, out())}>Apply to This Quotation Only</Button>
            <Button className="bg-gold text-navy hover:bg-gold/90" onClick={() => onSaveDefault(c, out())}>Save as Default</Button>
            <p className="text-xs text-muted-foreground sm:col-span-2">“Save as Default” is used for new quotations and also applied here. Saved drafts keep their own details.</p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function IB({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return <button aria-label={label} title={label} disabled={disabled} onClick={onClick} className="rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-navy disabled:opacity-30">{children}</button>;
}
