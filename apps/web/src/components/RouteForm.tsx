import { ArrowRight } from "lucide-react";
import { cn } from "cn";
import AirportPicker from "./AirportPicker";
import { InputGroup, InputGroupAddon, InputGroupButton } from "./ui/input-group";
import { usePopups } from "./popupsChunk";
import { TEXT } from "../lib/text";

interface Props {
  dep: string;
  dest: string;
  onDepChange: (v: string) => void;
  onDestChange: (v: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
}

// Under 25rem of the panel's top row -- every phone, and the card from
// `md` up, where the route shares the row with the panel's actions -- the
// form steps down to iOS's next size, 15, with slimmer padding and
// chevrons: at 17 its Load button sat close enough to the next button
// that their 44-point hit areas overlapped, and the hit areas are the
// one size that cannot shrink. Past 30rem, room to spare, it widens.
// A step, not a size that slides with the width, so every width reads
// in one of iOS's own sizes rather than between them. Under 20rem -- an
// iPad's 320-point Slide Over -- the chevrons go too: the form ran some
// 30 points under the actions beside it, its Load button under Filter.
// The bordered group still says the idents are fields. (A container
// query measures the row inside its padding: 296 points in Slide Over,
// 351 on an iPhone SE, which keeps its chevrons.)
const NARROW_PICKER =
  "min-w-16 px-1.5 @max-[25rem]:min-w-0 @max-[25rem]:px-1 @max-[25rem]:pointer-coarse:text-(length:--type-detail) @max-[25rem]:[&_svg]:size-3.5 @max-[20rem]:[&_svg]:hidden @min-[30rem]:min-w-24 @min-[30rem]:px-2.5";

/** DEP → DEST and its Load button, the same on Plan and Label, as one
 *  bordered shadcn `InputGroup`: the page's own primary input, which
 *  earns the visual weight a bordered group carries. Each field is an
 *  `AirportPicker`, the stock combobox: a button that opens a searchable
 *  list of idents and names. (Its group was a component of its own with
 *  this one caller, RouteInputGroup: the code audit's CODE-44.) */
export default function RouteForm({ dep, dest, onDepChange, onDestChange, onSubmit, disabled = false }: Props) {
  const popups = usePopups();
  const load = (
    <InputGroupButton type="submit" variant="default" size="icon-sm" disabled={disabled}>
      <ArrowRight />
      <span className="sr-only">Load</span>
    </InputGroupButton>
  );
  return (
    // flex-wrap, not a fixed single line -- DEP/DEST need their full
    // width to actually show a 4-letter ident (a narrower box clips
    // the text itself, not just the row around it, which is worse:
    // wrong-looking data, not just a layout that needs a scroll or a
    // second glance). On a phone the group is slimmed to fit the
    // header's one line beside the icon buttons (NARROW_PICKER);
    // wrapping is the fallback for a screen narrower than that, and
    // costs nothing here where a hidden/clipped identifier would.
    <form
      className="flex flex-wrap items-center gap-1.5"
      autoComplete="off"
      onSubmit={(e) => {
        e.preventDefault();
        // Label's keyboard shortcuts ignore every key while an input
        // has focus, so without this Space wouldn't start the walk
        // right after loading a route, only after clicking the map.
        (document.activeElement as HTMLElement | null)?.blur();
        onSubmit();
      }}
    >
      {/* Slimmed below 30rem of its row so the form shares the panel's top
          row with the panel's actions: each picker is just wide enough for
          four monospace characters, and the arrow and the Load button's
          addon give up most of their padding. */}
      <InputGroup className="w-auto">
        <AirportPicker
          value={dep}
          onChange={(v) => onDepChange(v.toUpperCase())}
          placeholder="DEP"
          ariaLabel="Departure"
          className={NARROW_PICKER}
        />
        {/* At the idents' own size (TEXT), where it was the page's 16 on a
            line of 24. */}
        <span
          className={cn(
            "px-0.5 text-muted-foreground @max-[25rem]:px-0 @min-[30rem]:px-1",
            TEXT.row,
            "@max-[25rem]:pointer-coarse:text-(length:--type-detail)",
          )}
          aria-hidden="true"
        >
          →
        </span>
        <AirportPicker
          value={dest}
          onChange={(v) => onDestChange(v.toUpperCase())}
          placeholder="DEST"
          ariaLabel="Destination"
          className={NARROW_PICKER}
        />
        {/* pr-2/@min-[30rem]:pr-2.5: the Load button is inset inside the
            group's own border rather than nearly touching it, which read
            as the button bursting out of the group. In Slide Over, with
            the chevrons gone and the destination only as wide as its
            ident, the button keeps eight points from it, so that its hit
            area (seven past its edge) stays off the destination's. Its
            label a tooltip once the popups' chunk is in (popupsChunk). */}
        <InputGroupAddon align="inline-end" className="gap-1.5 pr-2 @max-[20rem]:ml-2 @max-[20rem]:pr-1.5 @min-[30rem]:pr-2.5">
          {popups ? <popups.Tip label="Load">{load}</popups.Tip> : load}
        </InputGroupAddon>
      </InputGroup>
    </form>
  );
}
