import { ChevronRight } from "lucide-react";
import { cn } from "cn";
import { Button } from "../../../../../components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../../../../../components/ui/collapsible";
import { faaWords } from "../../../../../lib/advisories";
import type { Detour, Leg, NavLogAltitude, RouteProfile, Totals } from "../../../../../lib/api/types";
import { altFt } from "../../../../../lib/format";
import { GROUP_HEADING, TEXT } from "../../../../../lib/text";
import AltitudeReasoning from "../../AltitudeReasoning";

/**
 * What the Profile card says under the Altitude Advisor, moved from the
 * card's body as it was: Class B entered at the altitude in sight with the
 * clearance it takes (14 CFR 91.131) and the way round it, or avoided; a
 * pilot's own altitude's cautions with the way round high ground; a tight
 * altitude; and how the altitude was chosen, folded.
 */
export default function ProfileNotes({
  nav,
  legs,
  profile,
  shownAt,
  tight,
  classBAvoided,
  onAvoidClassB,
  onAllowClassB,
  onGoRound,
  winds,
}: {
  nav: NavLogAltitude | null;
  legs: Leg[];
  profile: RouteProfile | undefined;
  shownAt: number | null;
  tight: string | null;
  classBAvoided: boolean;
  onAvoidClassB?: (detour: Detour | null) => void;
  onAllowClassB?: () => void;
  onGoRound?: (via: string[], stopIndex: number) => void;
  winds?: Totals["winds"];
}) {
  const bravo =
    profile && shownAt !== null
      ? (profile.airspace.find((a) => a.class === "B" && a.floor_ft <= shownAt && (a.ceiling_ft ?? 10_000) >= shownAt) ?? null)
      : null;
  const detours = nav?.class_b_detours ?? [];
  const cautions = nav?.cautions ?? [];
  return (
    <>
      {classBAvoided ? (
        <div className="flex items-center justify-between gap-2 rounded-xl bg-card py-1.5 pr-1.5 pl-3" data-testid="class-b-avoided">
          <span className={TEXT.detail}>Avoiding Class B</span>
          {onAllowClassB && (
            <Button type="button" size="sm" variant="ghost" className="text-tint" onClick={onAllowClassB}>
              Allow Class B
            </Button>
          )}
        </div>
      ) : (
        bravo && (
          <div className="flex items-center justify-between gap-2 rounded-xl bg-card py-1.5 pr-1.5 pl-3" data-testid="class-b-accepted">
            <span className={TEXT.detail}>Through {faaWords(bravo.name)}: clearance needed</span>
            {onAvoidClassB && (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="shrink-0 text-tint"
                onClick={() => onAvoidClassB(detours.find((d) => !d.via?.length) ?? null)}
                data-testid="avoid-class-b"
              >
                Avoid Class B
              </Button>
            )}
          </div>
        )
      )}
      {cautions.length > 0 && (
        <div
          className={cn("space-y-1.5 rounded-lg bg-caution-wash p-2.5 text-caution-ink", TEXT.detail)}
          data-testid="own-altitude-cautions"
        >
          {cautions.map((c) => (
            <div key={`${c.from_ident}-${c.to_ident}`}>
              <p className="font-semibold">
                {altFt(c.altitude_ft)} ft {c.from_ident} → {c.to_ident}
              </p>
              <ul className="list-disc pl-4">
                {c.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
          ))}
          {/* Flown over the high ground anyway, at the owner's "no hard
              limits": the way round it the planner found, to take or not. */}
          {onGoRound &&
            detours
              .filter((d) => d.via?.length)
              .map((d) => (
                <div key={d.via!.join(" ")} className="flex items-center justify-between gap-2 pt-1">
                  <span>
                    By {d.via!.join(", ")} · +{Math.round(d.added_nm)} nm
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="shrink-0 text-tint"
                    onClick={() => onGoRound(d.via!, d.stop_index)}
                    data-testid="caution-go-round"
                  >
                    Go Round
                  </Button>
                </div>
              ))}
        </div>
      )}
      {tight && (
        <p className={cn("rounded-lg bg-caution-wash p-2.5 text-caution-ink", TEXT.detail)} data-testid="tight-altitude">
          <span className="font-semibold">Tight altitude. </span>
          {tight}
        </p>
      )}
      {nav && (
        <Collapsible>
          <CollapsibleTrigger
            className={cn(
              "group relative flex min-h-11 w-full items-center gap-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring",
              GROUP_HEADING,
            )}
          >
            <ChevronRight className="size-4 text-tint transition-transform group-data-panel-open:rotate-90" aria-hidden />
            How the altitude was chosen
          </CollapsibleTrigger>
          {/* Kept in the page folded: the reasoning is found by the page's
              own search and read by its text while closed. */}
          <CollapsibleContent keepMounted>
            <AltitudeReasoning nav={nav} legs={legs} plansAbove winds={winds} />
          </CollapsibleContent>
        </Collapsible>
      )}
    </>
  );
}
