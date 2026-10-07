export type DiamondRow = {
  id: string;
  description: string;
  link: string;
  hsn: string;
  stone?: string;
  type: string;
  shape?: string;
  size: string;
  sizeUnit: string;
  colour: string;
  clarity: string;
  cps: string;
  certificate: string;
  fluorescence: string;
  wtPerPcs: string;
  pcs: string;
  pricePerCt: string;
  /** Manually entered total carat weight (not derived from wtPerPcs × pcs) */
  totalWt?: string;
  /** Separate selectors combined into `cps` / `certificate` for the quotation table */
  cut?: string;
  polish?: string;
  symmetry?: string;
  certLab?: string;
  certNo?: string;
};

export type Invoice = {
  id: string;
  customerName: string;
  customerAddress: string;
  invoiceNumber: string;
  docType?: string;
  invoiceDate: string;
  sellerName: string;
  currency: string;
  rows: DiamondRow[];
  discountType: "percent" | "fixed";
  discountValue: string;
  shipping: string;
  otherLabel: string;
  otherCharges: string;
  showSecondary: boolean;
  secondaryCurrency: string;
  exchangeRate: string;
  terms: string;
  /** Company snapshot for this quotation. Missing on older quotations → built-in COMPANY is used. */
  company?: CompanyInfo;
  updatedAt: number;
};

export type CompanyInfo = {
  name: string;
  iec: string;
  gstin: string;
  mobile: string;
  address1: string;
  address2: string;
  /** Data URL of an uploaded logo; empty = original LEPDO logo */
  logo: string;
  /** Storage path of an uploaded logo; `logo` then holds a short-lived signed URL */
  logoPath?: string | undefined;
  logoW: number;
  logoH: number;
  website?: string;
  thanks1?: string;
  thanks2?: string;
};

