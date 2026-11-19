import { useState } from "react";
import type { Map as MlMap } from "maplibre-gl";
import { cn } from "cn";
import { Button } from "../../../components/ui/button";
import type { AirportsInView } from "../../../lib/api/types";
import { TEXT } from "../../../lib/text";
import { flatDeg2 } from "../../../lib/geo";
import { useGlView } from "../../../lib/map/gl/useGlView";
import { spokenWeather } from "../../../lib/map/marks/airportWeather";

type Field = AirportsInView["airports"][number];

/** The most fields listed: a screen of the chart round Chicago holds some
 *  sixty that report, and a list longer than a rotor's turn is not read. */
const MOST = 25;

/** The fields in the map's view, nearest its middle first. */
function inSight(fields: Field[], bounds: { south: number; west: number; north: number; east: number }) {
  const lat = (bounds.south + bounds.north) / 2,
    lon = (bounds.west + bounds.east) / 2;
  const away = (f: Field) => flatDeg2(f.lat - lat, f.lon - lon, lat);
  return fields
    .filter((f) => f.lat >= bounds.south && f.lat <= bounds.north && f.lon >= bounds.west && f.lon <= bounds.east)
    .sort((a, b) => away(a) - away(b))
    .slice(0, MOST);
}

/** A field as a screen reader says it: its ident, name, its weather's
 *  category and wind in words, as its halo and arrow show them ("KJVL,
 *  Janesville, IFR, wind 220 at 18 gusting 26"), and whether it has a
 *  tower, the colour of its symbol on the chart (FAA Chart User's Guide,
 *  Airports). */
function fieldWords(f: Field): string {
  const tower = f.towered == null ? "" : f.towered ? ", towered" : ", no tower";
  return `${spokenWeather(`${f.ident}, ${f.name}`, f.flight_category ?? "no weather reported", f.weather)}${tower}`;
}

/**
 * The chart's marks for a screen reader and a keyboard, which the
 * canvas's pictures are not: the reporting fields in sight, nearest the
 * middle first, each a button opening its card as a tap on its symbol
 * does -- the web's counterpart of the iPhone's map rotor and Android's
 * map actions. Hidden from sight, shown to a keyboard's focus at the
 * map's top corner, as a skip link is: laid out there all the time and
 * only clipped away, so the focus coming moves nothing (as sr-only, one
 * point wide, its rows were laid out elsewhere and jumped to the corner, a
 * layout shift of 0.6 in card-once.spec).
 *
 * Its rows are held while the focus is in it: a field picked here opens
 * its card and the map comes to rest on it with the focus still on the
 * pick, and the rows sorted again under the focus moved where the reader
 * was (card-once.spec: a layout shift of 0.044 as the card came up). Each
 * held row keeps its field's latest words; the list is the view's again
 * once the focus leaves it.
 */
export default function MapMarksList({ fields, onSelect }: { fields: Field[]; onSelect: (ident: string) => void }) {
  const { box: bounds } = useGlView(boxOf, "rest");
  const live = inSight(fields, bounds);
  const [held, setHeld] = useState<Field[] | null>(null);
  const shown = held ? held.map((h) => fields.find((f) => f.ident === h.ident) ?? h) : live;
  if (!shown.length) return null;
  return (
    <nav
      aria-label="Airports on the map"
      onFocus={() => setHeld((was) => was ?? live)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setHeld(null);
      }}
      className="absolute top-2 left-2 z-[1100] max-h-[50%] overflow-y-auto rounded-xl p-2 not-focus-within:[clip-path:inset(50%)] focus-within:bg-popover focus-within:shadow-(--depth-overlay)"
    >
      <ul className="flex flex-col gap-2">
        {shown.map((f) => (
          <li key={f.ident}>
            <Button
              variant="plain"
              size="inline"
              type="button"
              className={cn("text-left text-tint", TEXT.row)}
              onClick={() => onSelect(f.ident)}
            >
              {fieldWords(f)}
            </Button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** The view's edges as the map comes to rest. */
function boxOf(map: MlMap) {
  const b = map.getBounds();
  return { south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() };
}
