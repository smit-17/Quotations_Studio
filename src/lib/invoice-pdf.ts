import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import logoUrl from "@/assets/lepdo-logo.jpg";
import {
  COL_HEADS, COL_WIDTHS, PAGE, companyOf, logoBox, validUrl, websiteUrl, fmtCt, docTitle, fmtDate, fmtMoney, fmtNum, invoiceCalc, paginate, rowCalc, sizeText,
  summaryLines, termsList, NOTES_W, NOTE_LH, noteLines, type Invoice,
} from "./invoice";

type RGB = [number, number, number];
const NAVY: RGB = [45, 45, 97];
const GOLD: RGB = [226, 174, 64];
const TOTAL_BG: RGB = [232, 236, 244];
const INK: RGB = [30, 41, 59];
const MUTED: RGB = [110, 112, 135];
const STRIPE: RGB = [246, 247, 250];
const LINE: RGB = [226, 229, 236];
const { W, H, M, headerH, contHeaderH } = PAGE;
const LINK: RGB = [29, 78, 216];

async function toDataUrl(url: string) {
  const blob = await (await fetch(url)).blob();
  return new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
}

export function pdfFileName(inv: Invoice) {
  const clean = (s: string) => s.trim().replace(/[^a-z0-9-]+/gi, "_").replace(/^_+|_+$/g, "") || "Untitled";
  return `LEPDO_Quotation_${clean(inv.invoiceNumber)}_${clean(inv.customerName)}.pdf`;
}

