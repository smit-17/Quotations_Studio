import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OPTION_GROUPS, useOptions, type OptionKey } from "@/lib/options";

export function ManageOptions({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { options, setOptions } = useOptions();
  const [group, setGroup] = useState<OptionKey>("type");
  const [draft, setDraft] = useState("");
  const [toDelete, setToDelete] = useState<number | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const list = options[group];
  const save = (next: string[]) => setOptions({ ...options, [group]: next });
  const dup = (v: string, except = -1) => list.some((o, i) => i !== except && o.toLowerCase() === v.toLowerCase());

  const add = () => {
    const v = draft.trim();
    if (!v) { toast.error("Option cannot be blank"); return; }
    if (dup(v)) { toast.error("That option already exists"); return; }
    save([...list, v]); setDraft("");
  };
  const rename = (i: number, v: string) => {
    const t = v.trim();
    if (!t) { toast.error("Option cannot be blank"); return false; }
    if (dup(t, i)) { toast.error("That option already exists"); return false; }
    save(list.map((o, k) => (k === i ? t : o))); return true;
  };
  const move = (i: number, j: number) => { if (j < 0 || j >= list.length || i === j) return; const x = [...list]; const [m] = x.splice(i, 1); x.splice(j, 0, m!); save(x); };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="font-display text-2xl text-navy">Manage Dropdown Options</SheetTitle>
          <SheetDescription>Changes save automatically. Existing quotations keep their current values.</SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-4 pb-6">
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(OPTION_GROUPS) as OptionKey[]).map((k) => (
              <button key={k} onClick={() => setGroup(k)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${group === k ? "border-navy bg-navy text-primary-foreground" : "border-border text-muted-foreground hover:border-gold"}`}>
                {OPTION_GROUPS[k].label} <span className="opacity-60">({options[k].length})</span>
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <Input value={draft} placeholder={`New ${OPTION_GROUPS[group].label} option`} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
            <Button onClick={add}><Plus /> Add</Button>
          </div>

          <ul className="space-y-1.5">
            {list.length === 0 && <li className="text-sm text-muted-foreground">No options yet — add your first one above.</li>}
            {list.map((o, i) => (
              <li key={`${group}-${o}`} draggable onDragStart={() => setDragIdx(i)} onDragOver={(e) => e.preventDefault()}
                onDrop={() => { if (dragIdx !== null) move(dragIdx, i); setDragIdx(null); }}
                className={`flex items-center gap-1.5 rounded-md border border-border bg-card p-1.5 ${dragIdx === i ? "opacity-50" : ""}`}>
                <span className="cursor-grab select-none px-1 text-muted-foreground" title="Drag to reorder">⋮⋮</span>
                <Input defaultValue={o} className="h-8" aria-label={`Edit ${o}`}
                  onBlur={(e) => { if (e.target.value.trim() !== o && !rename(i, e.target.value)) e.target.value = o; }}
                  onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
                <IB label="Move up" disabled={i === 0} onClick={() => move(i, i - 1)}><ArrowUp className="h-3.5 w-3.5" /></IB>
                <IB label="Move down" disabled={i === list.length - 1} onClick={() => move(i, i + 1)}><ArrowDown className="h-3.5 w-3.5" /></IB>
                <IB label="Delete" onClick={() => setToDelete(i)}><Trash2 className="h-3.5 w-3.5" /></IB>
              </li>
            ))}
          </ul>
        </div>
        <AlertDialog open={toDelete !== null} onOpenChange={(o) => !o && setToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete “{toDelete !== null ? list[toDelete] : ""}”?</AlertDialogTitle>
              <AlertDialogDescription>It will be removed from the {OPTION_GROUPS[group].label} dropdown. Quotations already using it are not changed.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => { if (toDelete !== null) save(list.filter((_, k) => k !== toDelete)); setToDelete(null); }}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  );
}

function IB({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return <button aria-label={label} title={label} disabled={disabled} onClick={onClick} className="rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-navy disabled:opacity-30">{children}</button>;
}
