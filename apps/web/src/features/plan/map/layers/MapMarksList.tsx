import type { Map as MlMap } from "maplibre-gl";
import { cn } from "cn";
import { Button } from "../../../../components/ui/button";
import type { AirportsInView } from "../../../../lib/api/types";
import { TEXT } from "../../../../lib/text";
import { useGlView } from "../../../../lib/map/gl/useGlView";
import { spokenWeather } from "../../../../lib/map/marks/airportWeather";

type Field = AirportsInView["airports"][number];

/** The most fields listed: a screen of the chart round Chicago holds some
 *  sixty that report, and a list longer than a rotor's turn is not read. */
const MOST = 25;

/** The fields in the map's view, nearest its middle first. */
function inSight(fields: Field[], bounds: { south: number; west: number; north: number; east: number }) {
  const lat = (bounds.south + bounds.north) / 2,
    lon = (bounds.west + bounds.east) / 2;
  const away = (f: Field) => (f.lat - lat) ** 2 + ((f.lon - lon) * Math.cos((lat * Math.PI) / 180)) ** 2;
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
 * map's top corner, as a skip link is.
 */
export default function MapMarksList({ fields, onSelect }: { fields: Field[]; onSelect: (ident: string) => void }) {
  const { box: bounds } = useGlView(boxOf, "rest");
  const shown = inSight(fields, bounds);
  if (!shown.length) return null;
  return (
    <nav
      aria-label="Airports on the map"
      className="sr-only focus-within:not-sr-only focus-within:absolute focus-within:top-2 focus-within:left-2 focus-within:z-[1100] focus-within:max-h-[50%] focus-within:overflow-y-auto focus-within:rounded-xl focus-within:bg-popover focus-within:p-2 focus-within:shadow-(--depth-overlay)"
      data-testid="map-marks-list"
    >
      <ul className="flex flex-col gap-2">
        {shown.map((f) => (
          <li key={f.ident}>
            <Button
              variant="ghost"
              size="inline"
              type="button"
              className={cn("justify-start text-inherit hover:bg-transparent", "text-left text-tint", TEXT.row)}
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
