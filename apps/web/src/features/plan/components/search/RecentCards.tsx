import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "../../../../components/ui/button";
import { cn } from "cn";
import { StripNote } from "../../../../components/Favorites";
import { Carousel, CarouselContent, CarouselItem } from "../../../../components/ui/carousel";
import { tileAt, tileTemplate } from "../../../../lib/map/sources/tiles";
import { usePreferences, type RecentAirport } from "../../../../lib/preferences";
import { chartQuery } from "../../../../lib/queryClient";
import { TEXT } from "../../../../lib/text";
import { useAway } from "../../../../lib/useAway";

/** The sectional's tile level a card shows: about 20 nm across, the field
 *  and its neighbourhood as a pilot reads them on the chart. */
const ZOOM = 10;

/**
 * The airports opened last as large picture cards in a row that slides
 * sideways, as Apple Maps on the web shows its guides (the owner's
 * screenshot, 2026-11-10): each the sectional round the field -- the
 * chart's own tile, already served for the map -- its ident and name
 * over the picture's foot. A field with no position kept, or off the
 * chart, shows the card's grey alone. Same rows and taps as the strip it
 * replaced (RecentAirportTiles): a tap opens the field's card.
 */
export default function RecentCards({ onPick }: { onPick: (airport: RecentAirport) => void }) {
  const recents = usePreferences((s) => s.recentAirports);
  const away = useAway();
  if (recents.length === 0) return <StripNote>None yet: the airports opened are kept here.</StripNote>;
  return (
    // A sideways drag the row's, an up or down one the sheet's (the one scrolling rule).
    <Carousel opts={{ align: "start", dragFree: true }} data-base-ui-swipe-ignore="x" data-testid="pill-airport-recents">
      <CarouselContent className="-ml-3">
        {recents.map((a) => (
          <CarouselItem key={a.ident} className="basis-auto pl-3">
            <RecentCard airport={a} detail={away(a)} onClick={() => onPick(a)} />
          </CarouselItem>
        ))}
      </CarouselContent>
    </Carousel>
  );
}

function RecentCard({ airport, detail, onClick }: { airport: RecentAirport; detail: string; onClick: () => void }) {
  const { data: chart } = useQuery(chartQuery);
  const [missing, setMissing] = useState(false);
  const at = airport.lat != null && airport.lon != null ? tileAt(airport.lat, airport.lon, ZOOM) : null;
  const src =
    chart && at && !missing
      ? tileTemplate(chart, "sec").replace("{z}", String(ZOOM)).replace("{x}", String(at.x)).replace("{y}", String(at.y))
      : null;
  return (
    <Button
      variant="ghost"
      size="inline"
      type="button"
      onClick={onClick}
      aria-label={`${airport.ident}, ${airport.name}`}
      data-testid="airport-recent"
      className={cn(
        "text-inherit",
        "relative flex h-44 w-36 shrink-0 flex-col justify-end overflow-hidden rounded-2xl bg-muted text-left outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      {src && (
        <img
          src={src}
          alt=""
          loading="lazy"
          onError={() => setMissing(true)}
          className="absolute inset-0 size-full object-cover"
          style={{ objectPosition: `${Math.round(at!.fx * 100)}% ${Math.round(at!.fy * 100)}%` }}
        />
      )}
      {/* The words on a shade of the page's ink at the foot, so they read
          over any chart. */}
      <span
        className={cn(
          "relative flex flex-col bg-linear-to-t from-foreground/90 via-foreground/60 to-transparent px-3 pt-10 pb-2.5",
          src ? "text-background" : "from-transparent text-foreground",
        )}
      >
        <span className={cn("font-mono font-bold", TEXT.title)}>{airport.ident}</span>
        <span className={cn("line-clamp-2 font-semibold", TEXT.detail)}>{airport.name}</span>
        {detail && <span className={cn("truncate opacity-85", TEXT.note)}>{detail}</span>}
      </span>
    </Button>
  );
}
