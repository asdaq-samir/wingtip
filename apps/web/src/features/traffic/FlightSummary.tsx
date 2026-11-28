import { cn } from "cn";
import StatusBadge from "../../components/StatusBadge";
import LiveAge from "../../components/LiveAge";
import { Progress } from "../../components/ui/progress";
import { useGeo, type LatLon } from "../../lib/geo";
import { useClock } from "../../lib/useMinuteClock";
import { type Fix } from "../../lib/map/position/ownShip";
import { carriedOn, closestApproach, nearInHeight } from "../../lib/traffic";
import type { TrafficAircraft } from "../../lib/api/types";
import { TEXT } from "../../lib/text";
import { altFt, bearing, clockTime, knots, reportedAltitude } from "../../lib/format";
import { awayFrom, nmAway } from "../../lib/useAway";
import AirplaneSketch from "./AirplaneSketch";
import { squawkMeaning } from "./squawks";
import { lasted } from "../../components/airplane/pastFlightFormat";
import { End, EndPending } from "./FlightEnds";
import { SkeletonLine } from "../../components/QueryState";
import { useEngineReady } from "../../lib/engine/useEngineReady";
import { arrivalOf } from "./arrival";

/** The summary's corner: climbing, level or descending in the air; on the
 *  ground; or an emergency's code (AIM 6-2-2, 6-3-4, 6-4-2). */
export interface StateBadge {
  word: string;
  tone: "air" | "ground" | "alarm";
}

/** Each state's StatusBadge (design/tokens.json's fills, white words). */
const STATUS = { air: "inAir", ground: "ground", alarm: "emergency" } as const;

/** Feet against own ship's: "500 ft above", "1,200 ft below", "level". */
function against(feet: number): string {
  const rounded = Math.round(feet / 100) * 100;
  if (rounded === 0) return "level";
  return `${altFt(Math.abs(rounded))} ft ${rounded > 0 ? "above" : "below"}`;
}

type Latest = { plane: TrafficAircraft; at: number } | null;

/** Where it is now, carried on from its report as the map draws it, on a
 *  clock of its own: only the parts that move each second redraw, not the
 *  card around them. */
function useHere(latest: Latest) {
  const geo = useGeo();
  const now = useClock(1000, !!latest);
  return { geo, now, here: geo && latest ? carriedOn(geo, latest.plane, (now - latest.at) / 1000) : null };
}

/** The flight's summary with what moves each second worked out here:
 *  how long it has flown, how far along it is (the miles flown from the
 *  field it left against those still to go; a flight landed all the way),
 *  how far it is from own ship and its closest approach. */
export function FlightNow({
  latest,
  fields,
  fix,
  ...rest
}: Omit<Parameters<typeof FlightSummary>[0], "now" | "progress" | "fromYou" | "cpa" | "arrives"> & {
  latest: Latest;
  fields: { from: LatLon | null; to: LatLon | null; landed: boolean };
}) {
  const { geo, now, here } = useHere(latest);
  const plane = rest.plane;
  const progress = plane
    ? geo && fields.from && fields.to && here
      ? (() => {
          const done = geo.distanceNm(fields.from, here),
            left = geo.distanceNm(here, fields.to);
          return done + left > 0 ? done / (done + left) : null;
        })()
      : null
    : fields.landed
      ? 1
      : null;
  const cpa = fix && plane && here ? closestApproach(fix, { ...plane, ...here }) : null;
  // When it reaches the field it is bound for, direct at its ground speed
  // (the engine's in_flight, arrivalOf); none until the engine is in.
  const engine = useEngineReady();
  const arrives = engine && plane && here && fields.to ? arrivalOf(here, plane, fields.to, now) : null;
  return (
    <FlightSummary
      {...rest}
      fix={fix}
      now={now}
      progress={progress}
      fromYou={geo && fix && here ? awayFrom(geo, fix, here) : null}
      cpa={cpa}
      arrives={arrives}
    />
  );
}

/** The sketch of where it has flown, its airplane carried on each second. */
export function LiveSketch({ latest, ...props }: Omit<Parameters<typeof AirplaneSketch>[0], "now"> & { latest: Latest }) {
  const { here } = useHere(latest);
  return <AirplaneSketch {...props} now={here && latest ? { ...here, altFt: latest.plane.altitude_ft ?? null } : null} />;
}

