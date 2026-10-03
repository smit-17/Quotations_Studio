import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OPTION_GROUPS, useOptions, type OptionKey } from "@/lib/options";

/** Searchable dropdown that also accepts custom typed values and can add new options. */
export function Combo({ label, group, value, onChange, placeholder, className, ariaLabel }: {
  label?: string; group: OptionKey; value: string; onChange: (v: string) => void; placeholder?: string; className?: string; ariaLabel?: string;
}) {
  const { options, setOptions } = useOptions();
  const list = options[group];
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState<string | null>(null);
  const id = useId();
  const wrap = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState<CSSProperties>({});
  // Fixed-position list so it is never clipped by scrolling table containers.
  useEffect(() => {
    if (!open) return;
    const place = () => { const r = inputRef.current?.getBoundingClientRect(); if (r) setPos({ position: "fixed", top: r.bottom + 4, left: r.left, width: Math.max(r.width, 180) }); };
    place();
    window.addEventListener("scroll", place, true); window.addEventListener("resize", place);
    return () => { window.removeEventListener("scroll", place, true); window.removeEventListener("resize", place); };
  }, [open]);
  const query = (q ?? "").trim().toLowerCase();
  const shown = query ? list.filter((o) => o.toLowerCase().includes(query)) : list;

  const addNew = () => {
    const v = (q ?? value).trim() || window.prompt(`New ${OPTION_GROUPS[group].label} option`)?.trim() || "";
    if (!v) return;
    if (list.some((o) => o.toLowerCase() === v.toLowerCase())) { toast("That option already exists"); onChange(list.find((o) => o.toLowerCase() === v.toLowerCase())!); }
    else { setOptions({ ...options, [group]: [...list, v] }); onChange(v); toast.success(`Added “${v}”`); }
    setQ(null); setOpen(false);
  };

  return (
    <div className="space-y-1" ref={wrap} onBlur={(e) => { if (!wrap.current?.contains(e.relatedTarget as Node)) { setOpen(false); setQ(null); } }}>
      {label && <Label htmlFor={id} className="text-xs text-muted-foreground">{label}</Label>}
      <div className="relative">
        <Input ref={inputRef} id={id} aria-label={ariaLabel} value={q ?? value} placeholder={placeholder ?? "Search or type…"} autoComplete="off" role="combobox" aria-expanded={open}
          onFocus={() => setOpen(true)}
          onChange={(e) => { setQ(e.target.value); onChange(e.target.value); setOpen(true); }}
          onKeyDown={(e) => { if (e.key === "Escape") { setOpen(false); setQ(null); } if (e.key === "Enter") { e.preventDefault(); const first = shown[0]; if (first && query) onChange(first); setOpen(false); setQ(null); } }}
          className={`pr-8 ${className ?? ""}`} />
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        {open && (
          <div role="listbox" style={pos} className="z-50 max-h-60 overflow-y-auto rounded-md border border-border bg-popover p-1 text-sm shadow-lg">
            {shown.length === 0 && <p className="px-2 py-1.5 text-xs text-muted-foreground">No matches — keep typing to use a custom value.</p>}
            {shown.map((o) => (
              <button type="button" key={o} role="option" aria-selected={o === value} tabIndex={-1}
                onMouseDown={(e) => e.preventDefault()} onClick={() => { onChange(o); setQ(null); setOpen(false); }}
                className={`block w-full rounded px-2 py-1.5 text-left hover:bg-accent ${o === value ? "font-semibold text-navy" : ""}`}>{o}</button>
            ))}
            <button type="button" tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={addNew}
              className="mt-1 flex w-full items-center gap-1.5 rounded border-t border-border px-2 py-1.5 text-left font-semibold text-navy hover:bg-accent">
              <Plus className="h-3.5 w-3.5" /> Add New Option{q?.trim() ? `: “${q.trim()}”` : ""}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