export async function exportInvoicePdf(inv: Invoice): Promise<string> {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const co = companyOf(inv);
  const logo = co.logo ? (co.logo.startsWith("data:") ? co.logo : await toDataUrl(co.logo)) : await toDataUrl(logoUrl);
  const lb = logoBox(co);
  const logoFmt = /^data:image\/png/i.test(logo) ? "PNG" : "JPEG";
  const t = invoiceCalc(inv);
  const { pages, summarySeparate } = paginate(inv);

  const txt = (s: string, x: number, y: number, size: number, color: RGB, bold = false, align: "left" | "right" | "center" = "left") => {
    doc.setCharSpace(0); doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setFontSize(size); doc.setTextColor(...color);
    doc.text(s, x, y, { align });
  };
  const hair = (x1: number, y: number, x2: number, color: RGB, w: number) => { doc.setDrawColor(...color); doc.setLineWidth(w); doc.line(x1, y, x2, y); };
  const contHeader = () => {
    txt(`${co.name} · Quotation ${inv.invoiceNumber}${inv.customerName ? ` · ${inv.customerName}` : ""}`, M, M + 4, 9, NAVY, true);
    txt("Continued", W - M, M + 4, 7.5, MUTED, false, "right");
    hair(M, M + 7, W - M, GOLD, 0.3);
  };

  // ---- Page 1 header ----
  doc.addImage(logo, logoFmt, W / 2 - lb.w / 2, M, lb.w, lb.h, undefined, "NONE");
  txt("IEC", M, 17, 6.5, GOLD, true); txt("GSTIN", M, 26, 6.5, GOLD, true);
  txt("MOBILE", W - M, 17, 6.5, GOLD, true, "right"); txt("OFFICES", W - M, 28.5, 6.5, GOLD, true, "right");
  txt(co.iec, M, 21, 8.5, INK); txt(co.gstin, M, 30, 8.5, INK);
  txt(co.mobile, W - M, 21, 8.5, INK, false, "right");
  const site = (co.website ?? "").trim(), siteUrl = websiteUrl(site);
  if (site) {
    txt(site, W - M, 24.6, 7.5, NAVY, false, "right");
    if (siteUrl) { doc.setFontSize(7.5); const sw = doc.getTextWidth(site); doc.link(W - M - sw, 22.2, sw, 3.2, { url: siteUrl }); }
  }
  txt(co.address1, W - M, 32.3, 7.5, MUTED, false, "right");
  txt(co.address2, W - M, 35.8, 7.5, MUTED, false, "right");

  txt(docTitle(inv), W / 2, 41, 13, NAVY, true, "center");
  doc.setFillColor(...GOLD); doc.rect(W / 2 - 10, 43.5, 20, 0.4, "F");

  doc.setFillColor(...GOLD); doc.rect(M, 47, W - 2 * M, 0.4, "F");
  txt("PREPARED FOR", M, 51, 6.5, GOLD, true);
  txt(inv.customerName || "-", M, 56.5, 13, NAVY, true);
  const addr = inv.customerAddress.split("\n").flatMap((l) => (l.length > 70 ? l.match(/.{1,70}(\s|$)/g) ?? [l] : [l])).slice(0, 3);
  addr.forEach((l, i) => txt(l.trim(), M, 61 + i * 3.6, 8, MUTED));

  txt("Quotation Number", W - M - 100, 52.5, 8, MUTED); txt(inv.invoiceNumber || "-", W - M, 52.8, 11, NAVY, true, "right");
  txt("Quotation Date", W - M - 100, 58, 8, MUTED); txt(fmtDate(inv.invoiceDate) || "-", W - M, 58, 8.5, INK, false, "right");
  txt("Seller", W - M - 100, 63.5, 8, MUTED); txt(inv.sellerName || "-", W - M, 63.5, 8.5, INK, false, "right");

  // ---- Table pages (same chunks as the preview) ----
  const head = [COL_HEADS(inv.currency)];
  let finalY = 0;
  pages.forEach((idx, p) => {
    if (p > 0) { doc.addPage(); contHeader(); }
    const last = p === pages.length - 1;
    const body = idx.map((i) => {
      const r = inv.rows[i]!;
      const c = rowCalc(r);
      return [String(i + 1), r.description, r.hsn, r.stone ?? "", r.type, r.shape ?? "", sizeText(r), r.colour, r.clarity, r.cps, r.certificate, r.fluorescence,
        r.wtPerPcs ? fmtCt(parseFloat(r.wtPerPcs) || 0) : "", String(c.pcs), fmtCt(c.totalWt),
        r.pricePerCt ? fmtNum(parseFloat(r.pricePerCt) || 0) : "", fmtNum(c.amount)];
    });
    autoTable(doc, {
      startY: p === 0 ? M + headerH : M + contHeaderH,
      head, body,
      foot: last ? [[{ content: "TOTAL", colSpan: 13, styles: { halign: "left", cellPadding: { left: 3, top: 2, bottom: 2, right: 1.5 } } }, String(t.pcs), fmtCt(t.carats), "", fmtNum(t.subtotal)]] : [],
      showHead: "everyPage", showFoot: "lastPage",
      margin: { left: M, right: M, top: M + contHeaderH, bottom: PAGE.footerH },
      theme: "grid", tableWidth: W - 2 * M,
      styles: { font: "helvetica", fontSize: 7, textColor: INK, cellPadding: { top: 2, bottom: 2, left: 1.5, right: 1.5 }, lineColor: LINE, lineWidth: 0.2, halign: "center", valign: "middle", overflow: "linebreak", minCellHeight: 7 },
      headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 6.5, lineColor: NAVY, minCellHeight: PAGE.theadH, cellPadding: { top: 1.5, bottom: 1.5, left: 1, right: 1 } },
      footStyles: { fillColor: TOTAL_BG, textColor: NAVY, fontStyle: "bold", lineColor: LINE, minCellHeight: PAGE.tfootH },
      bodyStyles: { fillColor: [255, 255, 255] },
      alternateRowStyles: { fillColor: STRIPE },
      columnStyles: Object.fromEntries(COL_WIDTHS.map((w, i) => [i, { cellWidth: w, ...(i === 1 ? { halign: "left" as const } : {}), ...(i === 0 || i === 16 ? { fontStyle: "bold" as const, textColor: NAVY } : {}) }])),
      rowPageBreak: "avoid",
      didParseCell: (d) => {
        if (d.section === "foot" && (d.column.index === 13 || d.column.index === 14)) d.cell.styles.fontSize = 8.5;
        if (d.section === "body" && d.column.index === 1) {
          d.cell.styles.valign = "top";
          if (validUrl(inv.rows[idx[d.row.index]!]?.link ?? "")) d.cell.text = [...d.cell.text, " "];
        }
        if (d.section === "body" && d.row.index >= 0) {
          const ri = idx[d.row.index]!;
          d.cell.styles.fillColor = ri % 2 ? STRIPE : [255, 255, 255];
        }
      },
      didDrawCell: (d) => {
        if (d.section === "foot") { doc.setDrawColor(...NAVY); doc.setLineWidth(0.3); doc.line(d.cell.x, d.cell.y, d.cell.x + d.cell.width, d.cell.y); }
        const r = d.section === "body" ? inv.rows[idx[d.row.index]!] : undefined;
        const url = r ? validUrl(r.link) : "";
        if (url && d.column.index === 1) {
          const lh = 7 * 1.15 * 0.3528;
          const y = d.cell.y + 2 + (d.cell.text.length - 1) * lh + 2.3;
          const x = d.cell.x + 1.5;
          doc.setCharSpace(0); doc.setFontSize(6.8); doc.setTextColor(...LINK); doc.setFont("helvetica", "bold");
          const label = "View Diamond";
          doc.text(label, x, y);
          const tw = doc.getTextWidth(label);
          doc.setDrawColor(...LINK); doc.setLineWidth(0.2);
          doc.line(x, y + 0.6, x + tw + 2.6, y + 0.6);
          const ax = x + tw + 0.8, ay = y - 0.2;
          doc.line(ax, ay, ax + 1.6, ay - 1.6); doc.line(ax + 0.5, ay - 1.6, ax + 1.6, ay - 1.6); doc.line(ax + 1.6, ay - 1.6, ax + 1.6, ay - 0.5);
          doc.link(x, y - 2.6, tw + 3, 3.6, { url });
        }
      },
    });
    finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  });

  // ---- Summary & terms ----
  let y0 = finalY + 6;
  if (summarySeparate) { doc.addPage(); contHeader(); y0 = M + contHeaderH; }

  txt("TERMS & NOTES", M, y0 + 3, 8, NAVY, true);
  doc.setFillColor(...GOLD); doc.rect(M, y0 + 4.5, 14, 0.4, "F");
  let ny = y0 + 10;
  termsList(inv.terms).forEach((s, i) => {
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...INK); doc.setLineHeightFactor(NOTE_LH / (7.5 * 0.3528));
    doc.text(`${i + 1}.  ${s}`, M, ny, { maxWidth: NOTES_W });
    ny += noteLines(s, i) * NOTE_LH + 1;
  });
  doc.setLineHeightFactor(1.15);

  const sx = W - M - 95;
  const lines = summaryLines(inv);
  lines.forEach(([k, v], i) => {
    const ly = y0 + i * 6;
    txt(k, sx, ly + 4, 8.5, MUTED); txt(v, W - M, ly + 4, 8.5, INK, false, "right");
    hair(sx, ly + 6, W - M, LINE, 0.2);
  });
  const gy = y0 + lines.length * 6 + 2;
  doc.setFillColor(...NAVY); doc.rect(sx, gy, 95, 10, "F");
  txt("GRAND TOTAL", sx + 4, gy + 6.4, 9.5, [255, 255, 255], true);
  txt(fmtMoney(t.grand, inv.currency), W - M - 4, gy + 6.8, 13, GOLD, true, "right");
  if (inv.showSecondary && t.rate > 0) {
    txt(`Manual rate · 1 ${inv.currency} = ${t.rate} ${inv.secondaryCurrency}`, sx, gy + 15, 7, MUTED);
    txt(fmtMoney(t.converted, inv.secondaryCurrency), W - M, gy + 15, 7, NAVY, true, "right");
  }

  // ---- Footers ----
  const n = doc.getNumberOfPages();
  for (let p = 1; p <= n; p++) {
    doc.setPage(p);
    hair(M, H - 10, W - M, LINE, 0.25);
    txt("Diamond Quotation", M, H - 6, 7, MUTED);
    if (p === n) {
      if (co.thanks1) txt(co.thanks1, W / 2, H - 19, 9, NAVY, true, "center");
      if (co.thanks2) txt(co.thanks2, W / 2, H - 14.3, 8, MUTED, false, "center");
    }
    txt(`Page ${p} of ${n}`, W - M, H - 6, 7, MUTED, false, "right");
  }
  const blob = doc.output("blob");
  const url = URL.createObjectURL(blob);
  try { doc.save(pdfFileName(inv)); } catch { window.open(url, "_blank"); }
  return url;
}
