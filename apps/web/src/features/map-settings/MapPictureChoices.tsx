import { ScrollArea } from "@base-ui/react/scroll-area";
import { cn } from "cn";
import { ToggleGroup, ToggleGroupItem } from "../../components/ui/toggle-group";
import SectionTitle from "../../components/SectionTitle";
import { TEXT } from "../../lib/text";

export interface PictureChoice {
  value: string;
  label: string;
  src?: string;
  /** The picture's own look where it has no picture: a swatch. */
  className?: string;
}

/**
 * A pick of one of a few, each a picture with its word under it on one
 * line, as Apple Maps' "Choose Map" card sets its maps (the owner's
 * screenshot, 2026-11-10; its words under the picture, not over it, the
 * owner's "How can this be better?", 2026-11-14). The Chart and Base map
 * rows' tiles are one size, a quarter of the card's width; where a word
 * is longer than that (Google Satellite at an iPhone's 393 points) the
 * row's tiles grow to it together and the row slides sideways (Base UI's
 * ScrollArea), never wrapping a word. The one picked ringed in the tint.
 * The stock ToggleGroup underneath, so each is a radio to a screen reader
 * and the arrow keys move between them; a pick applies at once, with
 * nothing to confirm. A picture that does not load leaves its muted box.
 */
export default function MapPictureChoices({
  title,
  value,
  onChange,
  options,
  testId,
}: {
  title: string;
  value: string;
  onChange: (value: string) => void;
  options: PictureChoice[];
  testId: string;
}) {
  return (
    <section className="flex flex-col">
      {/* Set as a list group's title is (GroupedList), at the card's one
          sixteen-point edge (the sheet audit's F-B3). */}
      <div className="pb-1.5">
        <SectionTitle>{title}</SectionTitle>
      </div>
      {/* The row's width is the container the tiles' quarter is taken of. */}
      <ScrollArea.Root className="@container min-w-0">
        <ScrollArea.Viewport style={{ overflowY: "hidden" }} className="overscroll-x-contain">
          <ToggleGroup
            value={[value]}
            onValueChange={(v) => {
              if (v[0]) onChange(v[0]);
            }}
            aria-label={title}
            data-testid={testId}
            // Every column a quarter of the row less its three gaps, or the
            // longest word's width if that is more, all of them the same
            // (a track sized by its content, each one fraction); half a step
            // round them for the picked one's ring, which the viewport clips.
            className="grid w-max auto-cols-[minmax(calc((100cqw_-_1.75rem)/4),1fr)] grid-flow-col gap-2 p-0.5"
          >
            {options.map((o) => (
              <ToggleGroupItem
                key={o.value}
                value={o.value}
                aria-label={o.label}
                className={cn(
                  "group flex h-auto min-w-0 flex-col items-stretch gap-1 rounded-xl border-0 bg-transparent p-0 shadow-none",
                  "hover:bg-transparent data-pressed:bg-transparent",
                )}
              >
                {/* 16:10, flatter than 4:3, so the card's rows fit an iPhone's screen. */}
                <span
                  aria-hidden="true"
                  className={cn(
                    "block aspect-[16/10] overflow-hidden rounded-xl bg-muted",
                    // The one picked ringed in the tint, two points, as Apple's is.
                    "ring-1 ring-border group-data-pressed:ring-2 group-data-pressed:ring-tint",
                    o.className,
                  )}
                >
                  {o.src && (
                    <img
                      src={o.src}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      draggable={false}
                      className="size-full object-cover"
                      onError={(e) => {
                        e.currentTarget.style.visibility = "hidden";
                      }}
                    />
                  )}
                </span>
                <span
                  className={cn(
                    "px-0.5 text-left whitespace-nowrap text-foreground group-data-pressed:font-semibold group-data-pressed:text-tint",
                    TEXT.note,
                  )}
                >
                  {o.label}
                </span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </ScrollArea.Viewport>
      </ScrollArea.Root>
    </section>
  );
}
