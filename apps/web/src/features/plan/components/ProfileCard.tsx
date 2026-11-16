import type { ReactNode } from "react";
import { TriangleAlert } from "lucide-react";
import { cn } from "cn";
import { CardHead } from "../../../components/CardHead";
import { TEXT } from "../../../lib/text";

/**
 * The Profile's card over FPL while a dry run flies (PlanCards): the side
 * view is FPL's Profile tab (FplTabs; the owner, 2026-11-14), and a dry run
 * started there plays in this card, its play, scrub and stop and the
 * flight's figures kept in sight while the sheet's pages give way to the
 * flying screen (MapPanel's `flying`). Its bar's Share where Back was, the
 * route's Share menu, at the owner's ask ("Profile needs the share instead
 * of the back button like brief").
 */
export default function ProfileCard({
  name,
  sub,
  line,
  cautions = [],
  onClose,
  children,
}: {
  /** Its head, as the Brief's is: the route's name, and under it where
   *  from and to, the airplane, the altitude and when -- the tab bar over
   *  it says "Profile" already (the owner's "titles appear twice"). */
  name: ReactNode;
  /** Under its name at every size, the smallest too: the cruise and the
   *  clearance's verdict (ProfileLine). */
  sub?: ReactNode;
  line: ReactNode;
  /** What the pilot's own altitude breaks, the engine's words with their
   *  rules (own_altitude_caution: over the airplane's service ceiling, the
   *  oxygen 14 CFR 91.211(a) asks: (a)(1) the crew past 30 minutes over
   *  12,500 ft MSL, (a)(2) the crew over 14,000, (a)(3) every occupant over
   *  15,000): said here under the head, where the
   *  Profile tab's mark points, and in sight through a dry run, which
   *  puts the route's box and its altitude away. A warning, never a
   *  limit (the owner, 2026-10-23). */
  cautions?: string[];
  onClose: () => void;
  /** The dry run's controls. */
  children: ReactNode;
}) {
  return (
    // Half way no taller than what is in sight of the card: its drawer is
    // laid out at its full height and slid by the Drawer's own snap offset
    // (--sheet-offset, CardStack; negative from the top), so the graph's
    // max-h-full is the room in sight only with the card held to the
    // height less that offset.
    <div
      className="flex min-h-0 flex-1 flex-col px-4 pt-[var(--corner-inset,0.75rem)] in-data-[panel=half]:max-h-[calc(100%-max(var(--sheet-offset,0px),-1*var(--sheet-offset,0px)))] print:hidden"
      data-testid="profile-card"
    >
      <CardHead
        name={name}
        sub={sub}
        line={line}
        nameTestId="profile-name"
        onClose={onClose}
        onShare="profile"
        closeTestId="profile-close"
      />
      <ProfileCautions cautions={cautions} className="mt-2" />
      {/* As tall as the card has room for over the route's figures, no
          taller: held at 160, it ran under them where the name took two
          lines at the owner's larger text, the graph's foot behind the
          figures (the owner's screenshot); what it holds scrolls. Its
          skeleton as tall while the ground is fetched (MiniProfile). */}
      <div className="mt-3 flex min-h-0 flex-1 flex-col [&_[data-testid=mini-profile-skeleton]]:h-full [&_[data-testid=mini-profile]]:h-full">
        {children}
      </div>
    </div>
  );
}

/** What the pilot's own altitude breaks (ProfileCard's `cautions`), the
 *  engine's words: under the Profile tab's rules (FplTabs) and a dry run's
 *  card's head. */
export function ProfileCautions({ cautions, className }: { cautions: string[]; className?: string }) {
  if (!cautions.length) return null;
  return (
    <ul
      className={cn("shrink-0 space-y-1 rounded-lg bg-caution-wash px-2.5 py-2 text-caution-ink", TEXT.detail, className)}
      data-testid="profile-cautions"
    >
      {cautions.map((reason) => (
        <li key={reason} className="flex gap-1.5">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>{reason}</span>
        </li>
      ))}
    </ul>
  );
}
