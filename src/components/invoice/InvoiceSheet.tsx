import type { CSSProperties, ReactNode } from "react";
import logo from "@/assets/lepdo-logo.jpg";
import {
  COL_HEADS, COL_WIDTHS, PAGE, companyOf, logoBox, validUrl, websiteUrl, fmtCt, fmtDate, fmtMoney, fmtNum, invoiceCalc, paginate, rowCalc, sizeText,
  summaryLines, termsList, NOTES_W, NOTE_LH, type Invoice,
} from "@/lib/invoice";

/* All positions in mm and sizes in pt mirror src/lib/invoice-pdf.ts so the preview matches the PDF. */
const { W, H, M, headerH, contHeaderH } = PAGE;
const FONT = "Helvetica, Arial, sans-serif";

/** Position text by its baseline (like jsPDF) */
function T({ x, y, size, align = "left", className = "", style, children }: {
  x: number; y: number; size: number; align?: "left" | "right" | "center"; className?: string; style?: CSSProperties; children: ReactNode;
}) {
  const top = y - size * 0.3528 * 0.78;
  const pos: CSSProperties =
    align === "left" ? { left: `${x}mm` } : align === "right" ? { right: `${W - x}mm` } : { left: `${x}mm`, transform: "translateX(-50%)" };
  return (
    <div className={`absolute whitespace-nowrap leading-none ${className}`} style={{ letterSpacing: 0, fontKerning: "normal", textRendering: "geometricPrecision", top: `${top}mm`, fontSize: `${size}pt`, ...pos, ...style }}>
      {children}
    </div>
  );
}

function Page({ n, total, inv, children }: { n: number; total: number; inv: Invoice; children: ReactNode }) {
  return (
    <div className="sheet relative overflow-hidden bg-paper text-ink shadow-2xl" style={{ height: `${H}mm`, fontFamily: FONT, letterSpacing: 0, WebkitFontSmoothing: "antialiased" }}>
      {n > 1 && (
        <>
          <T x={M} y={M + 4} size={9} className="font-bold text-navy">{companyOf(inv).name} · Quotation {inv.invoiceNumber}{inv.customerName ? ` · ${inv.customerName}` : ""}</T>
          <T x={W - M} y={M + 4} size={7.5} align="right" className="text-muted-foreground">Continued</T>
          <div className="absolute bg-gold" style={{ left: `${M}mm`, right: `${M}mm`, top: `${M + 7}mm`, height: "0.3mm" }} />
        </>
      )}
      {children}
      <div className="absolute bg-border" style={{ left: `${M}mm`, right: `${M}mm`, top: `${H - 10}mm`, height: "0.25mm" }} />
      {n === total && companyOf(inv).thanks1 && <T x={W / 2} y={H - 19} size={9} align="center" className="font-bold text-navy">{companyOf(inv).thanks1}</T>}
      {n === total && companyOf(inv).thanks2 && <T x={W / 2} y={H - 14.3} size={8} align="center" className="text-muted-foreground">{companyOf(inv).thanks2}</T>}
      <T x={M} y={H - 6} size={7} className="text-muted-foreground">Diamond Quotation</T>
      <T x={W - M} y={H - 6} size={7} align="right" className="text-muted-foreground">Page {n} of {total}</T>
    </div>
  );
}

