import { cn } from "cn";
import { Badge } from "../../components/ui/badge";
import { SheetCard } from "../../components/SheetCard";
import StatusBadge from "../../components/StatusBadge";
import { NotamAsSent } from "../../components/NotamAsSent";
import { useAddressKey } from "../../lib/address";
import { stopsOf } from "../../lib/identSchema";
import { TEXT } from "../../lib/text";
import { useMinuteClock } from "../../lib/useMinuteClock";
import { instantOf } from "../../lib/format";
import { callEngine } from "../../lib/engine/engine";
import {
  cardOf,
  headingOf,
  identsOf,
  numberOf,
  readNotam,
  useFieldZone,
  whereOf,
  type FieldNotam,
  type NotamCardReading,
  type NotamReading,
} from "./fieldNotams";
import { timeLines } from "./notamTimes";
import { NotamTimeLines } from "./NotamTimeLines";
import { TfrDetails } from "./TfrDetails";

/** The chip's words for each role the engine names (notam_affects). */
const ROLE_WORDS = {
  departure: "Affects your departure",
  stop: "Affects your stop",
  arrival: "Affects your arrival",
  alternate: "Affects your alternate",
} as const;

type PlanRole = keyof typeof ROLE_WORDS;

/** What the NOTAM's field is to the planned flight, as the chip says it,
 *  or null where it is none of the address's dep, stops, dest and
 *  alternate filed, or reaches none of them. Which roles it reaches, and
 *  whether it takes a procedure one flies (red) or is the field's
 *  (neutral), is the engine's notam_affects (the r8 audit's S-M1). */
function usePlanRole(n: FieldNotam, ident: string): { words: string; taken: boolean } | null {
  const [dep] = useAddressKey("dep");
  const [dest] = useAddressKey("dest");
  const [alternate] = useAddressKey("alternate");
  const [stops] = useAddressKey("stops");
  const idents = identsOf(ident);
  const upper = idents.map((i) => i.toUpperCase());
  const is = (field: string | null) => !!field && upper.includes(field.toUpperCase());
  const plays: Record<PlanRole, boolean> = {
    departure: is(dep),
    stop: stopsOf(stops).some(is),
    arrival: is(dest),
    alternate: is(alternate),
  };
  const roles = (Object.keys(plays) as PlanRole[]).filter((r) => plays[r]);
  if (roles.length === 0) return null;
  const [first] = callEngine("notam_affects", { text: n.raw, idents, roles }).affects;
  return first ? { words: ROLE_WORDS[first.role], taken: first.taken } : null;
}

/** Whether it is in force now, the shared StatusBadge (the owner,
 *  2026-11-11: "put a active and inactive badge on each notam"; 2026-11-14:
 *  "Use badges where we can"): Active; Later where it starts later; and
 *  Inactive, the owner's word, in the cold fill where it is out of force
 *  otherwise. In force unless the planner says it is not (in_force false). */
export function NotamState({ n }: { n: FieldNotam }) {
  const active = n.in_force !== false;
  // Read as fieldNotams' dateOf reads it: no zone is UTC, not local.
  const starts = instantOf(n.starts);
  const now = useMinuteClock();
  const later = !active && starts !== null && starts > now;
  return (
    <StatusBadge variant={active ? "active" : later ? "later" : "cold"} className="w-fit shrink-0" data-testid="place-notam-state">
      {active || later ? undefined : "Inactive"}
    </StatusBadge>
  );
}

/** The procedures it takes away, by their charted names in capitals and
 *  their numbers ("ADELL 8 · BLOKR 8 ... (RNAV)"; the owner, 2026-11-23),
 *  RNAV said once where every one is. */
function NotAuthorized({ card }: { card: NotamCardReading }) {
  const all = card.procedures.every((p) => p.rnav);
  const names = card.procedures.map((p) => (p.rnav && !all ? `${p.name} (RNAV)` : p.name)).join(" · ");
  return (
    <div className="flex flex-col gap-0.5" data-testid="place-notam-not-authorized">
      <span className={cn("text-muted-foreground", TEXT.note)}>Not authorized</span>
      <span className={TEXT.prose}>{`${names}${all ? " (RNAV)" : ""}`}</span>
    </div>
  );
}

