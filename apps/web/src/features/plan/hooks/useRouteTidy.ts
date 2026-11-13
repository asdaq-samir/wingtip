import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Address, AddressChange, SetAddress } from "../../../lib/address";
import { FIELD_LIST_KEYS, fieldListParams, fieldListsOf, prunedFieldLists } from "../lib/fieldLists";
import { identOf } from "../../../lib/identSchema";
import { sameField } from "../../../lib/procedures";
import { airportQuery } from "../../../lib/queryClient";
import { renamed, type PlannedRoute } from "./planAddress";
import { procedureKind } from "./useRouteEdits";

/**
 * The address kept tidy as the route changes (usePlanWorkspace): its ends
 * named by the airport's own ident once their cards are in, and the picks
 * at fields the route no longer has let go. With whether the destination
 * has any approach, from its card.
 */
export function useRouteTidy({ planned, address, setAddress }: { planned: PlannedRoute; address: Address; setAddress: SetAddress }) {
  // The ident as a string of its own (`${…}`): the route's object's field
  // handed straight to a function counted, to the React Compiler, as the
  // object handed over and maybe changed, and it gave up every memo after.
  const { data: destCard } = useQuery({ ...airportQuery(`${planned.dest}`), enabled: !!planned.dest });
  const typedDep = `${planned.dep}`,
    typedDest = `${planned.dest}`;
  const { data: depCard } = useQuery({ ...airportQuery(typedDep), enabled: !!identOf(typedDep) });
  // The route's ends by the airport's own ident once its card is in, the
  // ICAO code where it has one: "ORD" typed is KORD in the box, the list
  // and the nav log, at the owner's ask; C81, with none, stays C81. Its
  // stops stay as typed: three letters there may name a VOR.
  const depNamed = depCard?.ident,
    destNamed = destCard?.ident;
  useEffect(() => {
    const named = (card: string | undefined, typed: string) => (card && card !== typed && sameField(card, typed) ? card : null);
    const swaps = [
      [typedDep, named(depNamed, typedDep)],
      [typedDest, named(destNamed, typedDest)],
    ].flatMap(([typed, card]) => (typed && card ? [[typed, card] as const] : []));
    if (!swaps.length) return;
    void setAddress((prev) =>
      swaps.reduce<AddressChange>((change, [typed, card]) => ({ ...change, ...renamed({ ...prev, ...change }, typed, card) }), {}),
    );
  }, [depNamed, destNamed, typedDep, typedDest, setAddress]);
  // Whatever changed the route -- a stop added from a card, the Class B
  // detour taken out, a link opened with picks for fields it no longer
  // has -- the picks at fields it no longer has go (features/plan/lib/fieldLists), as
  // setRoute takes them in the same change. Not while a Direct to holds the
  // route (`was`): Cancel brings the route back, with its picks.
  const stops = planned.stops;
  const prunedRoute = `${planned.dep}|${stops.join(",")}|${planned.dest}`;
  const prunedFor = useRef("");
  useEffect(() => {
    if (prunedFor.current === prunedRoute) return;
    prunedFor.current = prunedRoute;
    if (address.was !== null || (!planned.dep && !planned.dest)) return;
    const route = { dep: planned.dep, stops, dest: planned.dest };
    const lists = fieldListsOf(address);
    const now = fieldListParams(lists);
    const kept = fieldListParams(prunedFieldLists(lists, route, procedureKind));
    if (FIELD_LIST_KEYS.every((key) => kept[key] === now[key])) return;
    void setAddress((prev) => fieldListParams(prunedFieldLists(fieldListsOf(prev), route, procedureKind)));
  }, [prunedRoute, address, planned.dep, planned.dest, stops, setAddress]);
  // Greyed only once its card says it has none; a planner older than the
  // list says nothing, and the button stays.
  const noApproaches = !!destCard?.procedures && !destCard.procedures.some((c) => c.kind === "IAP");
  return { noApproaches };
}