function Header({ inv }: { inv: Invoice }) {
  const co = companyOf(inv);
  const lb = logoBox(co);
  const addr = inv.customerAddress.split("\n").flatMap((l) => (l.length > 70 ? l.match(/.{1,70}(\s|$)/g) ?? [l] : [l])).slice(0, 3);
  const label = "font-bold text-gold";
  return (
    <>
      <img src={co.logo || logo} alt={co.name} className="absolute object-contain" style={{ left: `${W / 2 - lb.w / 2}mm`, top: `${M}mm`, width: `${lb.w}mm`, height: `${lb.h}mm` }} />

      <T x={M} y={17} size={6.5} className={label}>IEC</T>
      <T x={M} y={21} size={8.5}>{co.iec}</T>
      <T x={M} y={26} size={6.5} className={label}>GSTIN</T>
      <T x={M} y={30} size={8.5}>{co.gstin}</T>

      <T x={W - M} y={17} size={6.5} align="right" className={label}>MOBILE</T>
      <T x={W - M} y={21} size={8.5} align="right">{co.mobile}</T>
      {co.website && (websiteUrl(co.website)
        ? <T x={W - M} y={24.6} size={7.5} align="right" className="text-navy"><a href={websiteUrl(co.website)} target="_blank" rel="noopener noreferrer" className="hover:underline">{co.website}</a></T>
        : <T x={W - M} y={24.6} size={7.5} align="right" className="text-navy">{co.website}</T>)}
      <T x={W - M} y={28.5} size={6.5} align="right" className={label}>OFFICES</T>
      <T x={W - M} y={32.3} size={7.5} align="right" className="text-muted-foreground">{co.address1}</T>
      <T x={W - M} y={35.8} size={7.5} align="right" className="text-muted-foreground">{co.address2}</T>

      <T x={W / 2} y={41} size={13} align="center" className="font-bold text-navy">QUOTATION</T>
      <div className="absolute bg-gold" style={{ left: `${W / 2 - 10}mm`, top: `${43.5}mm`, width: "20mm", height: "0.4mm" }} />

      <div className="absolute bg-gold" style={{ left: `${M}mm`, top: "47mm", width: `${W - 2 * M}mm`, height: "0.4mm" }} />
      <T x={M} y={51} size={6.5} className={label}>PREPARED FOR</T>
      <T x={M} y={56.5} size={13} className="font-bold text-navy">{inv.customerName || "-"}</T>
      {addr.map((l, i) => <T key={i} x={M} y={61 + i * 3.6} size={8} className="text-muted-foreground">{l}</T>)}

      <T x={W - M - 100} y={52.5} size={8} className="text-muted-foreground">Quotation Number</T>
      <T x={W - M} y={52.8} size={11} align="right" className="font-bold text-navy">{inv.invoiceNumber || "-"}</T>
      <T x={W - M - 100} y={58} size={8} className="text-muted-foreground">Quotation Date</T>
      <T x={W - M} y={58} size={8.5} align="right">{fmtDate(inv.invoiceDate) || "-"}</T>
      <T x={W - M - 100} y={63.5} size={8} className="text-muted-foreground">Seller</T>
      <T x={W - M} y={63.5} size={8.5} align="right">{inv.sellerName || "-"}</T>
    </>
  );
}

const cell = "border-[0.2mm] border-border align-middle";
const pad: CSSProperties = { padding: "2mm 1.5mm" };

