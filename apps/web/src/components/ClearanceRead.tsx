import type { ReactNode } from "react";
import ClearancePlace from "./ClearancePlace";
import FrequencyButton from "./FrequencyButton";
import { threeFigures } from "../lib/format";
import type { Clearance, ClearedItem, Found } from "../lib/clearance";
import { altitudeWords } from "../lib/readback";

/** The clearance's own words in Title Case, as a name is written. */
const capital = (words: string) => words.replace(/\b[a-z]/g, (ch) => ch.toUpperCase());

/** One named line of a row's detail: a CRAFT item, a route, an altitude. */
export function Line({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="w-24 shrink-0 text-muted-foreground">{name}</span>
      <span className="min-w-0 font-semibold">{children}</span>
    </div>
  );
}

/** The route as cleared, its parts in order, each as found: a place the
 *  planner could not be sure of is marked on the place itself
 *  (ClearancePlace), never in a toast. */
function RouteWords({ items, asFiled, found }: { items: ClearedItem[]; asFiled: boolean; found: Found | undefined }) {
  const parts: ReactNode[] = [];
  let run = 0;
  for (const [i, item] of items.entries()) {
    if (item.kind === "vectors") parts.push("Radar vectors");
    else if (item.kind === "heading") parts.push(`Heading ${threeFigures(item.degrees)}`);
    else if (item.kind === "airway") parts.push(item.ident);
    else if (item.kind === "places") {
      const places = found?.route?.[run++] ?? [{ said: item.said, sure: true, ident: item.said.toUpperCase() }];
      parts.push(...places.map((p, k) => <ClearancePlace key={`${i}-${k}`} place={p} />));
    } else {
      const picked = found?.[item.kind];
      parts.push(
        picked
          ? `${picked.id}${picked.transition ? `.${picked.transition}` : ""}`
          : `${capital(item.name)} ${item.number} ${item.kind}${item.transition ? `, ${capital(item.transition)} transition` : ""}`,
      );
    }
  }
  if (asFiled) parts.push("as filed");
  return (
    <>
      {parts.map((part, i) => (
        <span key={i}>
          {i > 0 && " → "}
          {part}
        </span>
      ))}
    </>
  );
}

/** The altitudes in one line, as the iPhone writes them: "Maintain
 *  5,000 ft, expect 9,000 ft 10 min after departure". */
function altitudeLine(c: Clearance): string | null {
  const parts: string[] = [];
  if (c.maintainFt !== null)
    parts.push(`maintain ${c.vfr ? "VFR " : ""}${c.maintainLimit ? `${c.maintainLimit} ` : ""}${altitudeWords(c.maintainFt)}`);
  if (c.expectFt !== null) parts.push(`expect ${altitudeWords(c.expectFt)}${c.expectMin ? ` ${c.expectMin} min after departure` : ""}`);
  if (!parts.length) return null;
  const line = parts.join(", ");
  return line.charAt(0).toUpperCase() + line.slice(1);
}

/**
 * The clearance as read, element by element in CRAFT's order (AIM 4-4-3:
 * cleared to, route, altitude, frequency, transponder). A polite live region
 * (WCAG 4.1.3), so the words as they are heard or typed are said without
 * the focus leaving the field; the region is there from the start, as a
 * live region must be before what it says changes. Nothing heard, empty.
 */
export function ClearanceElements({ clearance, places, heard }: { clearance: Clearance; places: Found | undefined; heard: boolean }) {
  const limit = clearance.classB ? (
    "Class Bravo airspace"
  ) : places?.limit?.ident ? (
    <ClearancePlace place={places.limit} />
  ) : (
    clearance.limit && capital(clearance.limit)
  );
  const altitude = altitudeLine(clearance);
  return (
    <div className="flex flex-col gap-1" aria-live="polite" data-testid="clearance-elements">
      {heard && (
        <>
          {limit && <Line name="Cleared to">{limit}</Line>}
          {(clearance.route.length > 0 || clearance.asFiled) && (
            <Line name="Route">
              <RouteWords items={clearance.route} asFiled={clearance.asFiled} found={places} />
            </Line>
          )}
          {altitude && <Line name="Altitude">{altitude}</Line>}
          {clearance.frequency && (
            <Line name="Frequency">
              <FrequencyButton mhz={clearance.frequency} name={capital(clearance.facility ?? "")} named />
            </Line>
          )}
          {clearance.squawk && <Line name="Transponder">{clearance.squawk}</Line>}
        </>
      )}
    </div>
  );
}
