import { Link2 } from "lucide-react";
import { DropdownMenuItem } from "../../components/ui/dropdown-menu";
import type { Candidate, Course } from "../../lib/api/types";
import { useShareLink } from "./useShareLink";

/** The route as typed: its departure, stops and destination. */
interface Planned {
  dep: string;
  dest: string;
  stops: string[];
}

/** The route a card's menu shares, the same for every card. */
export interface SharedRoute {
  planned: Planned;
  course: Course | null;
  selected: Candidate[];
  altitudeFt: number | undefined;
  /** A route planned whole, its nav log in. */
  routed: boolean;
  /** A local flight, round one field: no kneeboard card. */
  local: boolean;
}

/** The plan, to another pilot or an instructor, as a link that opens as
 *  a preview (useShareLink): the share sheet where the browser has one
 *  (Safari on an iPhone), otherwise copied. In the route's ••• since
 *  Share left the floating bar (the owner, 2026-11-17: "Yes to changing
 *  share to ... button"); each card's, its link. Only once it is routed. */
export function ShareLinkItem({ route }: { route: SharedRoute }) {
  const { share } = useShareLink(route.planned, route.altitudeFt);
  if (!route.routed) return null;
  return (
    <DropdownMenuItem onClick={() => void share()} data-testid="share-link">
      <Link2 />
      Share link
    </DropdownMenuItem>
  );
}