export const combineCps = (r: DiamondRow) => [r.cut, r.polish, r.symmetry].map((x) => (x ?? "").trim()).filter(Boolean).join(" / ");
export const combineCert = (r: DiamondRow) => [r.certLab, r.certNo].map((x) => (x ?? "").trim()).filter(Boolean).join(" ");
export const websiteUrl = (w: string) => { const t = w.trim(); return t ? validUrl(/^https?:\/\//i.test(t) ? t : `https://${t}`) : ""; };

export const DEFAULT_TERMS = [
  "Kindly arrange 100% advance payment to confirm your order.",
  "Please allow 2–3 business days for preparation after payment is received.",
  "Estimated shipping time is 5–7 business days after dispatch.",
  "Please note that diamond dimensions and carat weight may vary slightly.",
  "We appreciate your understanding regarding any courier or customs delays.",
].join("\n");

export const COMPANY: CompanyInfo = {
  name: "LEPDO",
  logo: "",
  logoW: 1128,
  logoH: 546,
  website: "lepdodiamonds.com",
  thanks1: "Thank you for your trust in LEPDO.",
  thanks2: "Together, we grow through trust, quality and lasting partnerships.",
  iec: "NACPS0875L",
  gstin: "24NACPS0875L1Z2",
  mobile: "+91 9638551535",
  address1: "B-902 Pragati IT PARK - SURAT, INDIA",
  address2: "Elmwood Park, New Jersey, USA",
};

/** Legacy browser keys — read only once to import old local data into the cloud. */
export const DEFAULTS_KEY = "lepdo.company.default";
export type CompanyDefaults = { company: CompanyInfo; terms: string };
export const builtinDefaults = (): CompanyDefaults => ({ company: { ...COMPANY }, terms: DEFAULT_TERMS });
export const companyOf = (inv: Invoice): CompanyInfo => ({ ...COMPANY, ...inv.company });
/** Logo box (mm) fitted inside 44 × 22 keeping proportions */
export const logoBox = (c: CompanyInfo) => {
  const ar = c.logoW > 0 && c.logoH > 0 ? c.logoW / c.logoH : 1128 / 546;
  let w = 44, h = w / ar;
  if (h > 22) { h = 22; w = h * ar; }
  return { w, h };
};
export const validUrl = (u: string) => {
  try { const x = new URL(u.trim()); return x.protocol === "http:" || x.protocol === "https:" ? x.href : ""; } catch { return ""; }
};

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const newRow = (): DiamondRow => ({
  id: uid(),
  description: "",
  link: "",
  hsn: "71023910",
  stone: "Lab-Grown Diamond",
  type: "",
  shape: "",
  size: "",
  sizeUnit: "ct",
  colour: "",
  clarity: "",
  cps: "",
  certificate: "",
  fluorescence: "None",
  wtPerPcs: "",
  pcs: "1",
  totalWt: "",
  pricePerCt: "",
});

export const newInvoice = (d: CompanyDefaults = builtinDefaults()): Invoice => {
  return {
  id: uid(),
  customerName: "",
  customerAddress: "",
  invoiceNumber: `LEP-Q-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`,
  invoiceDate: todayISO(),
  sellerName: "LEPDO",
  currency: "USD",
  rows: [newRow()],
  discountType: "percent",
  discountValue: "",
  shipping: "",
  otherLabel: "Insurance / Certification Fee",
  otherCharges: "",
  showSecondary: false,
  secondaryCurrency: "INR",
  exchangeRate: "",
  terms: d.terms,
  company: d.company,
  updatedAt: Date.now(),
  };
};

const num = (v: string) => {
  const n = parseFloat(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};
export const round = (x: number, d: number) => {
  const f = 10 ** d;
  return Math.round((x + Number.EPSILON) * f) / f;
};

export const rowCalc = (r: DiamondRow) => {
  const pcs = Math.max(1, Math.floor(num(r.pcs)) || 1);
  // Manual Total Weight; older rows saved before this field existed keep their previous weight.
  const totalWt = r.totalWt !== undefined ? round(num(r.totalWt), 4) : round(round(num(r.wtPerPcs), 4) * pcs, 4);
  const amount = round(totalWt * round(num(r.pricePerCt), 2), 2);
  return { pcs, totalWt, amount };
};

export const invoiceCalc = (inv: Invoice) => {
  let pcs = 0, carats = 0, subtotal = 0;
  for (const r of inv.rows) {
    const c = rowCalc(r);
    pcs += c.pcs; carats += c.totalWt; subtotal += c.amount;
  }
  carats = round(carats, 4);
  subtotal = round(subtotal, 2);
  const dv = num(inv.discountValue);
  let discount = inv.discountType === "percent" ? round((subtotal * Math.min(dv, 100)) / 100, 2) : round(dv, 2);
  discount = Math.min(discount, subtotal);
  const shipping = round(num(inv.shipping), 2);
  const other = round(num(inv.otherCharges), 2);
  const grand = round(subtotal - discount + shipping + other, 2);
  const rate = num(inv.exchangeRate);
  const converted = round(grand * rate, 2);
  return { pcs, carats, subtotal, discount, shipping, other, grand, rate, converted };
};

export const fmtMoney = (n: number, cur: string) =>
  `${cur} ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const fmtNum = (n: number, d = 2) =>
  n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
export const fmtCt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

export const fmtDate = (iso: string) => {
  if (!iso) return "";
  const [y = 2000, m = 1, d = 1] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

export const sizeText = (r: DiamondRow) => { const v = (r.size ?? "").trim(); return !v ? "" : /^[\d.]+$/.test(v) ? `${v} ${r.sizeUnit}` : v; };
export const DOC_TYPES = ["Quotation", "Proforma Invoice", "Invoice"] as const;
export const docTitle = (inv: { docType?: string }) => (inv.docType || "Quotation").toUpperCase();
/** Move only recognisable legacy stone names; leave unknown/missing types untouched. */
export const migrateStoneRows = (inv: Invoice): Invoice => ({
  ...inv,
  rows: (inv.rows ?? []).map((r) => {
    if (r.stone !== undefined) return r;
    const type = (r.type ?? "").trim();
    const names: Record<string, string> = {
      "lab-grown diamond": "Lab-Grown Diamond", moissanite: "Moissanite",
      gemstone: "Gemstone", "natural diamond": "Natural Diamond",
    };
    const compound = /^(CVD|HPHT)\s+Lab-Grown Diamond$/i.exec(type);
    if (compound) return { ...r, stone: "Lab-Grown Diamond", type: compound[1]?.toUpperCase() ?? "" };
    const stone = names[type.toLowerCase()];
    return stone ? { ...r, stone, type: "" } : { ...r, stone: "" };
  }),
});
export const termsList = (t: string) => t.split("\n").map((s) => s.replace(/^\s*\d+[.)]\s*/, "").trim()).filter(Boolean);

/* ---------- Shared page layout (mm) — used by both the preview and the PDF so page breaks match ---------- */
export const PAGE = { W: 297, H: 210, M: 12, headerH: 60, contHeaderH: 16, footerH: 13, theadH: 9, tfootH: 7 };
export const COL_WIDTHS = [6, 30, 15, 22, 11, 16, 13, 12, 12, 20, 24, 14, 15, 8, 16, 19, 20];
export const COL_HEADS = (cur: string) => ["Sr.", "Description & Link", "HSN Code", "Stone", "Type", "Shape", "Size", "Colour", "Clarity", "Cut / Pol / Sym", "Certificate", "Fluor.", "Wt/Pcs (ct)", "Pcs", "Total Wt (ct)", `Price/Ct (${cur})`, `Amount (${cur})`];
/** Table body line height (mm) for 7pt text at 1.15 line-height; preview uses the same. */
export const ROW_LH = 7 * 1.15 * 0.3528;
/** Space reserved above the footer on the final page for the gratitude message */
export const THANKS_H = 13;

/** Greedy word-wrap estimate using Helvetica average glyph width (slightly conservative). */
export const wrapCount = (text: string, widthMm: number, pt: number, bold = false) => {
  const charW = pt * 0.3528 * (bold ? 0.56 : 0.52);
  const cap = Math.max(1, Math.floor(widthMm / charW));
  let lines = 0;
  for (const para of (text || "").split("\n")) {
    let len = 0; lines++;
    for (const w of para.split(/\s+/).filter(Boolean)) {
      if (len === 0) { len = w.length; while (len > cap) { lines++; len -= cap; } }
      else if (len + 1 + w.length <= cap) len += 1 + w.length;
      else { lines++; len = w.length; while (len > cap) { lines++; len -= cap; } }
    }
  }
  return Math.max(1, lines);
};
export const rowCells = (r: DiamondRow) => {
  const c = rowCalc(r);
  return [r.description, r.hsn, r.stone ?? "", r.type, r.shape ?? "", sizeText(r), r.colour, r.clarity, r.cps, r.certificate, r.fluorescence,
    r.wtPerPcs ? fmtCt(parseFloat(r.wtPerPcs) || 0) : "", String(c.pcs), fmtCt(c.totalWt), r.pricePerCt ? fmtNum(parseFloat(r.pricePerCt) || 0) : "", fmtNum(c.amount)];
};
export const rowHeight = (r: DiamondRow) => {
  const cells = rowCells(r);
  let lines = 1;
  cells.forEach((v, k) => {
    const col = k + 1;
    const n = wrapCount(v, COL_WIDTHS[col]! - 3, 7, col === 16) + (col === 1 && validUrl(r.link) ? 1 : 0);
    lines = Math.max(lines, n);
  });
  return Math.max(7, 4 + lines * ROW_LH) + 0.3;
};

export const NOTES_W = 150;
export const NOTE_LH = 3.6;
export const noteLines = (s: string, i: number) => wrapCount(`${i + 1}.  ${s}`, NOTES_W, 7.5);

export const summaryLines = (inv: Invoice) => {
  const t = invoiceCalc(inv);
  const lines: [string, string][] = [["Subtotal", fmtMoney(t.subtotal, inv.currency)]];
  if (t.discount > 0) lines.push([`Discount${inv.discountType === "percent" ? ` (${inv.discountValue}%)` : ""}`, `- ${fmtMoney(t.discount, inv.currency)}`]);
  if (t.shipping > 0) lines.push(["Shipping Charges", fmtMoney(t.shipping, inv.currency)]);
  if (t.other > 0) lines.push([inv.otherLabel || "Other Charges", fmtMoney(t.other, inv.currency)]);
  return lines;
};
/** Height of notes + summary block, including the 6mm gap above it and the gratitude reservation. */
export const summaryBlockH = (inv: Invoice) => {
  const t = invoiceCalc(inv);
  const sum = summaryLines(inv).length * 6 + 12 + (inv.showSecondary && t.rate > 0 ? 7 : 0);
  const terms = 8 + termsList(inv.terms).reduce((a, s, i) => a + noteLines(s, i) * NOTE_LH + 1, 0);
  return 6 + Math.max(sum, terms) + THANKS_H;
};

/**
 * Split rows into pages using estimated rendered heights. Totals/summary appear once after the
 * last row; if they don't fit, the last row moves to the next page with them (never a lone summary page
 * unless a single row can't share the page).
 */
export const paginate = (inv: Invoice) => {
  const { H, M, headerH, contHeaderH, footerH, theadH, tfootH } = PAGE;
  const first = H - M - headerH - footerH - theadH;
  const rest = H - M - contHeaderH - footerH - theadH;
  const hs = inv.rows.map(rowHeight);
  const pages: number[][] = [];
  let cur: number[] = [], used = 0, avail = first;
  hs.forEach((h, i) => {
    if (cur.length && used + h > avail) { pages.push(cur); cur = []; used = 0; avail = rest; }
    cur.push(i); used += h;
  });
  const tail = tfootH + summaryBlockH(inv);
  let summarySeparate = false;
  if (used + tail > avail) {
    const lastIdx = cur[cur.length - 1];
    if (cur.length > 1 && lastIdx !== undefined && hs[lastIdx]! + tail <= rest) {
      cur.pop(); pages.push(cur); cur = [lastIdx];
    } else if (cur.length) summarySeparate = true;
  }
  pages.push(cur);
  return { pages, summarySeparate, total: pages.length + (summarySeparate ? 1 : 0) };
};