/**
 * One NOTAM in full (the owner, 2026-11-23, of FDC 6/3373): its category
 * as a small label, chips -- Active or not, Permanent, and that it
 * affects the planned flight -- one plain sentence of its effect, the
 * procedures it takes away, its times in words, and its text as sent
 * folded beneath, never rewritten. Each the engine's (notam_card, read
 * from its parts); where it cannot structure one, the NOTAM's words
 * written out (notam_read) stand in, as before. A TFR's place,
 * instructions and whom to call are TfrDetails'.
 */
function NotamFull({ n, ident, card, read }: { n: FieldNotam; ident: string; card: NotamCardReading; read: NotamReading }) {
  const tfr = n.kind === "tfr";
  // Only one in force affects the flight: an expired NOTAM, or one not
  // yet begun, at the departure wore the red chip beside its own Inactive
  // (the r5-ui audit's M6, 2026-11-23). Red only where it takes a
  // procedure away; a crane's light at the field is the neutral chip.
  const active = n.in_force !== false;
  const role = usePlanRole(n, ident);
  // On the minute clock NotamState keeps, so "in 18d" moves on with it.
  const times = timeLines(n, read, card.until_charts, useFieldZone(ident), useMinuteClock());
  const where = whereOf(n, read);
  // The category is a label only where the title says what happened;
  // otherwise it is the title already (NotamCard).
  const label = !tfr && card.title ? card.category : null;
  return (
    <div className="flex flex-col gap-3 pb-6" data-testid="place-notam-full">
      {label && (
        <span className={cn("text-muted-foreground", TEXT.note)} data-testid="place-notam-category">
          {label}
        </span>
      )}
      <div className="flex flex-wrap gap-2" data-testid="place-notam-chips">
        <NotamState n={n} />
        {!tfr && card.permanent && (
          <Badge variant="secondary" className={TEXT.badge}>
            Permanent
          </Badge>
        )}
        {role && active && (
          <Badge variant={role.taken ? "destructive" : "secondary"} className={TEXT.badge} data-testid="place-notam-affects">
            {role.words}
          </Badge>
        )}
      </div>
      {!tfr && (
        <p className={cn(TEXT.prose, n.in_force === false && "text-muted-foreground")} data-testid="place-notam-effect">
          {card.effect ?? read.words}
        </p>
      )}
      {!tfr && card.procedures.length > 0 && <NotAuthorized card={card} />}
      <NotamTimeLines lines={times} className={TEXT.prose} />
      {where && (
        <p className={cn("text-muted-foreground", TEXT.prose)} data-testid="place-notam-where">
          {where}
        </p>
      )}
      {tfr && <TfrDetails n={n} />}
      <NotamAsSent label={tfr ? "TFR as Sent" : "As Sent"} raw={n.raw} />
    </div>
  );
}

/** Its number as a briefer reads it: an FDC NOTAM's with its
 *  accountability ("FDC 6/3373", JO 7930.2 4-2-1), the field's own
 *  without the field's name ("NOTAM 11/060"). */
function numberLine(n: FieldNotam, ident: string, card: NotamCardReading, read: NotamReading): string {
  return card.account === "FDC" && read.number ? `FDC ${read.number}` : `NOTAM ${numberOf(n, ident)}`;
}

/** One NOTAM's card over the airport's: titled what happened (the
 *  engine's notam_card, "Runway 18/36 closed"), else what kind it is
 *  (headingOf), the field and its number under it ("KARR Aurora
 *  Municipal · FDC 6/3373"). */
export function NotamCard({ n, ident, name, onClose }: { n: FieldNotam; ident: string; name?: string | null; onClose: () => void }) {
  // Asked of the engine once a render, each a trip through its WASM, and
  // handed down (the r5-ui audit's L13).
  const card = cardOf(n, ident);
  const read = readNotam(n, ident);
  const title = n.kind === "tfr" ? null : card.title;
  const field = name ? `${ident} ${name}` : ident;
  return (
    <SheetCard
      title={title ?? headingOf(n, ident)}
      description={`${field} · ${numberLine(n, ident, card, read)}`}
      onClose={onClose}
      testId="place-notam-card"
    >
      <NotamFull n={n} ident={ident} card={card} read={read} />
    </SheetCard>
  );
}
