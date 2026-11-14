import { cn } from "cn";
import StatusBadge from "../../../components/StatusBadge";
import { Button } from "../../../components/ui/button";
import { Progress } from "../../../components/ui/progress";
import { useGeo, type LatLon } from "../../../lib/geo";
import { useClock } from "../../../lib/useMinuteClock";
import { type Fix } from "../../../lib/map/position/ownShip";
import { carriedOn, closestApproach, nearInHeight } from "../map/traffic";
import type { TrafficAircraft } from "../../../lib/api/types";
import { TEXT } from "../../../lib/text";
import { altFt, bearing, clockTime, reportedAltitude } from "../../../lib/format";
import { awayFrom, nmAway } from "../../../lib/useAway";
import AirplaneSketch from "./AirplaneSketch";
import { squawkMeaning } from "../lib/squawks";
import { lasted } from "./pastFlightFormat";

/** The state on the summary's corner: climbing, level or descending in
 *  the air; on the ground; or an emergency's code (AIM 6-2-2, 6-3-4,
 *  6-4-2). */
export interface StateBadge {
  word: string;
  tone: "air" | "ground" | "alarm";
}

/** Each state's StatusBadge: the emergency's red, the air's teal, the
 *  ground's dark grey, white on each (design/tokens.json). */
const STATUS = { air: "inAir", ground: "ground", alarm: "emergency" } as const;

/** Feet against own ship's: "500 ft above", "1,200 ft below", "level". */
function against(feet: number): string {
  const rounded = Math.round(feet / 100) * 100;
  if (rounded === 0) return "level";
  return `${altFt(Math.abs(rounded))} ft ${rounded > 0 ? "above" : "below"}`;
}

type Latest = { plane: TrafficAircraft; at: number } | null;

/** Where it is now, carried on from its report as the map draws it
 *  (lib/geo), on a clock of its own: the card's parts that move each
 *  second (the summary's age and closest approach, the sketch's airplane)
 *  each count it, and the 700-line card around them is drawn again only
 *  when what it shows changes (the 6 Nov audit's W7, WEB-36). */
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
}: Omit<Parameters<typeof FlightSummary>[0], "now" | "progress" | "fromYou" | "cpa"> & {
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
  return (
    <FlightSummary
      {...rest}
      fix={fix}
      now={now}
      progress={progress}
      fromYou={geo && fix && here ? awayFrom(geo, fix, here) : null}
      cpa={cpa}
    />
  );
}

/** The sketch of where it has flown, its airplane carried on each second. */
export function LiveSketch({ latest, ...props }: Omit<Parameters<typeof AirplaneSketch>[0], "now"> & { latest: Latest }) {
  const { here } = useHere(latest);
  return <AirplaneSketch {...props} now={here && latest ? { ...here, altFt: latest.plane.altitude_ft ?? null } : null} />;
}

/** One end of the flight in its summary: the field's ident, a tap that
 *  opens its card where there is one to open, and its town under it. */
function End({
  ident,
  place,
  at,
  right = false,
  onOpen,
  testId,
  openTestId,
}: {
  ident: string;
  place?: string | null;
  at?: string | null;
  right?: boolean;
  onOpen?: () => void;
  testId?: string;
  openTestId?: string;
}) {
  const name = <span className={cn("max-w-full truncate font-bold", TEXT.title)}>{ident}</span>;
  return (
    <span className={cn("flex min-w-0 flex-col", right && "items-end text-right")} data-testid={testId}>
      {onOpen ? (
        <Button
          variant="link"
          size="inline"
          onClick={onOpen}
          aria-label={`${ident}'s card`}
          data-testid={openTestId}
          className="relative max-w-full after:absolute after:-inset-x-2 after:-inset-y-3"
        >
          {name}
        </Button>
      ) : (
        <span className="text-foreground">{name}</span>
      )}
      {place && <span className={cn("max-w-full truncate text-muted-foreground", TEXT.note)}>{place}</span>}
      {at && <span className={cn("max-w-full truncate text-muted-foreground tabular-nums", TEXT.note)}>{at}</span>}
    </span>
  );
}

/**
 * The flight in a card under the actions, at the owner's pick of the
 * redesign (A2): where it left and where it is bound, a bar between them
 * as far along as it has flown, and how it is flying -- its height and
 * climb, its ground speed, its true track and how long it has been up --
 * or, not heard now, where its last flight landed and when. Under them an
 * emergency's code, and with own ship on, how far and which way it is and
 * when and how near it comes. Seconds-old internet data from adsb.lol's
 * receivers: for knowing what is about, not for avoiding it.
 */
