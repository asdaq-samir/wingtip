import { useEffect } from "react";
import { openAirplaneProfile, useProfileOpen } from "../../lib/airplane/profileStore";
import { useAddress } from "../../lib/address";

/**
 * The airplane card open by its N-number in the address (the owner,
 * 2026-11-09: every card its own URL, linkable and bookmarkable), as an
 * airport's card is (`place`): a link with `airplane=` opens that
 * N-number's card, and opening or closing one writes it, in place of the
 * address's last, as every panel change is (lib/backNavigation). One card
 * an airplane (the owner, 2026-11-26): an N-number opened here puts away
 * another airplane's open by its ICAO address (`flight`) and its past
 * flight; the card itself sets `flight` to its own once it is in the air.
 */
export function useProfileAddress() {
  // The address's key for the card open: `?airplane=N3429J`.
  const [{ airplane: linked }, setAddress] = useAddress();
  const tail = useProfileOpen((s) => s.open?.tail ?? null);
  // A link's card opened as the page lands on it, or as Back comes to it.
  useEffect(() => {
    if (linked && linked.toUpperCase() !== useProfileOpen.getState().open?.tail) openAirplaneProfile(linked);
  }, [linked]);
  // The card open said in the address; put away, the key let go. Opened here,
  // not from the link, it is the one airplane card: another's let go.
  useEffect(() => {
    void setAddress((now) => {
      if ((now.airplane?.toUpperCase() ?? null) === tail) return {};
      return tail ? { airplane: tail, flight: null, past: null } : { airplane: null };
    });
  }, [tail, setAddress]);
}
