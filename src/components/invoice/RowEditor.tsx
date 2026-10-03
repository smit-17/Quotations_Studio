import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { combineCert, combineCps, fmtCt, fmtNum, rowCalc, type DiamondRow } from "@/lib/invoice";
import { Combo } from "./Combo";
import type { OptionKey } from "@/lib/options";

type Patch = (patch: Partial<DiamondRow>) => void;

/** Shared change logic: keeps combined Cut/Pol/Sym + Certificate text and Stone→Type N/A behaviour. */
const comboPatch = (row: DiamondRow, k: keyof DiamondRow, v: string): Partial<DiamondRow> => {
  const n = { ...row, [k]: v };
  if (k === "stone") return { stone: v, ...(v === "Moissanite" || v === "Gemstone" || v === "Natural Diamond" ? { type: "N/A" } : v === "Lab-Grown Diamond" && row.type === "N/A" ? { type: "" } : {}) };
  if (k === "cut" || k === "polish" || k === "symmetry") return { [k]: v, cps: combineCps(n) };
  if (k === "certLab" || k === "certNo") return { [k]: v, certificate: combineCert(n) };
  return { [k]: v };
};
const wtValue = (row: DiamondRow) => (row.totalWt === undefined ? (rowCalc(row).totalWt ? String(rowCalc(row).totalWt) : "") : row.totalWt);

/** Mobile / tablet: all fields editable directly inside the card. */
export function RowCardEditor({ row, currency, onChange }: { row: DiamondRow; currency: string; onChange: Patch }) {
  const c = rowCalc(row);
  const F = (label: string, k: keyof DiamondRow, p: React.ComponentProps<typeof Input> = {}) => (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input value={k === "totalWt" ? wtValue(row) : (row[k] as string) ?? ""} onChange={(e) => onChange(comboPatch(row, k, e.target.value))} {...p} />
    </div>
  );
  const C = (label: string, k: keyof DiamondRow, group: OptionKey) => (
    <Combo label={label} group={group} value={(row[k] as string) ?? ""} onChange={(v) => onChange(comboPatch(row, k, v))} />
  );
  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">{F("Description", "description", { id: `desc-${row.id}`, placeholder: "Round brilliant solitaire" })}</div>
      <div className="sm:col-span-2">{F("Product link (optional)", "link", { type: "url", inputMode: "url", placeholder: "https://…" })}</div>
      {C("HSN Code", "hsn", "hsn")}
      {C("Stone", "stone", "stone")}
      {C("Type", "type", "type")}
      {C("Shape", "shape", "shape")}
      <div className="grid grid-cols-[1fr_96px] gap-2">
        {F("Size", "size", { type: "number", inputMode: "decimal", step: "0.01", min: 0 })}
        {C("Unit", "sizeUnit", "sizeUnit")}
      </div>
      {C("Colour", "colour", "colour")}
      {C("Clarity", "clarity", "clarity")}
      {C("Fluorescence", "fluorescence", "fluorescence")}
      <div className="grid grid-cols-3 gap-2 sm:col-span-2">
        {C("Cut", "cut", "cut")}{C("Polish", "polish", "polish")}{C("Symmetry", "symmetry", "symmetry")}
      </div>
      {C("Certificate Lab", "certLab", "certLab")}
      {F("Certificate Number", "certNo")}
      <div className="grid grid-cols-2 gap-2 sm:col-span-2">
        {F("Weight per Piece (ct) — reference only", "wtPerPcs", { type: "number", inputMode: "decimal", step: "0.0001", min: 0 })}
        {F("Total Pieces", "pcs", { type: "number", inputMode: "numeric", step: "1", min: 1 })}
        {F("Total Weight (ct)", "totalWt", { type: "number", inputMode: "decimal", step: "0.0001", min: 0, placeholder: "Enter total carats" })}
        {F(`Price per Carat (${currency})`, "pricePerCt", { type: "number", inputMode: "decimal", step: "0.01", min: 0 })}
      </div>
      <div className="rounded-md bg-navy px-3 py-2 text-center text-sm text-primary-foreground sm:col-span-2" aria-live="polite">
        {fmtCt(c.totalWt)} ct × {currency} {fmtNum(parseFloat(row.pricePerCt) || 0)}/ct = <b className="text-gold">{currency} {fmtNum(c.amount)}</b>
      </div>
    </div>
  );
}

const cellIn = "h-8 px-1.5 text-xs";
/** Desktop: inline cells for one table row (excluding Sr. and action cells). */
export function RowCells({ row, onChange }: { row: DiamondRow; onChange: Patch }) {
  const c = rowCalc(row);
  const I = (k: keyof DiamondRow, label: string, p: React.ComponentProps<typeof Input> = {}) => (
    <Input aria-label={label} value={k === "totalWt" ? wtValue(row) : (row[k] as string) ?? ""} onChange={(e) => onChange(comboPatch(row, k, e.target.value))} className={cellIn} {...p} />
  );
  const C = (k: keyof DiamondRow, label: string, group: OptionKey) => (
    <Combo ariaLabel={label} group={group} placeholder="—" value={(row[k] as string) ?? ""} onChange={(v) => onChange(comboPatch(row, k, v))} className={cellIn} />
  );
  const num = (step: string) => ({ type: "number", step, min: 0, inputMode: "decimal" as const, className: `${cellIn} text-right` });
  return (
    <>
      <td className="p-1"><div className="space-y-1">{I("description", "Description", { id: `desc-${row.id}`, placeholder: "Description" })}{I("link", "Product link", { type: "url", placeholder: "https://… (link)" })}</div></td>
      <td className="p-1">{C("hsn", "HSN Code", "hsn")}</td>
      <td className="p-1">{C("stone", "Stone", "stone")}</td>
      <td className="p-1">{C("type", "Type", "type")}</td>
      <td className="p-1">{C("shape", "Shape", "shape")}</td>
      <td className="p-1"><div className="flex gap-1">{I("size", "Size", num("0.01"))}<div className="w-16 shrink-0">{C("sizeUnit", "Size unit", "sizeUnit")}</div></div></td>
      <td className="p-1">{C("colour", "Colour", "colour")}</td>
      <td className="p-1">{C("clarity", "Clarity", "clarity")}</td>
      <td className="p-1"><div className="grid grid-cols-3 gap-1">{C("cut", "Cut", "cut")}{C("polish", "Polish", "polish")}{C("symmetry", "Symmetry", "symmetry")}</div></td>
      <td className="p-1"><div className="space-y-1">{C("certLab", "Certificate lab", "certLab")}{I("certNo", "Certificate number", { placeholder: "Cert no." })}</div></td>
      <td className="p-1">{C("fluorescence", "Fluorescence", "fluorescence")}</td>
      <td className="p-1">{I("wtPerPcs", "Weight per piece (reference)", num("0.0001"))}</td>
      <td className="p-1">{I("pcs", "Total pieces", { ...num("1"), inputMode: "numeric", min: 1 })}</td>
      <td className="p-1">{I("totalWt", "Total weight (ct)", num("0.0001"))}</td>
      <td className="p-1">{I("pricePerCt", "Price per carat", num("0.01"))}</td>
      <td className="px-2 text-right font-bold text-navy">{fmtNum(c.amount)}</td>
    </>
  );
}
