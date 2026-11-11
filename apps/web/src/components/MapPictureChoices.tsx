import { cn } from "cn";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";
import SectionTitle from "./SectionTitle";
import { TEXT } from "../lib/text";

export interface PictureChoice {
  value: string;
  label: string;
  src?: string;
  className?: string;
  faded?: boolean;
}

/**
 * A pick of one of a few, each a picture with its word on a strip across
 * its foot, as Apple Maps' "Choose Map" card sets its maps (the owner's
 * screenshot, 2026-11-10): with `lead`, the first as wide as the card and
 * the rest two to a row, as Apple's Standard over Hybrid and Satellite;
 * the one picked ringed in the tint. The stock ToggleGroup underneath, so
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
  lead = false,
}: {
  title: string;
  value: string;
  onChange: (value: string) => void;
  options: PictureChoice[];
  testId: string;
  lead?: boolean;
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
        className={cn("grid w-full gap-2", lead ? "grid-cols-2" : "grid-cols-3")}
      >
        {options.map((o, i) => (
          <ToggleGroupItem
            key={o.value}
            value={o.value}
            aria-label={o.label}
            className={cn(
              "group relative block h-auto min-w-0 overflow-hidden rounded-xl border-0 bg-muted p-0 shadow-none",
              "hover:bg-muted data-pressed:bg-muted",
              // The one picked ringed in the tint, two points, as Apple's is.
              "ring-1 ring-border data-pressed:ring-2 data-pressed:ring-tint",
              lead && i === 0 && "col-span-2",
              o.className,
            )}
          >
            <span aria-hidden="true" className={cn("block", lead && i === 0 ? "aspect-[16/7]" : "aspect-[4/3]")}>
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
                "absolute inset-x-0 bottom-0 truncate bg-card/90 px-2 py-1 text-left text-foreground group-data-pressed:font-semibold group-data-pressed:text-tint",
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
