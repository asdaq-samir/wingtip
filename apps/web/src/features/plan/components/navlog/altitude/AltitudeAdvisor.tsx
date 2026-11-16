import { TriangleAlert } from "lucide-react";
import { cn } from "cn";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "../../../../../components/ui/item";
import { Badge } from "../../../../../components/ui/badge";
import { altFt, duration, flightLevel, gal } from "../../../../../lib/format";
import { TEXT } from "../../../../../lib/text";
import SectionTitle from "../../../../../components/SectionTitle";
import type { AdvisorRow } from "./plans";

/** A head or tail wind as said on a row: "+12 kt" helping, "−8 kt" against. */
const windWords = (kt: number) => `${kt >= 0 ? "+" : "−"}${Math.abs(Math.round(kt))} kt`;

/**
 * The Altitude Advisor (the owner's pick, 2026-11-10, after ForeFlight's):
 * how the cruise is chosen in the plan, one row per altitude with its
 * time, fuel and head or tail wind, Fastest and Most economical marked; a
 * tap flies it. A row outside the legal altitudes is there too, with its
 * warning (warn, never limit). With no airplane picked, no time or fuel,
 * only the wind (the owner, 2026-11-09: nothing assumed). It replaces the
 * plan's menu.
 */
export default function AltitudeAdvisor({
  rows,
  airplane,
  previewed,
  onPick,
}: {
  rows: AdvisorRow[];
  airplane: boolean;
  /** The altitude the profile's slider is on, marked as the one in sight. */
  previewed: number | null;
  onPick: (altitude: number, legal: boolean) => void;
}) {
  if (!rows.length) return null;
  return (
    <section aria-labelledby="altitude-advisor-title" data-testid="altitude-advisor">
      {/* A section's title as every other is (SectionTitle, 20 points). */}
      <SectionTitle id="altitude-advisor-title" className="mb-1">
        Altitude Advisor
      </SectionTitle>
      <ItemGroup className="max-h-72 gap-0 overflow-y-auto rounded-xl bg-card">
        {rows.map((r) => {
          const figures = [
            airplane && r.ete_min != null ? duration(r.ete_min) : null,
            airplane && r.fuel_gal != null ? gal(r.fuel_gal) : null,
            r.tailwind_kt != null ? windWords(r.tailwind_kt) : null,
          ].filter(Boolean);
          return (
            <div role="listitem" key={r.altitude_ft}>
              <Item
                size="xs"
                render={<button type="button" />}
                aria-current={r.flown ? "true" : undefined}
                aria-label={`${altFt(r.altitude_ft)} feet${r.fastest ? ", Fastest" : ""}${r.economical ? ", Most economical" : ""}${figures.length ? `, ${figures.join(", ")}` : ""}${r.flown ? ", flown" : ""}${r.warning ? `. ${r.warning}` : ""}`}
                onClick={() => onPick(r.altitude_ft, r.legal)}
                data-testid="altitude-advisor-row"
                data-flown={r.flown || undefined}
                className={cn(
                  "min-h-11 rounded-none px-3 text-left",
                  r.flown && "bg-tint/10",
                  previewed === r.altitude_ft && !r.flown && "bg-muted",
                )}
              >
                <ItemContent className="gap-0.5">
                  <ItemTitle className={cn("tabular-nums", TEXT.row, r.flown && "text-tint")}>
                    {flightLevel(r.altitude_ft)}
                    {r.fastest && <Badge variant="secondary">Fastest</Badge>}
                    {r.economical && <Badge variant="secondary">Most economical</Badge>}
                  </ItemTitle>
                  {r.warning && (
                    <ItemDescription className={cn("flex gap-1 text-caution-ink", TEXT.note)}>
                      <TriangleAlert className="mt-0.5 size-3 shrink-0" aria-hidden />
                      <span className="line-clamp-2">{r.warning}</span>
                    </ItemDescription>
                  )}
                </ItemContent>
                <span className={cn("shrink-0 tabular-nums text-muted-foreground", TEXT.detail)} aria-hidden>
                  {figures.join(" · ")}
                </span>
              </Item>
            </div>
          );
        })}
      </ItemGroup>
    </section>
  );
}
