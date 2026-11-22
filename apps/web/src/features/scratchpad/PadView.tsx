import { Eraser, Trash2, Undo2 } from "lucide-react";
import { cn } from "cn";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { TEXT } from "../../lib/text";
import { InkPad } from "./InkPad";
import { usePad } from "./usePad";

/**
 * One scratchpad page: its template's boxes, typed or written in with an
 * Apple Pencil (Safari's Scribble turns the writing in a box to text),
 * and the ink under them, written anywhere; Undo takes the last stroke
 * back, Clear the ink, Delete the page (with its own Undo).
 */
export function PadView({ id, onDelete }: { id: string; onDelete: () => void }) {
  const vm = usePad(id);
  if (!vm.pad || !vm.template) return null;
  const { pad, template } = vm;
  return (
    <div className="flex flex-col gap-4" data-testid="scratchpad-pad" data-template={template.id}>
      {template.fields.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {template.fields.map((f) => (
            <div key={f.key} className="flex flex-col gap-1">
              <Label htmlFor={`pad-${id}-${f.key}`} className={cn("text-muted-foreground", TEXT.detail)}>
                {f.label}
              </Label>
              <Input
                id={`pad-${id}-${f.key}`}
                value={pad.fields[f.key] ?? ""}
                inputMode={f.input === "numeric" ? "decimal" : "text"}
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => vm.setField(f.key, e.target.value)}
                data-testid={`scratchpad-field-${f.key}`}
              />
            </div>
          ))}
        </div>
      )}
      <InkPad strokes={pad.strokes} onStroke={vm.addStroke} label={`${template.title}, ${pad.strokes.length} strokes`} />
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" className="relative text-tint after:absolute after:-inset-1" onClick={vm.undoStroke} disabled={!pad.strokes.length}>
          <Undo2 aria-hidden /> Undo
        </Button>
        <Button
          variant="ghost"
          className="relative text-tint after:absolute after:-inset-1"
          onClick={vm.clearInk}
          disabled={!pad.strokes.length}
          data-testid="scratchpad-clear"
        >
          <Eraser aria-hidden /> Clear Ink
        </Button>
        <Button
          variant="ghost"
          className="relative ml-auto text-destructive after:absolute after:-inset-1"
          onClick={onDelete}
          data-testid="scratchpad-delete"
        >
          <Trash2 aria-hidden /> Delete Page
        </Button>
      </div>
    </div>
  );
}
