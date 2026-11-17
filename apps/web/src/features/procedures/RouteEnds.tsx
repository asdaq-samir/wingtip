import { cn } from "cn";
import CardIdent from "./CardIdent";
import { CardMark, CardThread, EmptyMark } from "./routeCard";
import { FIELD_CARD, FIELD_GAP } from "./routeListStyle";

/**
 * FPL's route before it is whole, open to edit (the one layout, decision
 * 0046; the owner, 2026-11-17: "a new plan with no route opens expanded
 * with empty Departure and Destination cards to fill"): the departure and
 * the destination each a card, as the route's airports are once it is
 * whole (FieldStep, the one card look), on the course's line; each a text
 * box, the ident typed in, its role its placeholder. The route's field
 * under them takes a whole route typed or pasted (RouteBox).
 */
export default function RouteEnds({
  dep,
  dest,
  onDep,
  onDest,
}: {
  dep: string;
  dest: string;
  onDep: (ident: string) => void;
  onDest: (ident: string) => void;
}) {
  return (
    <ol className="flex min-w-0 flex-1 flex-col pt-2 pb-1 pl-0" aria-label="The route" data-testid="route-ends">
      <EndCard value={dep} onChange={onDep} label="Departure" first />
      <EndCard value={dest} onChange={onDest} label="Destination" />
    </ol>
  );
}

function EndCard({
  value,
  onChange,
  label,
  first = false,
}: {
  value: string;
  onChange: (ident: string) => void;
  label: string;
  first?: boolean;
}) {
  return (
    <li className={cn("relative isolate flex min-h-14 items-center gap-2.5", FIELD_CARD, first && FIELD_GAP)}>
      <CardThread first={first} last={!first} />
      {/* The airport symbol on the marks' grey, faded, at the owner's ask
          (2026-11-05: "The stop icons can be airport like when empty"). */}
      <span className="grid w-7 shrink-0 place-items-center" aria-hidden="true">
        <CardMark>
          <EmptyMark />
        </CardMark>
      </span>
      {/* A text box, as the route's cards' were (CardIdent); its
          placeholder its role, in the words' own case. */}
      <div className="flex min-w-0 flex-1 pr-1.5">
        <CardIdent value={value} onCommit={onChange} placeholder={label} label={label} />
      </div>
    </li>
  );
}
