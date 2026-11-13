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
  faded?: boolean;
}

/**
 * A pick of one of a few, each a picture with its word on a strip across
 * its foot, as Apple Maps' "Choose Map" card sets its maps (the owner's
 * screenshot, 2026-11-10), three to a row so the Map card is one screen
 * (option A of the map settings canvas, 2026-11-13), or four where there
 * are four (the overlays, Google's two among them); the one picked
 * ringed in the tint. The stock ToggleGroup underneath, so
 * each is a radio to a screen reader and the arrow keys move between them;
 * a pick applies at once, with nothing to confirm. A picture that does not
 * load leaves its muted box.
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
      <ToggleGroup
        value={[value]}
        onValueChange={(v) => {
          if (v[0]) onChange(v[0]);
        }}
        aria-label={title}
        data-testid={testId}
        className={cn("grid w-full gap-2", options.length > 3 ? "grid-cols-4" : "grid-cols-3")}
      >
        {options.map((o) => (
          <ToggleGroupItem
            key={o.value}
            value={o.value}
            aria-label={o.label}
            className={cn(
              "group relative block h-auto min-w-0 overflow-hidden rounded-xl border-0 bg-muted p-0 shadow-none",
              "hover:bg-muted data-pressed:bg-muted",
              // The one picked ringed in the tint, two points, as Apple's is.
              "ring-1 ring-border data-pressed:ring-2 data-pressed:ring-tint",
            )}
          >
            {/* 16:10, flatter than the 4:3 they were, so the Map card's charts,
                overlay and layers fit one iPhone screen with nothing to scroll. */}
            <span aria-hidden="true" className={cn("block aspect-[16/10]", o.className)}>
              {o.src && (
                <img
                  src={o.src}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  draggable={false}
                  className={cn("size-full object-cover", o.faded && "opacity-40")}
                  onError={(e) => {
                    e.currentTarget.style.visibility = "hidden";
                  }}
                />
              )}
            </span>
            {/* Its word on a strip of the card's own colour across the
                picture's foot. */}
            <span
              className={cn(
                "absolute inset-x-0 bottom-0 bg-card/90 py-1 text-left text-foreground group-data-pressed:font-semibold group-data-pressed:text-tint",
                // Four to a row, a long name (Google Satellite) on two lines, not cut short.
                options.length > 3 ? "line-clamp-2 px-1.5 leading-tight whitespace-normal" : "truncate px-2",
                TEXT.note,
              )}
            >
              {o.label}
            </span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </section>
  );
}
