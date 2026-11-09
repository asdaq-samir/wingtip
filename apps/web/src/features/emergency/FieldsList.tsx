import { Navigation2 } from "lucide-react";
import { cn } from "cn";
import { ListChoices, ListGroup, ListRow } from "../../components/GroupedList";
import QueryState from "../../components/QueryState";
import { FINDING_TONE } from "../../lib/findings";
import { TEXT } from "../../lib/text";
import { threeFigures } from "../../lib/navaid";
import type { EmergencyModel } from "./useEmergency";

/**
 * The best fields from where the airplane is, the engine's order (reach,
 * then the runway against the POH, then the distance), a tap picking the
 * one the map's line goes to. Each row: the heading to fly and how far,
 * its reach, and the engine's reasons under it, toned as the Brief's
 * findings are. Nothing is hidden for a limitation; it is said.
 */
export default function FieldsList({ vm }: { vm: EmergencyModel }) {
  const { ranked, picked, pick, asked, fix, showPosition } = vm;
  if (!fix) {
    return (
      <ListGroup title="Best fields">
        <ListRow title="Show my position" description="The fields within a glide are worked out from it" onClick={showPosition} data-testid="emergency-show-position" />
      </ListGroup>
    );
  }
  const title = ranked?.glide
    ? `Best fields · glide about ${Math.round(ranked.glide.still_air_nm)} nm in still air`
    : "Best fields";
  return (
    <ListGroup title={title}>
      {ranked?.needs_airplane && (
        <ListRow muted title="Glide needs an airplane" description="Choose one with its best-glide figures; nearest first meanwhile" data-testid="emergency-needs-airplane" />
      )}
      {ranked && (
        <ListChoices value={picked?.ident ?? ""} onChange={pick} label="Field to land at">
          {ranked.fields.map(f => {
            const heading = f.heading_mag_deg ?? f.heading_true_deg;
            return (
              <ListRow
                key={f.ident} radio={f.ident} data-testid="emergency-field"
                title={<span><span className="font-semibold">{f.ident}</span> {f.name}</span>}
                value={
                  <span className="flex items-center gap-1 tabular-nums">
                    <Navigation2 className="size-4 text-tint" style={{ transform: `rotate(${f.course_deg}deg)` }} aria-hidden />
                    {heading != null ? `${threeFigures(heading)}°${f.heading_mag_deg == null ? " T" : ""} · ` : ""}{f.distance_nm.toFixed(1)} nm
                  </span>
                }
                description={
                  <span className={cn("block", TEXT.detail)}>
                    {/* The engine's reasons, the reach first where it was
                        worked out: that line in its tone and bold. */}
                    {f.reasons.map((r, i) => {
                      const lead = i === 0 && f.reach !== "unknown";
                      return (
                        <span key={r.text} className={cn("block", (lead || r.tone !== "ok") && FINDING_TONE[r.tone], lead && "font-semibold")}>
                          {r.text}
                        </span>
                      );
                    })}
                  </span>
                }
              />
            );
          })}
        </ListChoices>
      )}
      {!ranked && <QueryState row query={asked} fetching="Fetching the fields round you…" failed="The fields could not be had. Try again." />}
    </ListGroup>
  );
}
