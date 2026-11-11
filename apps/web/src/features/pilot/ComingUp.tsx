import { useQuery } from "@tanstack/react-query";
import { cn } from "cn";
import { ListGroup, ListRow } from "../../components/GroupedList";
import QueryState from "../../components/QueryState";
import { said } from "../../lib/endorsements";
import { FINDING_TONE } from "../../lib/findings";
import { dueTitle, dueFinding, whenWords } from "./paperwork";
import { paperworkQuery } from "../../lib/queryClient";

/**
 * What falls due for the pilot and their airplanes, soonest first, the
 * Logbook's Coming up (GET /api/paperwork): the flight review (14 CFR
 * 61.56(c)), the medical (61.23), passengers by day and at night (61.57(a),
 * (b)), instrument currency (61.57(c)), and each airplane's annual and
 * 100-hour (91.409), ELT (91.207), static system (91.411), transponder
 * (91.413), VOR check (91.171) and the owner's ADs and items -- each with
 * its rule and the days or hours left, in the tone of how near it is.
 * The same list the reminder emails are made from.
 */
export default function ComingUp() {
  const asked = useQuery({ ...paperworkQuery, meta: { silent: true } });
  const items = asked.data?.items;
  return (
    <ListGroup title="Coming up">
      {!items ? (
        <QueryState row query={asked} fetching="Fetching what falls due…" failed="What falls due could not be fetched." />
      ) : !items.length ? (
        <ListRow muted title="Nothing dated yet: your flight review, medical and airplanes' inspections show here once given." />
      ) : (
        items.map((d) => (
          <ListRow
            key={`${d.what}-${d.aircraftId ?? ""}-${d.itemId ?? ""}`}
            data-testid="coming-up"
            title={dueTitle(d)}
            description={[d.rule, d.dueOn ? said(d.dueOn) : null].filter(Boolean).join(" · ")}
            value={<span className={cn("tabular-nums", FINDING_TONE[dueFinding(d)])}>{whenWords(d)}</span>}
          />
        ))
      )}
    </ListGroup>
  );
}
