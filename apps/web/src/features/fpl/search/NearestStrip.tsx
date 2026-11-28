import { cn } from "cn";
import { Button } from "../../../components/ui/button";
import { ChartMark } from "../../../components/ChartMark";
import { PillStrip, SmallTile, TileChartMark } from "../../../components/Favorites";
import type { NearestAirport } from "../../../lib/api/types";
import { compassPoint } from "../../../lib/compass";
import { nmAway } from "../../../lib/useAway";
import { useOwnShip } from "../../../lib/map/position/ownShip";
import { TEXT } from "../../../lib/text";
import { WORDING } from "../../../lib/wording/generated/wording";

// Apart from Nearest's list in full (NearestCard), which is loaded when it
// is opened: the strip is drawn with Airport's pill, in the first load.

/** How many fields the pill shows, nearest first; more slide in sideways. */
const STRIP_FIELDS = 8;

/**
 * Airport's pill's NEAREST strip, under the Favorites, at the owner's ask ("Nearest can show
 * nearby airports as small icons"): the nearest fields as small tiles,
 * each its chart mark -- its airspace's colour, its weather's dot -- its
 * ident and how far, nearest first; a tap opens the field's card, as a row
 * of the list does. With no position yet, the fields nearest the map's
 * middle, and the way to show it. The list in full is the tab's, half way up.
 */
export function NearestStrip({
  fields,
  located,
  nearMap = false,
  onOpen,
  refusal,
}: {
  fields: NearestAirport[] | undefined;
  /** Whether there is a position (or a place typed) to be near. */
  located: boolean;
  /** No position: the fields are the nearest the map's middle
   *  (usePlanSearch), said so, with the way to show the position under them. */
  nearMap?: boolean;
  onOpen: (ident: string) => void;
  /** While the search picks a point: why a field cannot be picked. */
  refusal?: (ident: string) => string | null;
}) {
  const setEnabled = useOwnShip((s) => s.setEnabled);
  const showPosition = (
    <Button
      variant="link"
      size="inline"
      onClick={() => setEnabled(true)}
      data-testid="nearest-strip-position"
      // At the left where the tiles start, as every strip's words are (F-L2).
      className={cn("relative self-start py-1 text-left hit-y-2 after:inset-x-0", TEXT.row)}
    >
      Show My Position
    </Button>
  );
  if (!located && !nearMap) return showPosition;
  if (!fields)
    return (
      <p className={cn("py-1 text-center text-foreground/65", TEXT.note)} role="status">
        {WORDING.fetchingNearestFields}
      </p>
    );
  const strip = (
    <PillStrip testId="nearest-strip">
      {fields.slice(0, STRIP_FIELDS).map((field) => {
        const use = field.military === "military" ? "military" : field.private ? "private" : null;
        return (
          <SmallTile
            key={field.ident}
            onClick={() => onOpen(field.ident)}
            refused={refusal?.(field.ident)}
            testId="nearest-strip-field"
            // Said after the tile's ident and distance (SmallTile): the name,
            // the way, and the mark's colour in words, as Favorites' tiles
            // say it, the category otherwise a colour alone (WCAG 1.1.1, 1.4.1).
            label={[field.name, compassPoint(field.bearing_deg), field.flight_category].filter(Boolean).join(", ")}
            mark={
              <TileChartMark>
                <ChartMark space={field.airspace_class ?? null} category={field.flight_category} use={use} size={44} />
              </TileChartMark>
            }
            title={field.ident}
            detail={nmAway(field.distance_nm)}
          />
        );
      })}
    </PillStrip>
  );
  if (!nearMap) return strip;
  // Near the map's middle, not the pilot: said, and the
  // way to the pilot's own nearest under it.
  return (
    <div className="flex flex-col gap-2" data-near="map">
      {strip}
      <p className={cn("flex flex-wrap items-baseline gap-x-2 text-foreground/65", TEXT.note)}>
        <span data-testid="nearest-strip-near-map">Near the middle of the map.</span>
        {showPosition}
      </p>
    </div>
  );
}
