import { useState } from "react";
import { Eraser, Hand, Highlighter, ImageDown, PenLine, Redo2, StickyNote, Undo2 } from "lucide-react";
import { cn } from "cn";
import IconButton from "../../components/IconButton";
import PullDown from "../../components/PullDown";
import { Button } from "../../components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover";
import { Textarea } from "../../components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "../../components/ui/toggle-group";
import { TEXT } from "../../lib/text";
import type { Tool } from "./markup";
import type { MarkupModel } from "./useMarkup";

const TOOLS: { value: Tool; label: string; icon: typeof PenLine }[] = [
  { value: "highlight", label: "Highlighter", icon: Highlighter },
  { value: "pen", label: "Pen", icon: PenLine },
  { value: "eraser", label: "Eraser", icon: Eraser },
];

/** A tool's 40-point face, its 44-point area a pseudo-element round it. */
const TOOL = "relative size-10 rounded-full after:absolute after:-inset-0.5 after:content-[''] [&_svg]:size-5";

/**
 * The markup bar, where the iPad's layout puts a document's tools: at the
 * regular width (an iPad, the side panel's 660 up, useIsMobile) in the
 * reader's head under its search and buttons, as iPadOS's Preview and
 * Files put their markup tools under the title bar, clear of the hand
 * that rests on the page's foot as the pencil writes; at the compact
 * width (an iPhone, an iPad's 1/3) floating at the pages' foot, as
 * PencilKit's tool picker does on an iPhone, by the thumb. The
 * highlighter, the pen and the eraser; the ink, a pull-down (discrete
 * settings are menus); Undo (and Redo where there is room, as iPadOS has
 * both and the iPhone's Notes keeps Undo); a picked highlight's note;
 * and the page shared with its marks.
 */
export function MarkupBar({ vm, page, at }: { vm: MarkupModel; page: number | null; at: "head" | "foot" }) {
  const head = at === "head";
  return (
    <div
      className={cn(
        "flex justify-center px-4",
        head ? "shrink-0 pb-2" : "pointer-events-none absolute inset-x-0 bottom-0 pb-[max(1rem,env(safe-area-inset-bottom))]",
      )}
    >
      <div
        role="toolbar"
        aria-label="Markup"
        data-testid="document-markup-bar"
        data-at={at}
        className={cn(
          "pointer-events-auto flex max-w-full items-center gap-1 overflow-x-auto rounded-full p-1",
          head ? "bg-muted" : "bg-popover shadow-float",
        )}
      >
        <ToggleGroup value={vm.tool ? [vm.tool] : []} onValueChange={(v) => v[0] && vm.take(v[0] as Tool)} aria-label="Tool" spacing={1}>
          {TOOLS.map(({ value, label, icon: Icon }) => (
            <ToggleGroupItem key={value} value={value} aria-label={label} className={TOOL} data-testid={`document-tool-${value}`}>
              <Icon aria-hidden="true" />
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {vm.ink && (
          <PullDown
            label="Ink"
            value={vm.ink}
            options={vm.inkChoices.map((c) => ({
              value: c.value,
              label: (
                <>
                  <Swatch ink={c.value} />
                  {c.label}
                </>
              ),
              text: c.label,
              testId: `document-ink-${c.label.toLowerCase()}`,
            }))}
            onChange={vm.setInk}
            testId="document-ink"
            trigger={
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Ink: ${vm.inkChoices.find((c) => c.value === vm.ink)?.label ?? ""}`}
                className={TOOL}
              >
                <Swatch ink={vm.ink} />
              </Button>
            }
          />
        )}
        {vm.noteMark && (
          <NoteButton
            note={vm.noteMark.note ?? ""}
            words={vm.noteMark.text ?? null}
            open={vm.noting}
            onOpen={vm.openNote}
            onSave={vm.setNote}
          />
        )}
        <IconButton label="Undo" disabled={!vm.canUndo} onClick={vm.undo} className={TOOL} data-testid="document-undo-mark">
          <Undo2 />
        </IconButton>
        <IconButton label="Redo" disabled={!vm.canRedo} onClick={vm.redo} className={cn(TOOL, !head && "max-sm:hidden")}>
          <Redo2 />
        </IconButton>
        {vm.pencilOnly !== null && (
          <IconButton
            label="Draw with Finger"
            aria-pressed={!vm.pencilOnly}
            onClick={() => vm.setPencilOnly(!vm.pencilOnly)}
            className={TOOL}
            data-testid="document-finger-draws"
          >
            <Hand />
          </IconButton>
        )}
        <IconButton
          label="Share Marked-Up Page"
          disabled={!page || vm.sharing}
          onClick={() => page && void vm.sharePage(page)}
          className={TOOL}
          data-testid="document-share-marked"
        >
          <ImageDown />
        </IconButton>
      </div>
    </div>
  );
}

/** An ink's dot, in its own colour. */
function Swatch({ ink }: { ink: string }) {
  return <span aria-hidden="true" className="size-5 shrink-0 rounded-full ring-2 ring-border" style={{ background: ink }} />;
}

/** A picked highlight's note, written in a popover over its button. */
function NoteButton({
  note,
  words,
  open,
  onOpen,
  onSave,
}: {
  note: string;
  words: string | null;
  open: boolean;
  onOpen: (open: boolean) => void;
  onSave: (note: string) => void;
}) {
  const [draft, setDraft] = useState(note);
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) setDraft(note);
        onOpen(next);
      }}
    >
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label={note ? "Edit Note" : "Add Note"}
            className={TOOL}
            // The focus left on the page, so pdf.js keeps the highlight picked.
            onPointerDown={(e) => e.preventDefault()}
            data-testid="document-note-button"
          />
        }
      >
        <StickyNote />
      </PopoverTrigger>
      <PopoverContent side="top" className="flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2 p-3" data-testid="document-note">
        {words && <p className={cn("line-clamp-3 text-muted-foreground italic", TEXT.detail)}>{words}</p>}
        <Textarea
          aria-label="Note"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Note"
          data-testid="document-note-text"
        />
        <Button
          className="self-end"
          onClick={() => {
            onSave(draft);
            onOpen(false);
          }}
          data-testid="document-note-done"
        >
          Done
        </Button>
      </PopoverContent>
    </Popover>
  );
}
