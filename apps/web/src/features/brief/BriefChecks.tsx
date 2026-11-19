import { useContext } from "react";
import { Info } from "lucide-react";
import { cn } from "cn";
import FindingIcon from "../../components/FindingIcon";
import { ListGroup, ListRow } from "../../components/GroupedList";
import { useTicked, usePreflight } from "./preflight";
import { FINDING_TONE, type Finding } from "../../lib/findings";
import { TEXT } from "../../lib/text";
import type { VerdictItem, Where } from "../../lib/verdict";
import { GoToTab, LEGS } from "../plan";

/** A check the planner does not make, and where the pilot makes it: the
 *  FAA's NOTAM and flow-control feeds need an operator's credentials. */
interface Elsewhere {
  key: string;
  label: string;
  detail: string;
  /** Opened in the browser: where a pilot reads it. */
  href?: string;
  /** Or a place in the briefing. */
  at?: Where;
}

/** 14 CFR 91.103's other three, beside the Go / No-Go's seven: NOTAMs
 *  ("all available information", AIM 5-1-3), known ATC delays and the
 *  alternatives if the flight cannot be completed (91.103(a)). */
// After the Go / No-Go's, the alternates first, beside the route's
// findings, then the two read on the FAA's own pages (option A).
const ELSEWHERE: Elsewhere[] = [
  { key: "alternatives", label: "Alternates", detail: "Divert from any leg", at: { tab: "enroute", section: LEGS } },
  { key: "notams", label: "NOTAMs", detail: "1800wxbrief.com", href: "https://www.1800wxbrief.com" },
  { key: "delays", label: "ATC Delays", detail: "fly.faa.gov", href: "https://www.fly.faa.gov" },
];

/**
 * Preflight's checks, at the owner's pick of option A (2026-11-19): one
 * grouped list, as Settings and the Brief's overview are, a row a check
 * -- the Go / No-Go's (lib/verdict: the weather, the airspace, the
 * altitude, the fuel, the runways, the loading and the risk), in the
 * engine's order, then 14 CFR 91.103's other three -- each with its mark
 * and its finding, opening where it is said in full: a section of the
 * Brief (`onOpen`, for one on this page, folded until then), FPL's legs,
 * or the FAA's own page. Whether to go is over it, under the Brief's name
 * (VerdictPill). A row opened is a check looked at, counted beside the
 * list's title for this flight (features/brief/preflight's ticks: another
 * route or time starts again). They were tiles, two to a row.
 */
export default function BriefChecks({
  items,
  flight,
  here,
  onOpen,
}: {
  items: VerdictItem[];
  /** The flight the looks are for: its route and time. */
  flight: string;
  /** The sections of this page a row opens, by their titles. */
  here: string[];
  /** A section of this page opened, before it is scrolled to. */
  onOpen: (section: string) => void;
}) {
  const go = useContext(GoToTab);
  const looked = useTicked(flight);
  const tick = usePreflight((s) => s.tick);
  const keys = [...items.map((i) => i.key), ...ELSEWHERE.map((e) => e.key)];
  const seen = keys.filter((key) => looked[key]).length;
  const open = (key: string, at: Where | undefined) => {
    tick(flight, key, true);
    if (!at) return;
    if (at.section && at.tab === "preflight" && here.includes(at.section)) onOpen(at.section);
    go(at.tab, at.section);
  };
  // A finding to look at says itself under the check's name, where it has
  // room for its words; a check that is fine, or one made elsewhere, at the
  // row's end.
  const words = (finding: Finding | "elsewhere", detail: string) =>
    finding === "stop" || finding === "caution"
      ? { description: <span className={finding === "stop" ? FINDING_TONE.stop : undefined}>{detail}</span> }
      : { value: detail };
  return (
    <div className="py-3" data-testid="verdict" data-title="Go / No-Go">
      <ListGroup
        title="Checks"
        action={
          <span className={cn("pb-1.5 text-muted-foreground", TEXT.detail)} data-testid="preflight-count">
            {seen === keys.length ? "All looked at" : `${seen} of ${keys.length} looked at`}
          </span>
        }
      >
        {items.map((i) => (
          <ListRow
            key={i.key}
            media={<FindingIcon finding={i.finding} />}
            title={
              <>
                {i.label}
                {looked[i.key] && <span className="sr-only">, looked at</span>}
              </>
            }
            {...words(i.finding, i.detail)}
            chevron
            onClick={() => open(i.key, i)}
            data-testid={`verdict-${i.key}`}
            data-finding={i.finding}
            data-looked={looked[i.key] || undefined}
          />
        ))}
        {ELSEWHERE.map((e) => (
          <ListRow
            key={e.key}
            media={<Info className="size-5 text-muted-foreground" aria-hidden />}
            title={
              <>
                {e.label}
                {looked[e.key] && <span className="sr-only">, looked at</span>}
              </>
            }
            value={e.detail}
            href={e.href}
            chevron={!e.href}
            onClick={() => (e.href ? tick(flight, e.key, true) : open(e.key, e.at))}
            data-testid={`check-${e.key}`}
            data-looked={looked[e.key] || undefined}
          />
        ))}
      </ListGroup>
    </div>
  );
}