function Table({ inv, idx, showFoot, selectedId, onSelect }: { inv: Invoice; idx: number[]; showFoot: boolean; selectedId?: string | null | undefined; onSelect?: ((id: string) => void) | undefined }) {
  const t = invoiceCalc(inv);
  return (
    <table className="w-full table-fixed border-collapse text-center" style={{ fontSize: "7pt", lineHeight: 1.15 }}>
      <colgroup>{COL_WIDTHS.map((w, i) => <col key={i} style={{ width: `${w}mm` }} />)}</colgroup>
      <thead>
        <tr className="bg-navy text-primary-foreground" style={{ height: `${PAGE.theadH}mm` }}>
          {COL_HEADS(inv.currency).map((h) => (
            <th key={h} className="border-[0.2mm] border-navy font-bold" style={{ fontSize: "6.5pt", padding: "1.5mm 1mm" }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {idx.map((i) => {
          const r = inv.rows[i]!;
          const c = rowCalc(r);
          const bg = r.id === selectedId ? "bg-select" : i % 2 ? "bg-stripe" : "bg-paper";
          return (
            <tr key={r.id} onClick={() => onSelect?.(r.id)} className={`${bg} ${onSelect ? "cursor-pointer" : ""}`}>
              <td className={`${cell} font-bold text-navy`} style={pad}>{i + 1}</td>
              <td className={`${cell} text-left`} style={pad}>
                <span className="block break-words">{r.description}</span>
                {validUrl(r.link) && (
                  <a href={validUrl(r.link)} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
                    className="mt-[0.6mm] inline-block font-bold text-link underline underline-offset-[0.6mm]" style={{ fontSize: "6.8pt" }}>View Diamond ↗</a>
                )}
              </td>
              {[r.hsn, r.stone ?? "", r.type, r.shape ?? "", sizeText(r), r.colour, r.clarity, r.cps, r.certificate, r.fluorescence,
                r.wtPerPcs ? fmtCt(parseFloat(r.wtPerPcs) || 0) : "", String(c.pcs), fmtCt(c.totalWt),
                r.pricePerCt ? fmtNum(parseFloat(r.pricePerCt) || 0) : ""].map((v, k) => (
                <td key={k} className={`${cell} break-words`} style={pad}>{v}</td>
              ))}
              <td className={`${cell} font-bold text-navy`} style={pad}>{fmtNum(c.amount)}</td>
            </tr>
          );
        })}
      </tbody>
      {showFoot && (
        <tfoot>
          <tr className="font-bold text-navy" style={{ height: `${PAGE.tfootH}mm` }}>
            <td className={`${cell} border-t-navy bg-total text-left`} colSpan={13} style={{ ...pad, paddingLeft: "3mm" }}>TOTAL</td>
            <td className={`${cell} border-t-navy bg-total`} style={{ ...pad, fontSize: "8.5pt" }}>{t.pcs}</td>
            <td className={`${cell} border-t-navy bg-total`} style={{ ...pad, fontSize: "8.5pt" }}>{fmtCt(t.carats)}</td>
            <td className={`${cell} border-t-navy bg-total`} />
            <td className={`${cell} border-t-navy bg-total`} style={pad}>{fmtNum(t.subtotal)}</td>
          </tr>
        </tfoot>
      )}
    </table>
  );
}

function Summary({ inv }: { inv: Invoice }) {
  const t = invoiceCalc(inv);
  const lines = summaryLines(inv);
  return (
    <div className="flex justify-between" style={{ marginTop: "6mm" }}>
      <div>
        <p className="font-bold text-navy" style={{ fontSize: "8pt" }}>TERMS & NOTES</p>
        <div className="bg-gold" style={{ width: "14mm", height: "0.4mm", marginTop: "1.2mm" }} />
        <ol style={{ marginTop: "2.4mm", fontSize: "7.5pt", lineHeight: `${NOTE_LH}mm`, width: `${NOTES_W}mm` }}>
          {termsList(inv.terms).map((s, i) => <li key={i} style={{ marginBottom: "1mm" }}>{i + 1}.&nbsp; {s}</li>)}
        </ol>
      </div>
      <div style={{ width: "95mm", fontSize: "8.5pt" }}>
        {lines.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between border-b-[0.2mm] border-border" style={{ height: "6mm" }}>
            <span className="text-muted-foreground">{k}</span><span>{v}</span>
          </div>
        ))}
        <div className="flex items-center justify-between bg-navy" style={{ height: "10mm", padding: "0 4mm", marginTop: "2mm" }}>
          <span className="font-bold text-primary-foreground" style={{ fontSize: "9.5pt" }}>GRAND TOTAL</span>
          <span className="font-bold text-gold" style={{ fontSize: "13pt" }}>{fmtMoney(t.grand, inv.currency)}</span>
        </div>
        {inv.showSecondary && t.rate > 0 && (
          <div className="flex justify-between" style={{ marginTop: "3mm", fontSize: "7pt" }}>
            <span className="text-muted-foreground">Manual rate · 1 {inv.currency} = {t.rate} {inv.secondaryCurrency}</span>
            <span className="font-bold text-navy">{fmtMoney(t.converted, inv.secondaryCurrency)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export function InvoiceSheet({ inv, selectedId, onSelect }: { inv: Invoice; selectedId?: string | null; onSelect?: (id: string) => void }) {
  const { pages, summarySeparate, total } = paginate(inv);
  return (
    <div className="flex flex-col gap-[8mm]">
      {pages.map((idx, p) => {
        const last = p === pages.length - 1;
        return (
          <Page key={p} n={p + 1} total={total} inv={inv}>
            {p === 0 && <Header inv={inv} />}
            <div className="absolute" style={{ left: `${M}mm`, right: `${M}mm`, top: `${p === 0 ? M + headerH : M + contHeaderH}mm` }}>
              <Table inv={inv} idx={idx} showFoot={last} selectedId={selectedId} onSelect={onSelect} />
              {last && !summarySeparate && <Summary inv={inv} />}
            </div>
          </Page>
        );
      })}
      {summarySeparate && (
        <Page n={total} total={total} inv={inv}>
          <div className="absolute" style={{ left: `${M}mm`, right: `${M}mm`, top: `${M + contHeaderH - 6}mm` }}><Summary inv={inv} /></div>
        </Page>
      )}
    </div>
  );
}
