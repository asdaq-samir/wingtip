import { Lightbulb } from "lucide-react";
import { cn } from "cn";
import { FirstFew } from "../../../../components/FirstFew";
import { ListRow } from "../../../../components/GroupedList";
import { RowBadge } from "../../../../components/RowBadge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../../../../components/ui/collapsible";
import type { AirportPlace } from "../../../../lib/api/types";
import { BADGE } from "../../../../lib/rowBadges";
import { TEXT } from "../../../../lib/text";
import { NotamBadge } from "./NotamBadge";
import type { NotamMark } from "./notamBadges";

type Light = AirportPlace["lights"][number];

/** The runways or ends a light serves, as the remark writes them
 *  ("Runways 09/27, 18/36"), and a non-standard one said so. */
function servesWords(light: Light): string | undefined {
  const runways = light.runways.length ? `${light.runways.length > 1 ? "Runways" : "Runway"} ${light.runways.join(", ")}` : "";
  return [runways, light.nonstandard && "Non-standard"].filter(Boolean).join(" · ") || undefined;
}

const badge = (
  <RowBadge colour={BADGE.lights}>
    <Lightbulb />
  </RowBadge>
);

/**
 * The field's lights, on its card's Info tab after its details: each
 * system its Chart Supplement remarks name, read by the engine (the
 * planner's lighting_read) -- its name with its legend code ("Approach
 * lights (MALSR)"), the runways under it, and how it is turned on ("Key
 * the mic on CTAF when the tower is closed", "Preset low, sunset to
 * sunrise; key the mic on CTAF for more", "On all the time") -- then what
 * the engine could not read, in its words; the first three, the title
 * the way to the rest (FirstFew). Under them the standard keying where it
 * applies, and the remarks as written, folded (the shared Collapsible, as
 * a NOTAM's "As Sent"). A light a NOTAM addresses has its badge by its name
 * ("Out of service"), and a tap on its row opens that NOTAM.
 */
export function PlaceLights({
  place,
  notams,
  onNotam,
}: {
  place: AirportPlace;
  /** The NOTAMs' badges by the light's index (notamBadges). */
  notams: Map<number, NotamMark>;
  onNotam: (mark: NotamMark) => void;
}) {
  if (!place.lighting.length) return null;
  const rows = [
    ...place.lights.map((light, i) => {
      const mark = notams.get(i);
      const name = light.code ? `${light.name} (${light.code})` : light.name;
      return (
        <ListRow
          key={`${light.code ?? light.name}-${light.runways.join()}-${i}`}
          media={badge}
          title={
            mark ? (
              <span className="flex flex-wrap items-center gap-x-2">
                {name}
                <NotamBadge mark={mark} kind="light" />
              </span>
            ) : (
              name
            )
          }
          onClick={mark && (() => onNotam(mark))}
          chevron={!!mark}
          description={
            <>
              {servesWords(light) && <span className="block">{servesWords(light)}</span>}
              {light.how && (
                <span className="block text-foreground" data-testid="place-light-how">
                  {light.how}
                </span>
              )}
            </>
          }
          data-testid="place-light"
        />
      );
    }),
    ...place.light_notes.map((note) => <ListRow key={note.as_written} media={badge} title={note.words} data-testid="place-light-note" />),
  ];
  return (
    <div className="pt-5">
      <FirstFew
        key={place.ident}
        title="Lights"
        testId="place-lights"
        rows={rows}
        after={
          <>
            {place.standard_keying && (
              // The standard keying (AIM 2-1-8, Pilot Control of Airport
              // Lighting): the mic keyed 7 times within 5 seconds for the
              // highest intensity, 5 for medium or lower, 3 for the lowest.
              <ListRow
                title="Keying"
                value={<span className="text-foreground">7 high · 5 medium · 3 low</span>}
                data-testid="place-keying"
              />
            )}
            <Collapsible>
              <CollapsibleTrigger render={<ListRow title="As Written" chevron data-testid="place-lighting-sent" />} />
              <CollapsibleContent>
                <ListRow
                  title={
                    <span
                      className={cn("font-mono break-words whitespace-pre-wrap text-muted-foreground", TEXT.detail)}
                      data-testid="place-lighting-raw"
                    >
                      {place.lighting.join("\n")}
                    </span>
                  }
                />
              </CollapsibleContent>
            </Collapsible>
          </>
        }
      />
    </div>
  );
}