function FlightSummary({
  plane,
  badge,
  chip,
  from,
  to,
  progress,
  startedAt,
  departedAt,
  now,
  fix,
  fromYou,
  cpa,
  onOpenAirport,
  airport,
}: {
  plane: TrafficAircraft | null;
  badge: StateBadge | null;
  /** Not heard now: "Landed KPSM 16:02", "Last heard 3 Oct". */
  chip: string | null;
  from: { ident: string; place: string | null } | null;
  to: { ident: string; place: string | null } | null;
  /** How far along, 0 to 1, where both ends and where it is are known. */
  progress: number | null;
  startedAt: number | null;
  departedAt: number | null;
  now: number;
  fix: Fix | null;
  fromYou: string | null;
  cpa: { inMin: number; nm: number; aboveFt: number | null } | null;
  onOpenAirport?: (ident: string) => void;
  /** The field the airport tap was for: the card's Airport tile's. */
  airport: string | null;
}) {
  const rate = plane?.vertical_fpm ?? 0;
  const squawk = plane?.squawk ?? null;
  const meaning = squawkMeaning(squawk);
  const climb = Math.abs(rate) >= 100 ? `${rate > 0 ? "↑" : "↓"} ${altFt(Math.abs(Math.round(rate / 100) * 100))} fpm` : "level";
  const flown = plane && startedAt ? lasted(now / 1000 - startedAt) : null;
  const open = (ident: string) => (onOpenAirport ? () => onOpenAirport(ident) : undefined);
  return (
    <div
      className="mt-3 flex flex-col gap-2 rounded-xl bg-card px-3.5 py-3 ring-1 ring-border/60"
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
            <StatusBadge variant="inAir" data-testid="flight-air" />
            <span className="text-foreground">
              {badge?.tone === "air" && <span data-testid="flight-state">{badge.word}</span>}
              {badge?.tone === "air" && flown && " · "}
              {flown}
            </span>
          </>
        ) : (
          <span className="text-muted-foreground">Not heard now</span>
        )}
      </div>
      {from && (
        <div className="grid grid-cols-[minmax(0,auto)_minmax(2rem,1fr)_minmax(0,auto)] items-center gap-3">
          <End
            ident={from.ident}
            place={from.place}
            at={departedAt ? clockTime(new Date(departedAt * 1000)) : null}
            onOpen={from.ident !== "?" ? open(from.ident) : undefined}
            testId={departedAt ? "flight-departed" : undefined}
            openTestId={from.ident === airport ? "flight-airport" : undefined}
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
            openTestId={to && to.ident === airport && to.ident !== from.ident ? "flight-airport" : undefined}
          />
        </div>
      )}
      {plane ? (
        <span className={cn("font-semibold text-foreground tabular-nums", TEXT.detail)} data-testid="flight-altitude">
          {reportedAltitude(plane.altitude_ft)} {climb}
          {" · "}
          {plane.speed_kt == null ? "—" : `${Math.round(plane.speed_kt)} kt`}
          {/* ADS-B's track is over the ground and true, not magnetic. */}
          {plane.track_deg != null && ` · ${bearing(plane.track_deg)} true`}
        </span>
      ) : (
        chip && (
          <span className={cn("font-semibold text-foreground", TEXT.detail)} data-testid="flight-chip">
            {chip}
          </span>
        )
      )}
      {squawk && meaning && (
        // An emergency's code where it is seen first (AIM 6-2-2, 6-3-4, 6-4-2).
        <span className={cn("font-semibold text-destructive-ink tabular-nums", TEXT.detail)} data-testid="flight-squawk-alarm">
          Squawk {squawk} · {meaning}
        </span>
      )}
      {plane && fix && fromYou && (
        <span className={cn("text-muted-foreground", TEXT.detail)} data-testid="flight-from-you">
          {`${fromYou} of you`}
          {fix.altitudeFt != null && plane.altitude_ft != null ? `, ${against(plane.altitude_ft - fix.altitudeFt)}` : ""}
          {cpa && (
            <span
              data-testid="flight-closest"
              className={cn(cpa.nm < 1 && (cpa.aboveFt == null || nearInHeight(cpa.aboveFt)) && "font-semibold text-destructive-ink")}
            >
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