/**
 * The flight, the airplane card's first slide (the owner's A2, then its word of 2026-11-26): its ends with a bar as far
 * along as it has flown, its height, climb, ground speed, track and time up
 * -- or, not heard now, where its last flight landed -- then an emergency's
 * code and, with own ship on, how far, which way and how near it comes.
 * Seconds-old adsb.lol data: for knowing what is about, not avoiding it.
 */
function FlightSummary({
  plane,
  badge,
  chip,
  from,
  to,
  progress,
  departedAt,
  now,
  fix,
  fromYou,
  cpa,
  arrives,
  onOpenAirport,
  pending = false,
  className,
}: {
  /** Its ends, or its last flight's, still asked for: their lines held from
   *  the first frame, so nothing under them moves. */
  pending?: boolean;
  plane: TrafficAircraft | null;
  badge: StateBadge | null;
  /** Not heard now: "Landed KPSM 16:02", "Last heard 3 Oct". */
  chip: string | null;
  from: { ident: string; place: string | null } | null;
  to: { ident: string; place: string | null } | null;
  /** How far along, 0 to 1, where both ends and where it is are known. */
  progress: number | null;
  /** When it took off, while it flies (useFlightLive's). */
  departedAt: number | null;
  now: number;
  fix: Fix | null;
  fromYou: string | null;
  cpa: { inMin: number; nm: number; aboveFt: number | null } | null;
  /** When it reaches the field it is bound for, Unix seconds (arrivalOf). */
  arrives: number | null;
  onOpenAirport?: (ident: string) => void;
  /** Its box's look where it is laid out (the airplane card's first slide). */
  className?: string;
}) {
  const rate = plane?.vertical_fpm ?? 0;
  const squawk = plane?.squawk ?? null;
  const meaning = squawkMeaning(squawk);
  const climb = Math.abs(rate) >= 100 ? `${rate > 0 ? "↑" : "↓"} ${altFt(Math.abs(Math.round(rate / 100) * 100))} fpm` : "level";
  const flown = plane && departedAt ? lasted(now / 1000 - departedAt) : null;
  const open = (ident: string) => (onOpenAirport ? () => onOpenAirport(ident) : undefined);
  return (
    <div
      className={cn("mt-3 flex flex-col gap-2 rounded-xl bg-card px-3.5 py-3 ring-1 ring-border/60", className)}
      data-testid={plane ? "flight-now" : "flight-last"}
    >
      <div className={cn("flex items-center gap-2 font-semibold", TEXT.note)}>
        {/* Flying, the In the air badge first, then how (CLB, DES, LVL)
            and how long; an emergency's code its own badge before it; on
            the ground, GND. The statuses a pilot scans for are badges, the
            words that explain them text (docs/design/rules.md 9). */}
        {badge && badge.tone !== "air" && (
          <StatusBadge variant={STATUS[badge.tone]} data-testid="flight-state">
            {badge.word}
          </StatusBadge>
        )}
        {plane ? (
          <>
            <StatusBadge variant="inAir" />
            <span className="text-foreground">
              {badge?.tone === "air" && <span data-testid="flight-state">{badge.word}</span>}
              {badge?.tone === "air" && flown && " · "}
              {flown}
            </span>
            {/* Its everyday code on its state's line (the owner, 2026-11-27:
                "Squawk can go to in the air card"); an emergency's is its
                badge and its own line below. */}
            {squawk && !meaning && (
              <span className="text-muted-foreground tabular-nums" data-testid="flight-squawk">
                Squawk {squawk}
              </span>
            )}
            {/* How long ago it was heard, greyed once the engine says its
                position is old (LiveAge, traffic_fresh; decision 0045). */}
            <LiveAge
              at={now - (plane.seen_s ?? 0) * 1000}
              what={{ traffic: true }}
              now={now}
              className="ml-auto"
              testId="flight-heard-age"
            />
          </>
        ) : (
          <span className="text-muted-foreground">Not heard now</span>
        )}
      </div>
      {/* Its ends' row always there, so nothing under it moves as its ends
          come in or come back empty (traffic.spec's
          card opening at its size):
          held while they are asked for, "—" for
          an end not known. */}
      {from ? (
        <div className="grid grid-cols-[minmax(0,auto)_minmax(2rem,1fr)_minmax(0,auto)] items-center gap-3">
          <End
            ident={from.ident}
            place={from.place}
            at={departedAt ? clockTime(new Date(departedAt * 1000)) : null}
            onOpen={from.ident !== "?" ? open(from.ident) : undefined}
            testId={departedAt ? "flight-departed" : undefined}
            // The field it left, while it flies.
            openTestId={plane ? "flight-airport" : undefined}
          />
          {/* As far along as it has flown, the stock Progress; a plain line
              where that cannot be said (no field it is bound for). */}
          {progress != null ? (
            <Progress value={Math.round(progress * 100)} aria-label="Of the way flown" className="h-1 bg-foreground/15" />
          ) : (
            <div className="h-1 rounded-full bg-foreground/15" />
          )}
          <End
            right
            ident={to?.ident ?? "Now"}
            place={to?.place ?? null}
            onOpen={to ? open(to.ident) : undefined}
            testId={plane ? "flight-bound" : undefined}
          />
        </div>
      ) : (
        <div className="grid grid-cols-[minmax(0,auto)_minmax(2rem,1fr)_minmax(0,auto)] items-center gap-3" aria-hidden={pending}>
          {pending ? <EndPending /> : <End ident="—" />}
          <div className="h-1 rounded-full bg-foreground/15" />
          {pending ? <EndPending right /> : <End right ident="—" />}
        </div>
      )}
      {plane ? (
        <span className={cn("font-semibold text-foreground tabular-nums", TEXT.detail)} data-testid="flight-altitude">
          {reportedAltitude(plane.altitude_ft)} {climb}
          {" · "}
          {plane.speed_kt == null ? "—" : knots(plane.speed_kt)}
          {/* ADS-B's track is over the ground and true, not magnetic; "true"
              kept on the track's line by a no-break space, where it wrapped
              alone (the owner's screenshot, 2026-11-26). */}
          {plane.track_deg != null && ` · ${bearing(plane.track_deg)}\u00a0true`}
        </span>
      ) : null}
      {plane && arrives !== null && to ? (
        // Its arrival, direct at the speed it is making (the owner's design, 2026-11-26).
        <span className={cn("text-muted-foreground tabular-nums", TEXT.detail)} data-testid="flight-arrives">
          {`Arrives ${to.ident} ${clockTime(new Date(arrives * 1000))} · in ${lasted(arrives - now / 1000)}`}
        </span>
      ) : null}
      {plane ? null : chip ? (
        <span className={cn("font-semibold text-foreground", TEXT.detail)} data-testid="flight-chip">
          {chip}
        </span>
      ) : (
        pending && (
          <span className={TEXT.detail} aria-hidden="true">
            <SkeletonLine className="w-40" />
          </span>
        )
      )}
      {squawk && meaning && (
        // An emergency's code where it is seen first (AIM 6-2-2, 6-3-4, 6-4-2).
        <span className={cn("font-semibold text-destructive-ink tabular-nums", TEXT.detail)}>
          Squawk {squawk} · {meaning}
        </span>
      )}
      {plane && fix && fromYou && (
        <span className={cn("text-muted-foreground", TEXT.detail)}>
          {`${fromYou} of you`}
          {fix.altitudeFt != null && plane.altitude_ft != null ? `, ${against(plane.altitude_ft - fix.altitudeFt)}` : ""}
          {cpa && (
            <span className={cn(cpa.nm < 1 && (cpa.aboveFt == null || nearInHeight(cpa.aboveFt)) && "font-semibold text-destructive-ink")}>
              {" · closest "}
              {cpa.inMin < 0.5 ? "now, drawing apart" : `in ${Math.round(cpa.inMin)} min`}
              {`: ${nmAway(cpa.nm)}${cpa.aboveFt != null ? `, ${against(cpa.aboveFt)}` : ""}`}
            </span>
          )}
        </span>
      )}
    </div>
  );
}
