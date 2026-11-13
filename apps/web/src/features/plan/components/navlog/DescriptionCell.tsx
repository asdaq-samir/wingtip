import { useId, useState } from "react";
import { cn } from "cn";
import { Textarea } from "../../../../components/ui/textarea";
import { TEXT } from "../../../../lib/text";
import type { Description } from "../../hooks/useCheckpointNotes";

/**
 * One checkpoint's "how to spot it" text, the pilot's own, in an editable
 * box. Local draft state is what lets typing feel immediate without
 * saving on every keystroke; the save itself happens on blur.
 */
export function DescriptionCell({
  description,
  onSave,
  selected,
  onFocus,
}: {
  description: Description | undefined;
  onSave: (text: string) => Promise<unknown>;
  /** Its waypoint's row selected: the box then shows as a field on the
   *  selection's tint, the two reading as one selected group rather
   *  than a highlighted row sitting above an unrelated one. */
  selected: boolean;
  /** Selects this row's own waypoint the moment a pilot focuses (or
   *  clicks into) the box -- the reverse half of the sync: selecting
   *  the row already highlights this box, and typing here should
   *  highlight the row back, not leave it looking unselected while
   *  its own description is what's actually being edited. */
  onFocus: () => void;
}) {
  // null while nobody is editing: the box shows the note as it stands. A
  // string while a pilot types, kept until it is saved -- a change to the
  // note in the middle does not replace it, and a save that fails leaves
  // it in the box to try again.
  const [draft, setDraft] = useState<string | null>(null);
  const id = useId();
  return (
    // A label round the box, nine points proud of it above and below and
    // taking no room: a tap there focuses the box, so a finger has 44
    // points to find it in while the box itself stays the row's own 26.
    // A text field cannot carry the ::after the buttons reach 44 with
    // (index.css). Positioned, so the band lies over the leg's figures it
    // reaches into rather than under them. The box keeps a name of its
    // own: through the label it would be named with its own text.
    <label htmlFor={id} className="relative -my-2.25 block py-2.25">
      <Textarea
        id={id}
        aria-label="How to spot it"
        value={draft ?? description?.text ?? ""}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={onFocus}
        onBlur={() => {
          if (draft === null) return;
          const trimmed = draft.trim();
          // Nothing new, or emptied: back to the note as it stands.
          if (!trimmed || trimmed === (description?.text ?? "")) {
            setDraft(null);
            return;
          }
          const typed = draft;
          // Cleared once saved -- unless the pilot is typing again by then.
          // A failure keeps the text; the query client reports it.
          onSave(trimmed).then(
            () => setDraft((d) => (d === typed ? null : d)),
            () => {},
          );
        }}
        rows={1}
        placeholder="How to spot it…"
        // shadcn's own Textarea, sized down to a table cell: one line in
        // the row, at the row's own size -- 15 to a finger, where it was a
        // field's 17 among figures of 15 (iOS Safari zooms in on a field
        // under 16; the viewport no longer forbids it, #265).
        className={cn(
          "min-h-0 w-full resize-none rounded py-0.5 pr-1 pl-0.5 text-left align-top shadow-none",
          // md:text-xs: the Textarea's own md:text-sm is another variant, which
          // TEXT.detail's text-xs does not displace, so a mouse would see 14
          // beside the row's 12.
          TEXT.detail,
          "md:text-xs",
          // On a selected row, a field: the page's own background and the
          // stock edge, on the selection's tint, so it reads as somewhere
          // to type rather than one more line of the row.
          selected
            ? "border-input bg-background text-foreground"
            : "border-transparent bg-transparent text-muted-foreground hover:border-border focus:border-ring focus:bg-background",
        )}
      />
    </label>
  );
}
