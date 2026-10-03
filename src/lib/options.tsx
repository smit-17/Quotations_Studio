import { createContext, useContext } from "react";

export const OPTIONS_KEY = "lepdo.dropdown.options";

export const OPTION_GROUPS = {
  stone: { label: "Stone", defaults: ["Lab-Grown Diamond", "Moissanite", "Gemstone", "Natural Diamond"] },
  type: { label: "Type", defaults: ["CVD", "HPHT", "N/A"] },
  shape: { label: "Shape", defaults: ["Round", "Marquise", "Oval", "Pear", "Princess", "Emerald", "Cushion", "Radiant", "Asscher", "Heart", "Trillion"] },
  sizeUnit: { label: "Size Unit", defaults: ["ct", "mm"] },
  colour: { label: "Colour", defaults: ["D", "E", "F", "G", "H", "I", "J", "Fancy Yellow", "Fancy Pink", "Fancy Blue"] },
  clarity: { label: "Clarity", defaults: ["IF", "VVS1", "VVS2", "VS1", "VS2", "SI1", "SI2", "I1", "I2", "I3"] },
  cut: { label: "Cut", defaults: ["Ideal", "Excellent", "Very Good", "Good", "Fair", "Poor", "N/A"] },
  polish: { label: "Polish", defaults: ["Excellent", "Very Good", "Good", "Fair", "Poor", "N/A"] },
  symmetry: { label: "Symmetry", defaults: ["Excellent", "Very Good", "Good", "Fair", "Poor", "N/A"] },
  certLab: { label: "Certificate Lab", defaults: ["IGI", "GIA", "GCAL", "Other", "Uncertified"] },
  fluorescence: { label: "Fluorescence", defaults: ["None", "Faint", "Medium", "Strong", "Very Strong"] },
  currency: { label: "Currency", defaults: ["USD", "INR", "EUR", "GBP", "CAD", "AUD", "AED"] },
  hsn: { label: "HSN Code", defaults: [] as string[] },
  seller: { label: "Seller Name", defaults: [] as string[] },
} as const;

export type OptionKey = keyof typeof OPTION_GROUPS;
export type Options = Record<OptionKey, string[]>;

export const defaultOptions = (): Options =>
  Object.fromEntries(Object.entries(OPTION_GROUPS).map(([k, g]) => [k, [...g.defaults]])) as Options;

/** Legacy browser key — read only once to import old local data into the cloud. */
export const readLegacyOptions = (): Partial<Options> | null => {
  try { const raw = localStorage.getItem(OPTIONS_KEY); return raw ? (JSON.parse(raw) as Partial<Options>) : null; } catch { return null; }
};

/** Builds the option lists from saved settings; HSN / Seller are seeded from saved quotations the first time. */
export const normalizeOptions = (saved: Partial<Options> | null, seed: { hsn: string[]; seller: string[] }): Options => {
  const base = defaultOptions();
  if (saved) {
    // Retain custom Type entries, but move former stone-name options out of Type.
    const legacy = /^(?:Lab-Grown Diamond|CVD Lab-Grown Diamond|HPHT Lab-Grown Diamond|Moissanite|Gemstone|Natural Diamond)$/i;
    return { ...base, ...saved, stone: saved.stone ?? base.stone, type: uniq([...base.type, ...(saved.type ?? []).filter((v) => !legacy.test(v))]) };
  }
  base.hsn = uniq(seed.hsn);
  base.seller = uniq(seed.seller);
  return base;
};

export const uniq = (xs: string[]) => {
  const seen = new Set<string>(); const out: string[] = [];
  for (const x of xs.map((s) => s.trim())) if (x && !seen.has(x.toLowerCase())) { seen.add(x.toLowerCase()); out.push(x); }
  return out;
};

type Ctx = { options: Options; setOptions: (o: Options) => void };
export const OptionsContext = createContext<Ctx>({ options: defaultOptions(), setOptions: () => {} });
export const useOptions = () => useContext(OptionsContext);
