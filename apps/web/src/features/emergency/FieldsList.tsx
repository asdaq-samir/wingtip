import { AskFigure } from "../../components/airplane/AskFigure";
import { useEffect, useRef } from "react";
import { Navigation2 } from "lucide-react";
import { cn } from "cn";
import { ListChoices, ListGroup, ListRow } from "../../components/GroupedList";
import QueryState from "../../components/QueryState";
import { FINDING_TONE } from "../../lib/findings";
import { TEXT } from "../../lib/text";
import { spokenDistance, spokenHeadingMagnetic, spokenHeadingTrue, threeFigures } from "../../lib/format";
import { announce } from "@react-aria/live-announcer";
import type { EmergencyModel } from "./useEmergency";

/**
 * The best fields from where the airplane is, the engine's order (reach,
 * then the runway against the POH, then the distance), a tap picking the
 * one the map's line goes to. Each row: the heading to fly and how far,
 * its reach, and the engine's reasons under it, toned as the Brief's
 * findings are. Nothing is hidden for a limitation; it is said.
 */
type Field = NonNullable<EmergencyModel["ranked"]>["fields"][number];

/** A field's way there in words for a screen reader: "three four six
 *  degrees magnetic, twelve point four nautical miles"; a true heading
 *  said so (AIM 4-2-10) where the variation is not known. */
function wayThere(f: Field): string {
  const heading =
    f.heading_mag_deg != null
      ? spokenHeadingMagnetic(f.heading_mag_deg)
      : f.heading_true_deg != null
        ? spokenHeadingTrue(f.heading_true_deg)
        : null;
  return [heading, spokenDistance(f.distance_nm)].filter(Boolean).join(", ");
}

/** The best field told to a screen reader at once, once each time another
 *  field becomes the best (lib/announce): the list is not a live region,
 *  as its distances change with every fix. */
function useBestFieldSaid(best: Field | undefined) {
  const said = useRef<string | null>(null);
  useEffect(() => {
    if (!best || said.current === best.ident) return;
    said.current = best.ident;
    announce(`Best field ${best.ident}, ${best.name}, ${wayThere(best)}`, "assertive");
  }, [best]);
}

export default function FieldsList({ vm }: { vm: EmergencyModel }) {
  const { ranked, picked, pick, asked, fix, showPosition, visibility } = vm;
  useBestFieldSaid(ranked?.fields[0]);
  if (!fix) {
    return (
      <ListGroup title="Best fields">
        <ListRow
          title="Show my position"
          description="The fields within a glide are worked out from it"
          onClick={showPosition}
          data-testid="emergency-show-position"
        />
      </ListGroup>
    );
  }
  const title = ranked?.glide ? `Best fields · glide about ${Math.round(ranked.glide.still_air_nm)} nm in still air` : "Best fields";
  return (
    <div className="flex flex-col gap-3">
      <ListGroup title={title}>
        {vm.onDevice && (
          <ListRow
            muted
            title="From this device, without weather"
            description="No connection: the fields from the chart data kept here, with no runways, elevations or wind aloft"
            data-testid="emergency-on-device"
          />
        )}
        {ranked?.needs_airplane && (
          <ListRow
            muted
            title={vm.airplaneName ? `No glide ratio for ${vm.airplaneName}` : "Glide needs an airplane"}
            description="Nearest first: no glide is worked out without the airplane's own figures"
            data-testid="emergency-needs-airplane"
          />
        )}
        {ranked && (
          <ListChoices value={picked?.ident ?? ""} onChange={pick} label="Field to land at">
            {ranked.fields.map((f) => {
              const heading = f.heading_mag_deg ?? f.heading_true_deg;
              return (
                <ListRow
                  key={f.ident}
                  radio={f.ident}
                  data-testid="emergency-field"
                  title={
                    <span>
                      <span className="font-semibold">{f.ident}</span> {f.name}
                    </span>
                  }
                  value={
                    <span className="flex items-center gap-1 tabular-nums">
                      <Navigation2 className="size-4 text-tint" style={{ transform: `rotate(${f.course_deg}deg)` }} aria-hidden />
                      <span aria-hidden>
                        {heading != null ? `${threeFigures(heading)}°${f.heading_mag_deg == null ? " T" : ""} · ` : ""}
                        {f.distance_nm.toFixed(1)} nm
                      </span>
                      <span className="sr-only">{wayThere(f)}</span>
                    </span>
                  }
                  description={
                    <span className={cn("block", TEXT.detail)}>
                      {/* The engine's reasons, the reach first where it was
                          worked out: that line in its tone and bold. */}
                      {f.reasons.map((r, i) => {
                        const lead = i === 0 && f.reach !== "unknown";
                        return (
                          <span
                            key={r.text}
                            className={cn("block", (lead || r.tone !== "ok") && FINDING_TONE[r.tone], lead && "font-semibold")}
                          >
                            {r.text}
                          </span>
                        );
                      })}
                      {/* The field's reported visibility beside the
                          engine's weather line; none where the report
                          gives none. */}
                      {visibility.has(f.ident) && (
                        <span className="block" data-testid="emergency-field-visibility">
                          Visibility {visibility.get(f.ident)}
                        </span>
                      )}
                    </span>
                  }
                />
              );
            })}
          </ListChoices>
        )}
        {!ranked && (
          <QueryState row query={asked} fetching="Fetching the fields round you…" failed="The fields could not be had. Try again." />
        )}
      </ListGroup>
      {/* Its glide ratio asked for in place, the fields listed anyway
          (AskFigure; the owner, 2026-11-09). */}
      {ranked?.needs_airplane && vm.airplaneName && <AskFigure figure="glide" what="The glide" testId="emergency-glide-ask" />}
    </div>
  );
}
